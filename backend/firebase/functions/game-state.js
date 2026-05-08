const { onCall, HttpsError } = require('firebase-functions/v2/https');
const admin = require('./admin');
const engine = require('./game-state-engine');
const { makeForagingRngForUser } = require('./foraging-rng');
const {
  readCaps,
  DEFAULT_CARRY_CAP,
  DEFAULT_INVENTORY_CAP,
} = require('./star-fragments');
const idem = require('./idempotency');

// Booster catalog — keep prices in sync with src/data/shopCatalog.ts.
// Server is authoritative on price + stat-mapping; client just names the SKU.
const BOOSTER_SKUS = {
  'booster-mood':   { stat: 'mood',   priceSF: 40 },
  'booster-sleep':  { stat: 'energy', priceSF: 40 },
  'booster-hunger': { stat: 'hunger', priceSF: 40 },
};

const REGION = 'us-central1';

// Sleeping Camp buff multipliers. Single active camp slot per user; while
// active, foraging events fire 20% faster and the carry cap is 50% larger.
// Stored on wallet doc as activeCamp = { id, startedAtMs, expiresAtMs }.
const CAMP_CARRY_MULT = 1.5;
const CAMP_INTERVAL_MULT = 0.8; // smaller = faster

function readActiveCamp(walletData, nowMs) {
  const c = walletData && walletData.activeCamp;
  if (!c || typeof c.expiresAtMs !== 'number') return null;
  if (c.expiresAtMs <= nowMs) return null;
  return c;
}

// Read the user's purchased caps + active camp from the wallet doc in one
// hit. Falls back to defaults when the doc / fields don't exist yet.
async function getUserWallet(uid, nowMs) {
  try {
    const snap = await admin
      .firestore()
      .collection('users')
      .doc(uid)
      .collection('wallet')
      .doc('main')
      .get();
    const data = snap.exists ? snap.data() || {} : {};
    return { caps: readCaps(data), activeCamp: readActiveCamp(data, nowMs) };
  } catch (_e) {
    return {
      caps: { carryCap: DEFAULT_CARRY_CAP, inventoryCap: DEFAULT_INVENTORY_CAP },
      activeCamp: null,
    };
  }
}

// Per-request foraging RNG. In HMAC mode this is a no-op; in VRF mode it
// fetches (or requests) the user's current window seed before resolve() runs.
// Returns engine-compatible opts with a synchronous randomBytes closure,
// effective carry-cap (camp boost folded in), and forageIntervalMultiplier
// for an active sleeping camp.
async function getForagingOptsForUser(uid, nowMs) {
  const [rng, wallet] = await Promise.all([
    makeForagingRngForUser({ uid, nowMs, firestore: admin.firestore() }),
    getUserWallet(uid, nowMs),
  ]);
  const camp = wallet.activeCamp; // already null-filtered for expiry by readActiveCamp
  // carryCap is a snapshot — applies if a camp is active at the moment of
  // resolution. If the camp expires mid-window, carryCap reverts on the next
  // request; this matches user expectation ("active at use time").
  const carryMult = camp ? CAMP_CARRY_MULT : 1;
  // forageIntervalMultiplier is a *function* of eventMs so foraging events
  // outside the camp's [startedAtMs, expiresAtMs) window keep base spacing.
  // Without this, a freshly-purchased camp would retroactively densify
  // pre-purchase backlog (free SF), and an expired camp would keep applying
  // for the rest of the catch-up window (free SF after the buff lapsed).
  const intervalMultFn = camp
    ? (eventMs) =>
        eventMs >= camp.startedAtMs && eventMs < camp.expiresAtMs
          ? CAMP_INTERVAL_MULT
          : 1
    : 1;
  return {
    randomBytes: rng.randomBytes,
    carryCap: Math.floor(wallet.caps.carryCap * carryMult),
    inventoryCap: wallet.caps.inventoryCap,
    forageIntervalMultiplier: intervalMultFn,
  };
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

const COMMON_OPTS = {
  cors: true,
  region: REGION,
  secrets: ['FORAGING_HMAC_SECRET', 'FORAGING_VRF_SIGNER_SECRET_KEY'],
};

exports.getGameState = onCall(COMMON_OPTS, async (request) => {
  const uid = requireAuth(request);
  const characterId = validateCharacterId(request.data && request.data.characterId);
  const tz = request.data && request.data.timezone;
  const nowMs = Date.now();

  let state = await loadOrDefault(uid, characterId, nowMs, validTimezone(tz) ? tz : undefined);
  const opts = await getForagingOptsForUser(uid, nowMs);
  const resolved = engine.resolve(state, nowMs, opts);
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
  const opts = await getForagingOptsForUser(uid, nowMs);
  const next = { ...engine.resolve(state, nowMs, opts), timezone: tz };
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

  const opts = await getForagingOptsForUser(uid, nowMs);
  let next;
  try {
    next = engine.applyFeed(state, nowMs, hungerBoost, moodBoost, opts);
  } catch (e) {
    throw new HttpsError('failed-precondition', e.message);
  }
  await saveState(uid, characterId, next);
  return { state: next };
});

// applyBooster — server-authoritative consumable purchase + immediate stat
// bump. SF deduction and stat write happen in a single Firestore transaction
// so a crash mid-flow can't deduct without applying or vice versa. Optional
// requestId provides cross-device/retry idempotency via idempotency.js.
exports.applyBooster = onCall(COMMON_OPTS, async (request) => {
  const uid = requireAuth(request);
  const characterId = validateCharacterId(request.data && request.data.characterId);
  const skuId = String((request.data && request.data.skuId) || '');
  const sku = BOOSTER_SKUS[skuId];
  if (!sku) {
    throw new HttpsError('invalid-argument', `Unknown booster SKU: ${skuId}`);
  }
  const requestId = idem.validateRequestId(request.data && request.data.requestId);
  const nowMs = Date.now();
  // RNG seed is wallet-independent (HMAC of uid+window or VRF lookup), so it
  // can be prepared outside the transaction. Carry/interval opts are derived
  // from the wallet doc *inside* the tx below to avoid a race where a
  // concurrent camp purchase/expiry mutates activeCamp between this read and
  // the tx commit.
  const rng = await makeForagingRngForUser({ uid, nowMs, firestore: admin.firestore() });

  const wRef = admin
    .firestore()
    .collection('users')
    .doc(uid)
    .collection('wallet')
    .doc('main');
  const sRef = stateRef(uid, characterId);
  const lRef = requestId
    ? idem.ledgerRef({ uid, collection: 'boosterPurchases', requestId })
    : null;

  const result = await admin.firestore().runTransaction(async (tx) => {
    if (lRef) {
      const replay = await idem.checkIdempotency(tx, lRef, { skuId, characterId });
      if (replay.hit) {
        return {
          newBalance: replay.cached.newBalance,
          state: replay.cached.state,
          replayed: true,
        };
      }
    }

    const [wSnap, sSnap] = await Promise.all([tx.get(wRef), tx.get(sRef)]);
    // Don't auto-create a moonoko doc here — that would let an authenticated
    // user fabricate ownership records for 40 SF. The character must already
    // exist (created via the normal mint/onboarding flow).
    if (!sSnap.exists) {
      throw new HttpsError(
        'not-found',
        'Moonoko not found — boosters require an existing character.'
      );
    }
    const wData = wSnap.exists ? wSnap.data() : {};
    const rawBalance = wData.balance;
    const balance = Number.isSafeInteger(rawBalance) && rawBalance >= 0 ? rawBalance : 0;
    if (balance < sku.priceSF) {
      throw new HttpsError(
        'failed-precondition',
        `Not enough Star Fragments — need ${sku.priceSF}, have ${balance}.`
      );
    }
    // Build foraging opts from the same wallet snapshot we already read
    // inside this tx — keeps carry/interval consistent with whatever
    // concurrent camp purchase / expiry committed before us.
    const camp = readActiveCamp(wData, nowMs);
    const caps = readCaps(wData);
    const carryMult = camp ? CAMP_CARRY_MULT : 1;
    const intervalMultFn = camp
      ? (eventMs) =>
          eventMs >= camp.startedAtMs && eventMs < camp.expiresAtMs
            ? CAMP_INTERVAL_MULT
            : 1
      : 1;
    const opts = {
      randomBytes: rng.randomBytes,
      carryCap: Math.floor(caps.carryCap * carryMult),
      forageIntervalMultiplier: intervalMultFn,
    };
    const cur = sSnap.data();
    let next;
    try {
      next = engine.applyBooster(cur, nowMs, sku.stat, opts);
    } catch (e) {
      throw new HttpsError('failed-precondition', e.message);
    }
    const newBalance = balance - sku.priceSF;
    tx.set(
      wRef,
      { balance: newBalance, updatedAt: nowMs },
      { merge: true }
    );
    tx.set(sRef, next, { merge: false });
    if (lRef) {
      idem.writeLedger(tx, lRef, {
        uid,
        characterId,
        skuId,
        priceSF: sku.priceSF,
        stat: sku.stat,
        newBalance,
        state: next,
      });
    }
    return { newBalance, state: next, replayed: false };
  });

  return {
    ...result,
    stat: sku.stat,
    priceSF: sku.priceSF,
  };
});

exports.recordPlay = onCall(COMMON_OPTS, async (request) => {
  const uid = requireAuth(request);
  const characterId = validateCharacterId(request.data && request.data.characterId);
  const won = !!(request.data && request.data.won);
  const nowMs = Date.now();
  const state = await loadOrDefault(uid, characterId, nowMs);
  const opts = await getForagingOptsForUser(uid, nowMs);
  let next;
  try {
    next = engine.applyPlay(state, nowMs, opts, { won });
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
  const opts = await getForagingOptsForUser(uid, nowMs);
  let next;
  try {
    next = engine.applyChat(state, nowMs, opts);
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
  const opts = await getForagingOptsForUser(uid, nowMs);
  const next = engine.applyStartSleep(state, nowMs, opts);
  await saveState(uid, characterId, next);
  return { state: next };
});

exports.endSleep = onCall(COMMON_OPTS, async (request) => {
  const uid = requireAuth(request);
  const characterId = validateCharacterId(request.data && request.data.characterId);
  const force = !!(request.data && request.data.force);
  const nowMs = Date.now();
  const state = await loadOrDefault(uid, characterId, nowMs);
  // Pre-resolve so a stale sleepStartedAt (>=8h) self-heals via the engine's
  // foraging-split path before applyEndSleep sees it. If the self-heal already
  // woke the moonoko, save+return that state instead of letting applyEndSleep
  // throw "Not sleeping" — from the client's perspective the wake succeeded.
  const opts = await getForagingOptsForUser(uid, nowMs);
  const resolved = engine.resolve(state, nowMs, opts);
  if (!resolved.sleepStartedAt) {
    await saveState(uid, characterId, resolved);
    return { state: resolved };
  }
  let next;
  try {
    next = engine.applyEndSleep(resolved, nowMs, { force });
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
  const opts = await getForagingOptsForUser(uid, nowMs);
  const resolved = engine.resolve(state, nowMs, opts);
  const finds = resolved.foragedItems || [];
  let accepted = finds;
  let dropped = 0;
  if (finds.length > 0) {
    // Append to inventory — ingredients as {id, count} aggregates. Cap the
    // total ingredient count at inventoryCap; excess foraged finds are
    // dropped silently (foraging is free, so dropping > losing paid grants).
    await admin.firestore().runTransaction(async (tx) => {
      const invRef = admin.firestore().collection('users').doc(uid).collection('inventory').doc('ingredients');
      const snap = await tx.get(invRef);
      const cur = snap.exists ? snap.data() : {};
      const counts = { ...(cur.counts || {}) };
      let total = 0;
      for (const v of Object.values(counts)) {
        if (typeof v === 'number') total += v;
      }
      const room = Math.max(0, opts.inventoryCap - total);
      if (finds.length > room) {
        accepted = finds.slice(0, room);
        dropped = finds.length - room;
      }
      for (const f of accepted) {
        counts[f.ingredient] = (counts[f.ingredient] || 0) + 1;
      }
      tx.set(invRef, { counts, updatedAt: nowMs }, { merge: true });
    });
  }
  const drained = engine.applyDrainForaged(resolved, nowMs);
  await saveState(uid, characterId, drained);
  return {
    state: drained,
    drained: accepted, // for the recap banner — source + tier + ingredient
    droppedAtCap: dropped, // count of finds dropped because pantry was full
    inventoryCap: opts.inventoryCap,
  };
});
