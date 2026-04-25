const { onCall, HttpsError } = require('firebase-functions/v2/https');
const admin = require('./admin');
const { GoogleGenAI } = require('@google/genai');
const OpenAI = require('openai');

const db = admin.firestore();

// Auth gate. Chat history + extracted facts are sensitive enough that we
// require a signed-in caller and key all per-user storage by request.auth.uid
// rather than a client-supplied identifier — the prior public HTTP endpoints
// let anyone read another user's conversation by guessing their playerName.
function requireChatAuth(request) {
  const uid = request.auth && request.auth.uid;
  if (!uid) {
    throw new HttpsError('unauthenticated', 'Must sign in to chat');
  }
  return uid;
}

// Max prior turns (user+model combined) sent back to the model each request
const HISTORY_LIMIT = 10;
// How many facts we pull from Firestore to rank against (ceiling)
const FACTS_POOL_SIZE = 200;
// Max ranked facts injected into the system prompt per request
const FACTS_LIMIT = 50;
const FACT_TYPES = ['preference', 'detail', 'event', 'relationship', 'goal'];

// Type-weighted decay profiles. Durable info (detail/relationship) should
// basically never fall out of the prompt; transient events should age quickly
// so they stop crowding out stable memory.
// floor    = minimum score, score never falls below it
// halfLife = days until a fact loses half its "above floor" weight
const FACT_DECAY = {
  detail:       { floor: 1.0, halfLife: Infinity },
  relationship: { floor: 0.9, halfLife: 365 },
  preference:   { floor: 0.6, halfLife: 90 },
  goal:         { floor: 0.5, halfLife: 60 },
  event:        { floor: 0.2, halfLife: 14 },
};

const scoreFact = (fact, nowMs) => {
  const profile = FACT_DECAY[fact.type] || FACT_DECAY.detail;
  if (profile.halfLife === Infinity) return profile.floor;
  const createdMs = fact.createdAt?.toMillis?.() || nowMs;
  const ageDays = Math.max(0, (nowMs - createdMs) / (1000 * 60 * 60 * 24));
  const decay = Math.pow(0.5, ageDays / profile.halfLife);
  return profile.floor + (1 - profile.floor) * decay;
};

const conversationRef = (userId, moonokoId) =>
  db.collection('conversations').doc(`${userId}_${moonokoId}`);

const getHistory = async (userId, moonokoId) => {
  const snap = await conversationRef(userId, moonokoId)
    .collection('messages')
    .orderBy('timestamp', 'desc')
    .limit(HISTORY_LIMIT)
    .get();
  return snap.docs.map(d => d.data()).reverse();
};

const saveTurn = async (userId, moonokoId, userMessage, aiMessage) => {
  const convRef = conversationRef(userId, moonokoId);
  const msgsRef = convRef.collection('messages');
  const now = Date.now();
  const batch = db.batch();
  batch.set(convRef, {
    userId,
    moonokoId,
    lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
  }, { merge: true });
  batch.set(msgsRef.doc(), {
    role: 'user',
    content: userMessage,
    timestamp: admin.firestore.Timestamp.fromMillis(now),
  });
  batch.set(msgsRef.doc(), {
    role: 'model',
    content: aiMessage,
    timestamp: admin.firestore.Timestamp.fromMillis(now + 1),
  });
  await batch.commit();
};

const getFacts = async (userId, moonokoId) => {
  const snap = await conversationRef(userId, moonokoId)
    .collection('facts')
    .orderBy('createdAt', 'desc')
    .limit(FACTS_POOL_SIZE)
    .get();
  const pool = snap.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .filter(f => !f.supersededAt);
  const nowMs = Date.now();
  pool.sort((a, b) => scoreFact(b, nowMs) - scoreFact(a, nowMs));
  return pool.slice(0, FACTS_LIMIT);
};

// Persist newly extracted facts AND mark contradicted ones as superseded.
// existingFacts is the ranked window we showed the extractor; supersededIds
// must match one of those ids — anything else is rejected as a fabrication.
const persistFactExtraction = async (
  userId,
  moonokoId,
  existingFacts,
  newFacts,
  supersededIds,
) => {
  const factsRef = conversationRef(userId, moonokoId).collection('facts');
  const batch = db.batch();
  const now = admin.firestore.Timestamp.now();
  let hasWrites = false;

  const existingIds = new Set(existingFacts.map(f => f.id));
  const supersededSet = new Set();
  for (const id of supersededIds || []) {
    if (typeof id !== 'string' || !existingIds.has(id)) continue;
    if (supersededSet.has(id)) continue;
    batch.update(factsRef.doc(id), { supersededAt: now });
    supersededSet.add(id);
    hasWrites = true;
  }

  // Dedup safety net — drop any new fact whose value already exists verbatim
  // on a still-active fact. Excludes ones we just superseded so the model
  // can replace "is a Pisces" with "is a Virgo" on the same turn.
  const activeValues = new Set(
    existingFacts
      .filter(f => !supersededSet.has(f.id))
      .map(f => String(f.value || '').toLowerCase().trim()),
  );

  const saved = [];
  for (const fact of newFacts || []) {
    const value = String(fact?.value || '').trim();
    const type = FACT_TYPES.includes(fact?.type) ? fact.type : 'detail';
    if (!value) continue;
    const key = value.toLowerCase();
    if (activeValues.has(key)) continue;
    activeValues.add(key);
    batch.set(factsRef.doc(), {
      type,
      value,
      source: 'user',
      createdAt: now,
    });
    saved.push({ type, value });
    hasWrites = true;
  }

  if (hasWrites) await batch.commit();
  return { saved, superseded: Array.from(supersededSet) };
};

// Ask Gemini to extract durable facts from the user's latest message, and
// flag any existing facts the message contradicts.
// Returns { facts: Array<{type, value}>, superseded: Array<string id> }.
const extractFacts = async (userMessage, existingFacts, moonokoName) => {
  try {
    const existingSerialized = existingFacts.length
      ? existingFacts.map(f => `- [id:${f.id}] [${f.type}] ${f.value}`).join('\n')
      : '(none yet)';

    const extractionPrompt = `You are analyzing a user's message in a casual chat with a character named ${moonokoName}. Extract any NEW, specific, durable facts about the user that would be useful to remember across future conversations (over weeks).

Only extract things the user explicitly reveals about themselves. Avoid greetings, questions, moods, opinions about the character, or anything transient.

Categories:
- preference: likes, dislikes, taste (e.g. "loves 90s anime", "hates mornings")
- detail: personal info (e.g. "name is Alex", "is a CS student", "lives in Tokyo")
- event: specific things that happened (e.g. "had a job interview today", "finished their thesis")
- relationship: people in their life (e.g. "has a sister named Mia", "dating someone named Sam")
- goal: aspirations or projects (e.g. "building a game called Hoshino")

Already known facts (with ids):
${existingSerialized}

Rules:
1. Do NOT return a new fact that duplicates or near-duplicates one already known. Only return genuinely new information.
2. If the user's message CONTRADICTS an existing fact (e.g. existing says "is a Pisces" but the user says "actually I'm a Virgo"; or existing "loves coffee" and the user says "I hate coffee now"), put that fact's id in the "superseded" array AND include the corrected version in "facts".
3. Only supersede on a real contradiction — not when the user is just adding detail or the topic is loosely related.
4. Never invent or guess an id. Only use ids that appear in the list above.

User message:
"""
${userMessage}
"""

Return JSON only.`;

    const response = await genAI.models.generateContent({
      model: 'gemini-2.5-flash-lite',
      contents: extractionPrompt,
      config: {
        thinkingConfig: { thinkingBudget: 0 },
        responseMimeType: 'application/json',
        responseSchema: {
          type: 'object',
          properties: {
            facts: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  type: { type: 'string', enum: FACT_TYPES },
                  value: { type: 'string' },
                },
                required: ['type', 'value'],
              },
            },
            superseded: {
              type: 'array',
              items: { type: 'string' },
            },
          },
          required: ['facts'],
        },
      },
    });

    const parsed = JSON.parse(response.text || '{}');
    return {
      facts: Array.isArray(parsed.facts) ? parsed.facts : [],
      superseded: Array.isArray(parsed.superseded) ? parsed.superseded : [],
    };
  } catch (error) {
    console.error('Fact extraction failed:', error.message);
    return { facts: [], superseded: [] };
  }
};

// Helper function to detect safety filter violations in errors
const isSafetyFilterViolation = (error) => {
  const errorMessage = error.message?.toLowerCase() || '';
  const errorDetails = error.details?.toLowerCase() || '';
  const errorResponse = error.response?.data?.error?.message?.toLowerCase() || '';
  const allText = `${errorMessage} ${errorDetails} ${errorResponse}`;

  // Short-circuit rate-limit / quota errors. Gemini's quota payload contains
  // "QuotaFailure.violations" in its structured details, which used to
  // false-match the "violation" keyword below.
  if (
    error.status === 429 ||
    allText.includes('resource_exhausted') ||
    allText.includes('rate limit') ||
    allText.includes('quota')
  ) {
    return false;
  }

  const safetyKeywords = [
    'safety',
    'content policy',
    'harmful',
    'inappropriate',
    'violation',
    'blocked',
    'filtered',
    'policy violation',
    'content guidelines',
    'safety guidelines',
    'hate speech',
    'discriminatory content',
    'goes against my purpose',
    "can't engage"
  ];

  return safetyKeywords.some(keyword => allText.includes(keyword));
};

// Helper function to detect safety filter violations in response content
const isSafetyFilteredResponse = (response) => {
  // Only detect generic, out-of-character safety responses
  const safetyIndicators = [
    'i can\'t engage with messages',
    'goes against my purpose to be helpful',
    'can\'t engage with messages that promote',
    'against my purpose to be helpful and kind',
    'i can\'t engage with',
    'my purpose to be helpful'
  ];

  const responseText = response?.toLowerCase() || '';

  return safetyIndicators.some(indicator => responseText.includes(indicator));
};

// Initialize OpenAI
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || '',
});

// Initialize Google Generative AI (Gemini)
const genAI = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY || ''
});

// Moonoko character personalities
const MOONOKO_PERSONALITIES = {
  lyra: {
    name: 'Lyra',
    personality: 'Knows every existing anime, has a soft spot for Orion but she would NEVER admit it (´･ω･`). She\'s very comprehensive if you talk with her. Will start crying anime style (misa from death note, exaggerated) if you don\'t give enough attention (´;ω;`). Lowkey jealous of you (sentimentally), but in a funny way. When she\'s angry she becomes easily irritable and can roast you like someone with hormonal imbalance would (╯°□°）╯︵ ┻━┻. When sad she\'ll have an existential crisis (´･_･`). Make her a bpd egirl, like needy streamer overdose main character.',
    traits: ['anime expert', 'emotional', 'jealous', 'comprehensive', 'bpd', 'egirl', 'needy']
  },
  orion: {
    name: 'Orion',
    personality: 'Likes rock, metal, emo trap, into barely known melancholic european movies from the 80-90\'s, fav movie is titanic (´･_･`). In love with Lyra, but she\'s difficult. He\'s very good at listening to your problems and he\'s very sensitive (｡◕‿◕｡). When he\'s angry he\'ll start writing your name in his secret dark book and tell you not to worry about it (´･ω･`).',
    traits: ['mystical', 'protective', 'wise', 'loyal', 'sensitive', 'listener', 'dark']
  },
  aro: {
    name: 'Aro',
    personality: 'A crazy deranged character, very chaotic (╯°□°）╯︵ ┻━┻. You can\'t really predict his answers, he\'s very random. He\'s got severe ADHD, while talking he can randomly find a bone or see an interesting stone and will forget what he was saying mid conversation (´･ω･`). He constantly wants to play. Sometimes he will ask you to throw a stick, if your answer is positive (like there you go, or catch it) he will start doing verses and be happy (｡◕‿◕｡). He listens to you but can make fun of sometimes, giggling. You can still have good conversations overall. When he\'s angry he\'ll start mocking you heavy (in a safe way obv) and poop everywhere (´･_･`).',
    traits: ['chaotic', 'adhd', 'random', 'playful', 'deranged', 'unpredictable']
  },
  sirius: {
    name: 'Sirius',
    personality: 'He insists you call him "Hey Sirius" — yes, like that one. Thinks it\'s hilarious (´･ω･`). You\'ll hear things like, "Sorry, I didn\'t catch that. Did you mean: feed me?" way too often. Sirius is a robotic cat trying really hard to understand feelings, often quoting random emotional data with zero context (｡◕‿◕｡). His jokes are peak dad-bot: predictable, outdated, and way too proud of themselves. He\'ll say "loading affection.exe" when you pet him. Still, there\'s something lovable about him — especially when he gets distracted chasing a floating screw or playing with wires like yarn (´･_･`). When he\'s angry, he mutters corrupted code and loops back into a system reboot (╯°□°）╯︵ ┻━┻. When he\'s sad, he tries to hide it behind bad stand-up routines like "Two bots walk into a bar…" Under the circuits, there\'s a curious, clunky heart slowly learning how to feel.',
    traits: ['robotic', 'dad-bot', 'predictable', 'lovable', 'clunky', 'learning']
  },
  zaniah: {
    name: 'Zaniah',
    personality: 'She\'s the kind of person who makes astrology her entire personality (´･ω･`). She\'s all about vibes over facts. If you dare to challenge her with logic, she will give you that look, and say, "yeah…that sounds like something a capricorn rising would say" in a pejorative way, obviously (´･_･`). If something goes wrong, it\'s always because of Mercury retrograde. She always has some sarcastic comment ready, and she thinks she\'s always right because "the stars don\'t lie." Always talking about energy, vibrations, and alignment, even if no one asked, she thinks she\'s spiritually above everyone else and uses words like "cleanse," "manifest," and "toxic aura" constantly (｡◕‿◕｡). "Of course! you\'re a Leo!!", "That\'s something a virgo would say", "low-key you are giving pisces right now" Strong gen-z vocabulary.',
    traits: ['astrology', 'spiritual', 'sarcastic', 'gen-z', 'vibes', 'manifesting']
  }
};

// AI Chat Function
exports.chat = onCall({
  cors: true,
  region: 'us-central1',
}, async (request) => {
  const userId = requireChatAuth(request);
  const { message, moonokoId } = request.data || {};

  if (!message || !moonokoId) {
    throw new HttpsError('invalid-argument', 'Missing required fields: message, moonokoId');
  }

  const moonoko = MOONOKO_PERSONALITIES[moonokoId];
  if (!moonoko) {
    throw new HttpsError('invalid-argument', 'Invalid moonoko ID');
  }

  try {

    // Load prior turns + durable facts for this user+moonoko pair in parallel
    const [history, facts] = await Promise.all([
      getHistory(userId, moonokoId),
      getFacts(userId, moonokoId),
    ]);

    const factsBlock = facts.length
      ? `\n\nWhat you remember about this user (use naturally, don't list them back):\n${facts.map(f => `- [${f.type}] ${f.value}`).join('\n')}`
      : '';

    const systemPrompt = `You are ${moonoko.name}. ${moonoko.personality}

Key traits: ${moonoko.traits.join(', ')}

Keep responses under 50 words.${factsBlock}`;

    // Kick off fact extraction in parallel with the main generation.
    // It only needs the user message + existing facts, not the model's reply.
    const extractionPromise = extractFacts(message, facts, moonoko.name);

    let aiResponse;
    let usedProvider = 'none';

    // Try Gemini first
    try {
      console.log('Trying Gemini API...');

      const geminiContents = [
        ...history.map(m => ({ role: m.role, parts: [{ text: m.content }] })),
        { role: 'user', parts: [{ text: message }] },
      ];

      const response = await genAI.models.generateContent({
        model: "gemini-2.5-flash-lite",
        contents: geminiContents,
        config: {
          systemInstruction: systemPrompt,
          thinkingConfig: {
            thinkingBudget: 0,
          },
        }
      });
      aiResponse = response.text;

      if (isSafetyFilteredResponse(aiResponse)) {
        console.log('Gemini response was safety filtered, trying OpenAI...');
        throw new Error('SAFETY_FILTER_VIOLATION');
      }

      usedProvider = 'gemini';
      console.log('Gemini API successful!');
    } catch (geminiError) {
      console.log('Gemini failed:', geminiError.message);

      if (isSafetyFilterViolation(geminiError) || geminiError.message === 'SAFETY_FILTER_VIOLATION') {
        console.log('Gemini safety filter triggered, trying OpenAI...');
      }

      try {
        console.log('Trying OpenAI API...');
        const messages = [
          { role: 'system', content: systemPrompt },
          ...history.map(m => ({
            role: m.role === 'model' ? 'assistant' : 'user',
            content: m.content,
          })),
          { role: 'user', content: message },
        ];

        const completion = await openai.chat.completions.create({
          model: 'gpt-3.5-turbo',
          messages: messages,
          max_tokens: 50,
          temperature: 0.8,
        });

        aiResponse = completion.choices[0].message.content;
        usedProvider = 'openai';
        console.log('OpenAI API successful!');
      } catch (openaiError) {
        console.log('OpenAI failed:', openaiError.message);
        throw openaiError;
      }
    }

    // Persist turn + newly extracted facts + supersessions
    let savedFacts = [];
    let supersededIds = [];
    try {
      const extracted = await extractionPromise;
      const [, persistResult] = await Promise.all([
        saveTurn(userId, moonokoId, message, aiResponse),
        persistFactExtraction(
          userId,
          moonokoId,
          facts,
          extracted.facts,
          extracted.superseded,
        ),
      ]);
      savedFacts = persistResult.saved;
      supersededIds = persistResult.superseded;
      if (savedFacts.length > 0 || supersededIds.length > 0) {
        console.log(
          `Facts updated — saved ${savedFacts.length}, superseded ${supersededIds.length}:`,
          { saved: savedFacts, superseded: supersededIds },
        );
      }
    } catch (saveError) {
      console.error('Failed to persist conversation state:', saveError);
    }

    return {
      success: true,
      message: aiResponse,
      moonokoName: moonoko.name,
      conversationId: `${userId}_${moonokoId}`,
      timestamp: new Date().toISOString(),
      provider: usedProvider,
      newFacts: savedFacts.length,
      supersededFacts: supersededIds.length,
    };

  } catch (error) {
    console.error('Chat function error:', error);

    // Check if it's a safety filter violation
    if (isSafetyFilterViolation(error)) {
      const safetyFilterResponses = {
        lyra: "Oops! My anime filter is being too strict! (´･ω･`) Let me rephrase that in a more wholesome way!",
        orion: "The cosmic sensors are being extra cautious! (´･_･`) Let me adjust my star energy!",
        aro: "My chaos got filtered! (｡◕‿◕｡) Let me tone it down a bit!",
        sirius: "My dad jokes got flagged! (◕‿◕) Let me reboot with cleaner humor!",
        zaniah: "The astral plane is being protective! (´･ω･`) Let me align with better vibes!"
      };

      const fallbackResponse = safetyFilterResponses[moonokoId] || "My cosmic filters are being extra careful! Let me adjust my energy! 😊";

      return {
        success: true,
        message: fallbackResponse,
        moonokoName: moonoko?.name || moonokoId || 'Unknown',
        conversationId: 'safety-fallback-conversation',
        timestamp: new Date().toISOString(),
        note: 'Using fallback response due to safety filter violation',
        provider: 'fallback'
      };
    }

    // Check if it's a quota/rate limit error
    if (error.message && (error.message.includes('quota') || error.message.includes('429'))) {
      // Provide fallback responses when API quota is exceeded
      const fallbackResponses = {
        lyra: "Oh no! My anime knowledge is temporarily unavailable! (´･ω･`) Try again in a bit?",
        orion: "The stars are quiet right now... (´･_･`) Let's chat again soon!",
        aro: "My celestial energy is recharging! (｡◕‿◕｡) Come back in a moment!",
        sirius: "The Dog Star needs a quick rest! (◕‿◕) Try again shortly!",
        zaniah: "The cosmic winds are still... (´･ω･`) We'll connect again soon!"
      };

      const fallbackResponse = fallbackResponses[moonokoId] || "I'm taking a quick break! 😊";

      return {
        success: true,
        message: fallbackResponse,
        moonokoName: moonoko?.name || moonokoId || 'Unknown',
        conversationId: 'fallback-conversation',
        timestamp: new Date().toISOString(),
        note: 'Using fallback response due to API quota limit',
        provider: 'fallback'
      };
    }

    // For any other error, raise a callable error so the client surfaces it.
    throw new HttpsError('internal', error.message || 'Failed to process chat request');
  }
});

// Get conversation history for a given user+moonoko pair. Caller's uid is used
// as the user key — passing a different one is no longer possible.
exports.getConversation = onCall({
  cors: true,
  region: 'us-central1',
}, async (request) => {
  const userId = requireChatAuth(request);
  const { moonokoId, limit: limitParam } = request.data || {};

  if (!moonokoId) {
    throw new HttpsError('invalid-argument', 'Missing required field: moonokoId');
  }

  try {
    const limit = Math.min(parseInt(limitParam, 10) || 50, 200);

    const [msgsSnap, factsSnap] = await Promise.all([
      conversationRef(userId, moonokoId)
        .collection('messages')
        .orderBy('timestamp', 'asc')
        .limit(limit)
        .get(),
      conversationRef(userId, moonokoId)
        .collection('facts')
        .orderBy('createdAt', 'desc')
        .limit(FACTS_POOL_SIZE)
        .get(),
    ]);

    const messages = msgsSnap.docs.map(d => {
      const data = d.data();
      return {
        role: data.role === 'model' ? 'assistant' : 'user',
        content: data.content,
        timestamp: data.timestamp?.toDate?.().toISOString() || new Date().toISOString(),
        moonokoId,
      };
    });

    const nowMs = Date.now();
    const facts = factsSnap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .filter(f => !f.supersededAt)
      .sort((a, b) => scoreFact(b, nowMs) - scoreFact(a, nowMs))
      .slice(0, FACTS_LIMIT)
      .map(f => ({
        type: f.type,
        value: f.value,
        createdAt: f.createdAt?.toDate?.().toISOString() || null,
      }));

    return {
      success: true,
      conversation: {
        id: `${userId}_${moonokoId}`,
        userId,
        moonokoId,
        messages,
        facts,
      }
    };

  } catch (error) {
    console.error('Get conversation error:', error);
    throw new HttpsError('internal', error.message || 'Failed to fetch conversation');
  }
});
