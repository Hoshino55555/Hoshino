const { onCall, HttpsError } = require('firebase-functions/v2/https');
const admin = require('./admin');
const engine = require('./game-state-engine');
const { makeForagingRng } = require('./foraging-rng');

const REGION = 'us-central1';

// Lazy-init so the RNG isn't constructed at module load (and can't throw before
// the function body runs, which confuses Firebase error surfaces).
let _foragingRng;
function getForagingOpts() {
  if (!_foragingRng) _foragingRng = makeForagingRng();
  return { randomBytes: _foragingRng.randomBytes };
}

function requireAuth(request) {
  const uid = request.auth && request.auth.uid;
  if (!uid) {
    throw new HttpsError('unauthenticated', 'Must sign in to access game state');
  }
  return uid;
}

function stateRef(uid, characterId) {
  return admin
    .firestore()
    .collection('users')
    .doc(uid)
    .collection('moonokos')
    .doc(characterId);
}

async function loadOrDefault(uid, characterId, nowMs, fallbackTz) {
  const snap = await stateRef(uid, characterId).get();
  if (snap.exists) {
    const state = snap.data();
    // First-time timezone write wins until user changes it.
    if (fallbackTz && !state.timezone) {
      state.timezone = fallbackTz;
    }
    return state;
  }
  return engine.defaultState(characterId, nowMs, fallbackTz);
}

async function saveState(uid, characterId, state) {
  await stateRef(uid, characterId).set(state, { merge: false });
}

function validateCharacterId(characterId) {
  if (typeof characterId !== 'string' || !characterId.trim()) {
    throw new HttpsError('invalid-argument', 'characterId required');
  }
  return characterId.trim();
}

function validTimezone(tz) {
  if (typeof tz !== 'string' || !tz) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch (_e) {
    return false;
  }
}

const COMMON_OPTS = { cors: true, region: REGION };

exports.getGameState = onCall(COMMON_OPTS, async (request) => {
  const uid = requireAuth(request);
  const characterId = validateCharacterId(request.data && request.data.characterId);
  const tz = request.data && request.data.timezone;
  const nowMs = Date.now();

  let state = await loadOrDefault(uid, characterId, nowMs, validTimezone(tz) ? tz : undefined);
  const resolved = engine.resolve(state, nowMs, getForagingOpts());
  if (resolved !== state) {
    await saveState(uid, characterId, resolved);
  }
  return { state: resolved };
});

exports.setTimezone = onCall(COMMON_OPTS, async (request) => {
  const uid = requireAuth(request);
  const characterId = validateCharacterId(request.data && request.data.characterId);
  const tz = request.data && request.data.timezone;
  if (!validTimezone(tz)) {
    throw new HttpsError('invalid-argument', 'Invalid IANA timezone');
  }
  const nowMs = Date.now();
  const state = await loadOrDefault(uid, characterId, nowMs, tz);
  const next = { ...engine.resolve(state, nowMs), timezone: tz };
  await saveState(uid, characterId, next);
  return { state: next };
});

exports.feedMoonoko = onCall(COMMON_OPTS, async (request) => {
  const uid = requireAuth(request);
  const characterId = validateCharacterId(request.data && request.data.characterId);
  const hungerBoost = Number(request.data && request.data.hungerBoost) || 0;
  const moodBoost = Number(request.data && request.data.moodBoost) || 0;
  if (hungerBoost < 0 || hungerBoost > 3) {
    throw new HttpsError('invalid-argument', 'Hunger boost must be 0-3 per feeding');
  }
  if (moodBoost < 0 || moodBoost > 5) {
    throw new HttpsError('invalid-argument', 'Mood boost must be 0-5');
  }
  const tz = request.data && request.data.timezone;
  const nowMs = Date.now();
  const state = await loadOrDefault(uid, characterId, nowMs, validTimezone(tz) ? tz : undefined);

  let next;
  try {
    next = engine.applyFeed(state, nowMs, hungerBoost, moodBoost, getForagingOpts());
  } catch (e) {
    throw new HttpsError('failed-precondition', e.message);
  }
  await saveState(uid, characterId, next);
  return { state: next };
});

exports.recordPlay = onCall(COMMON_OPTS, async (request) => {
  const uid = requireAuth(request);
  const characterId = validateCharacterId(request.data && request.data.characterId);
  const nowMs = Date.now();
  const state = await loadOrDefault(uid, characterId, nowMs);
  let next;
  try {
    next = engine.applyPlay(state, nowMs, getForagingOpts());
  } catch (e) {
    throw new HttpsError('failed-precondition', e.message);
  }
  await saveState(uid, characterId, next);
  return { state: next };
});

exports.recordChat = onCall(COMMON_OPTS, async (request) => {
  const uid = requireAuth(request);
  const characterId = validateCharacterId(request.data && request.data.characterId);
  const nowMs = Date.now();
  const state = await loadOrDefault(uid, characterId, nowMs);
  let next;
  try {
    next = engine.applyChat(state, nowMs, getForagingOpts());
  } catch (e) {
    throw new HttpsError('failed-precondition', e.message);
  }
  await saveState(uid, characterId, next);
  return { state: next };
});

exports.startSleep = onCall(COMMON_OPTS, async (request) => {
  const uid = requireAuth(request);
  const characterId = validateCharacterId(request.data && request.data.characterId);
  const nowMs = Date.now();
  const state = await loadOrDefault(uid, characterId, nowMs);
  const next = engine.applyStartSleep(state, nowMs, getForagingOpts());
  await saveState(uid, characterId, next);
  return { state: next };
});

exports.endSleep = onCall(COMMON_OPTS, async (request) => {
  const uid = requireAuth(request);
  const characterId = validateCharacterId(request.data && request.data.characterId);
  const force = !!(request.data && request.data.force);
  const nowMs = Date.now();
  const state = await loadOrDefault(uid, characterId, nowMs);
  let next;
  try {
    next = engine.applyEndSleep(state, nowMs, { force });
  } catch (e) {
    if (e.code === 'sleep-in-progress') {
      throw new HttpsError('failed-precondition', e.message, {
        remainingMin: e.remainingMin,
      });
    }
    throw new HttpsError('failed-precondition', e.message);
  }
  await saveState(uid, characterId, next);
  return { state: next };
});

// Client pulls the foraging queue, server appends the current finds to the
// user's inventory, returns the drained state. Runs resolve() first so any
// ticks since last call also land in the same pull.
exports.drainForaged = onCall(COMMON_OPTS, async (request) => {
  const uid = requireAuth(request);
  const characterId = validateCharacterId(request.data && request.data.characterId);
  const nowMs = Date.now();
  const state = await loadOrDefault(uid, characterId, nowMs);
  const resolved = engine.resolve(state, nowMs, getForagingOpts());
  const finds = resolved.foragedItems || [];
  if (finds.length > 0) {
    // Append to inventory — ingredients as {id, count} aggregates.
    await admin.firestore().runTransaction(async (tx) => {
      const invRef = admin.firestore().collection('users').doc(uid).collection('inventory').doc('ingredients');
      const snap = await tx.get(invRef);
      const cur = snap.exists ? snap.data() : {};
      const counts = cur.counts || {};
      for (const f of finds) {
        counts[f.ingredient] = (counts[f.ingredient] || 0) + 1;
      }
      tx.set(invRef, { counts, updatedAt: nowMs }, { merge: true });
    });
  }
  const drained = engine.applyDrainForaged(resolved, nowMs);
  await saveState(uid, characterId, drained);
  return {
    state: drained,
    drained: finds, // for the recap banner — source + tier + ingredient
  };
});
