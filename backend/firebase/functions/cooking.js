// Cooking callable. Two modes:
//
// - 'manual' — user tosses an ingredient multiset into the pot. Server matches
//   against the catalog. On match (recipe), first-time discovery is recorded;
//   otherwise the result is slop. Ingredients are deducted either way.
//
// - 'recipe' — user taps a previously-discovered recipe. Server loads its
//   canonical ingredients, deducts from inventory, cooks. No discovery write.
//
// Both modes share the same "deduct inventory atomically + apply feed + return
// updated state" tail so the client treats them uniformly.

const { onCall, HttpsError } = require('firebase-functions/v2/https');
const admin = require('./admin');
const engine = require('./game-state-engine');
const catalog = require('./recipe-catalog');
const { makeForagingRngForUser } = require('./foraging-rng');

const REGION = 'us-central1';
const COMMON_OPTS = {
  cors: true,
  region: REGION,
  secrets: ['FORAGING_HMAC_SECRET', 'FORAGING_VRF_SIGNER_SECRET_KEY'],
};

function requireAuth(request) {
  const uid = request.auth && request.auth.uid;
  if (!uid) {
    throw new HttpsError('unauthenticated', 'Must sign in to cook');
  }
  return uid;
}

function validateCharacterId(characterId) {
  if (typeof characterId !== 'string' || !characterId.trim()) {
    throw new HttpsError('invalid-argument', 'characterId required');
  }
  return characterId.trim();
}

function validateIngredientList(ingredients) {
  if (!Array.isArray(ingredients) || ingredients.length === 0) {
    throw new HttpsError('invalid-argument', 'ingredients[] required');
  }
  if (ingredients.length > 10) {
    throw new HttpsError('invalid-argument', 'Too many ingredients (max 10 per cook)');
  }
  for (const ing of ingredients) {
    if (typeof ing !== 'string' || !catalog.isKnownIngredient(ing)) {
      throw new HttpsError('invalid-argument', `Unknown ingredient: ${ing}`);
    }
  }
  return ingredients;
}

function countMultiset(ingredients) {
  const m = {};
  for (const ing of ingredients) {
    m[ing] = (m[ing] || 0) + 1;
  }
  return m;
}

function stateRef(uid, characterId) {
  return admin
    .firestore()
    .collection('users')
    .doc(uid)
    .collection('moonokos')
    .doc(characterId);
}

function inventoryRef(uid) {
  return admin
    .firestore()
    .collection('users')
    .doc(uid)
    .collection('inventory')
    .doc('ingredients');
}

function cookingRef(uid) {
  return admin.firestore().collection('users').doc(uid).collection('cooking').doc('profile');
}

async function getForagingOpts(uid, nowMs) {
  const rng = await makeForagingRngForUser({
    uid,
    nowMs,
    firestore: admin.firestore(),
  });
  return { randomBytes: rng.randomBytes };
}

// Dual XP model. Player XP is cumulative season score — modifiers make good
// stat management visibly rewarded. Recipe progress is a subtler lever: the
// same mood/hunger modifiers push recipe leveling faster or slower, but the
// swing is narrow (±10%) so grinders don't trivially outpace casual players.
//
// moodMult : 1.0 (mood 0) → 1.5 (mood 5)    — 0.1 per point
// hungerMult : 0.5 (hunger 0) → 1.0 (hunger 5) — 0.1 per point
// stats are clamped 1..5 in gameplay, so practical ranges are 1.1..1.5 and 0.6..1.0
function moodMultiplier(mood) {
  return 1 + 0.1 * Math.max(0, Math.min(5, mood || 0));
}
function hungerMultiplier(hunger) {
  return 0.5 + 0.1 * Math.max(0, Math.min(5, hunger || 0));
}

// Recipe level derives from cumulative cook progress. 3 points per level, no
// cap. Each level adds +10% to the recipe's contribution to player XP — so
// repeat-cooking a recipe slowly makes it a bigger fraction of the season
// score without overriding the base-points tier ordering.
const RECIPE_LEVEL_STEP = 3;
function recipeLevelFromProgress(progress) {
  return 1 + Math.floor((progress || 0) / RECIPE_LEVEL_STEP);
}

// Recipe progress gain per cook. Baseline is 1 per cook; the combined mood×
// hunger multiplier nudges it ±10% so better-managed cooks level recipes a
// touch faster. Compressed by 0.2 so the swing stays subtle vs the bigger
// swing applied to player XP.
function recipeProgressDelta(moodMult, hungerMult) {
  return 1 + 0.2 * (moodMult * hungerMult - 1);
}

// Core cook transaction: inside a single Firestore txn we
//   1. confirm the inventory can cover the ingredient multiset,
//   2. deduct the ingredients,
//   3. record the discovery if this is a first-time match,
//   4. apply the feed to the character state (with computed player XP),
//   5. bump the per-recipe progress counter,
//   6. return the updated surfaces (state, inventory, cooking profile, result).
async function runCookTransaction({ uid, characterId, ingredients, recipe, nowMs, tz }) {
  const firestore = admin.firestore();
  const stateDoc = stateRef(uid, characterId);
  const invDoc = inventoryRef(uid);
  const cookDoc = cookingRef(uid);

  const needed = countMultiset(ingredients);
  const rewards = recipe ? catalog.recipeRewards(recipe) : catalog.SLOP_REWARD;

  // Foraging RNG is resolved outside the txn — its own I/O (Firestore writes
  // for VRF cache, potential Solana RPC) can't run inside a transaction.
  const opts = await getForagingOpts(uid, nowMs);

  return firestore.runTransaction(async (tx) => {
    // --- inventory check + deduct ---
    const invSnap = await tx.get(invDoc);
    const invData = invSnap.exists ? invSnap.data() : {};
    const counts = { ...(invData.counts || {}) };
    for (const [ing, n] of Object.entries(needed)) {
      if ((counts[ing] || 0) < n) {
        throw new HttpsError(
          'failed-precondition',
          `Not enough ${ing} (need ${n}, have ${counts[ing] || 0})`
        );
      }
    }
    for (const [ing, n] of Object.entries(needed)) {
      counts[ing] -= n;
      if (counts[ing] === 0) delete counts[ing];
    }

    // --- cooking profile (discovery + per-recipe progress) ---
    const cookSnap = await tx.get(cookDoc);
    const cookData = cookSnap.exists ? cookSnap.data() : {};
    const discovered = Array.isArray(cookData.discoveredRecipes)
      ? [...cookData.discoveredRecipes]
      : [];
    const recipeProgress = { ...(cookData.recipeProgress || {}) };
    let firstDiscovery = false;
    if (recipe && !discovered.includes(recipe.id)) {
      discovered.push(recipe.id);
      firstDiscovery = true;
    }

    // --- load state + compute modifiers + player XP ---
    const stateSnap = await tx.get(stateDoc);
    const currentState = stateSnap.exists
      ? stateSnap.data()
      : engine.defaultState(characterId, nowMs, tz);
    // Pre-resolve to read the pre-feed mood/hunger that drive the multipliers.
    // applyFeed re-resolves internally, which is idempotent at the same nowMs.
    const preResolved = engine.resolve(currentState, nowMs, opts);
    const moodMult = moodMultiplier(preResolved.mood);
    const hungerMult = hungerMultiplier(preResolved.hunger);
    const preLevel = recipe
      ? recipeLevelFromProgress(recipeProgress[recipe.id] || 0)
      : 1;
    // Slop has no recipe level bonus — the 0.0x-0.9x combined modifier still
    // tugs on its player xp so the stats matter, but there's no level track.
    const recipeLevelBonus = recipe ? 1 + 0.1 * (preLevel - 1) : 1;
    const playerXp = Math.max(
      0,
      Math.round(rewards.basePoints * recipeLevelBonus * moodMult * hungerMult)
    );

    let next;
    try {
      next = engine.applyFeed(
        currentState,
        nowMs,
        rewards.hungerBoost,
        rewards.moodBoost,
        { ...opts, xp: playerXp }
      );
    } catch (e) {
      throw new HttpsError('failed-precondition', e.message);
    }

    // --- bump recipe progress (recipes only; slop does not level any dish) ---
    let postLevel = preLevel;
    let postProgress = recipeProgress[recipe ? recipe.id : ''] || 0;
    if (recipe) {
      const delta = recipeProgressDelta(moodMult, hungerMult);
      postProgress = postProgress + delta;
      recipeProgress[recipe.id] = postProgress;
      postLevel = recipeLevelFromProgress(postProgress);
    }

    // --- writes ---
    tx.set(stateDoc, next, { merge: false });
    tx.set(invDoc, { counts, updatedAt: nowMs }, { merge: true });
    tx.set(
      cookDoc,
      {
        discoveredRecipes: discovered,
        recipeProgress,
        updatedAt: nowMs,
      },
      { merge: true }
    );

    return {
      state: next,
      inventory: { counts },
      cooking: { discoveredRecipes: discovered, recipeProgress },
      result: {
        kind: recipe ? 'recipe' : 'slop',
        recipeId: recipe ? recipe.id : null,
        recipeName: recipe ? recipe.name : null,
        firstDiscovery,
        hungerBoost: rewards.hungerBoost,
        moodBoost: rewards.moodBoost,
        basePoints: rewards.basePoints,
        xp: playerXp,
        level: postLevel,
        recipeProgress: recipe ? postProgress : null,
        moodMult,
        hungerMult,
        ingredientsUsed: ingredients,
      },
    };
  });
}

// Callable: cook({ characterId, mode, ingredients?, recipeId?, timezone? })
//
// - mode='manual': ingredients[] is the pot. Server re-matches against the
//   catalog; match → recipe (+ discovery), no match → slop. Either way the
//   ingredients are consumed.
//
// - mode='recipe': recipeId references a *previously discovered* recipe. We
//   load the canonical ingredients from the catalog and cook them. Attempting
//   to one-tap an undiscovered recipe is rejected — the client should only
//   surface discovered recipes, so this is also a tamper check.
exports.cook = onCall(COMMON_OPTS, async (request) => {
  const uid = requireAuth(request);
  const data = request.data || {};
  const characterId = validateCharacterId(data.characterId);
  const mode = data.mode;
  const tz = typeof data.timezone === 'string' ? data.timezone : undefined;
  const nowMs = Date.now();

  let ingredients;
  let recipe;

  if (mode === 'manual') {
    ingredients = validateIngredientList(data.ingredients);
    recipe = catalog.matchRecipe(ingredients);
  } else if (mode === 'recipe') {
    if (typeof data.recipeId !== 'string' || !data.recipeId.trim()) {
      throw new HttpsError('invalid-argument', 'recipeId required for recipe mode');
    }
    recipe = catalog.getRecipeById(data.recipeId.trim());
    if (!recipe) {
      throw new HttpsError('not-found', `Unknown recipeId: ${data.recipeId}`);
    }
    // Server-side tamper check: the client should only surface discovered
    // recipes, so a recipe-mode call for an undiscovered id means either a
    // stale client or tampering. Reject.
    const cookSnap = await cookingRef(uid).get();
    const discovered = (cookSnap.exists && cookSnap.data().discoveredRecipes) || [];
    if (!discovered.includes(recipe.id)) {
      throw new HttpsError(
        'failed-precondition',
        'Recipe not yet discovered — use manual cook first'
      );
    }
    ingredients = [...recipe.ingredients];
  } else {
    throw new HttpsError('invalid-argument', "mode must be 'manual' or 'recipe'");
  }

  return runCookTransaction({ uid, characterId, ingredients, recipe, nowMs, tz });
});

// Read-only endpoints — fetch inventory and cooking profile without cooking.
// The client uses these to populate the pantry + recipe book on screen open.

exports.getInventory = onCall(COMMON_OPTS, async (request) => {
  const uid = requireAuth(request);
  const snap = await inventoryRef(uid).get();
  const data = snap.exists ? snap.data() : {};
  return { counts: data.counts || {} };
});

exports.getCookingProfile = onCall(COMMON_OPTS, async (request) => {
  const uid = requireAuth(request);
  const snap = await cookingRef(uid).get();
  const data = snap.exists ? snap.data() : {};
  return {
    discoveredRecipes: data.discoveredRecipes || [],
    recipeProgress: data.recipeProgress || {},
  };
});
