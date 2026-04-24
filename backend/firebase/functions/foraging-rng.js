// Randomness source for foraging. See docs/GAME_MECHANICS.md § Foraging.
//
// Two execution modes selected by FORAGING_RNG_MODE env var:
//
//   'hmac' (default) — HMAC-SHA256(dev_or_prod_secret, `${userId}:${tickMs}`).
//       Deterministic, unpredictable to the user, zero SOL / zero latency.
//       Used in local/dev, CI, and as the fallback when VRF fails.
//
//   'vrf' — MagicBlock on-chain VRF. Requests one 32-byte seed per user per
//       24h window (server signer pays). Per-tick bytes are derived locally
//       via HMAC-SHA256(vrf_seed, tickMs) — the seed itself is the thing
//       that's provably random. Falls back to HMAC if the request fails so
//       foraging never blocks on Solana.
//
// The engine consumes a synchronous `randomBytes(userId, tickMs)`; any
// per-request setup (fetching the VRF seed from Firestore or MagicBlock) is
// done by the async factory before `resolve()` is called.

const crypto = require('crypto');

// Cache window: one VRF seed covers this many ms of forage ticks. 24h aligns
// with the catchup cap in game-state-engine.js — a user away for >3 days gets
// fast-forwarded, so we never need >3 windows in a single resolve. Shorter
// windows = more randomness rotations but more on-chain cost; longer windows
// = fewer requests but larger window of correlated outcomes.
const VRF_WINDOW_MS = 24 * 3600 * 1000;

function getHmacSecret() {
  const s = process.env.FORAGING_HMAC_SECRET;
  if (s && s.length >= 32) return s;
  if (process.env.FUNCTIONS_EMULATOR === 'true' || process.env.NODE_ENV !== 'production') {
    console.warn('[foraging-rng] Using DEV HMAC secret — set FORAGING_HMAC_SECRET for prod');
    return 'DEV-ONLY-dev-dev-dev-dev-dev-dev-dev-dev-00';
  }
  throw new Error('FORAGING_HMAC_SECRET not set (prod requires a 32+ char secret)');
}

// Plain HMAC mode. Deterministic: same (userId, tickMs) always yields the
// same bytes, so re-resolving the same range is idempotent.
function hmacRandomBytes(userId, tickMs) {
  const h = crypto.createHmac('sha256', getHmacSecret());
  h.update(`${userId}:${tickMs}`);
  return h.digest();
}

function makeHmacRng() {
  return { mode: 'hmac', randomBytes: hmacRandomBytes };
}

// Given a VRF seed and a tick timestamp, produce the same 32-byte stream
// shape the engine expects. Using HMAC here gives uniform distribution per
// tick without leaking the seed (even though the seed itself is already
// single-use per window).
function vrfSeedToRandomBytes(seed) {
  return (userId, tickMs) => {
    const h = crypto.createHmac('sha256', seed);
    h.update(`${userId}:${tickMs}`);
    return h.digest();
  };
}

function windowStartForMs(ms) {
  return Math.floor(ms / VRF_WINDOW_MS) * VRF_WINDOW_MS;
}

// Deterministic 32-byte nonce per (uid, windowStart). Used as the VRF
// request nonce so retries land on the same PDA — the Anchor program
// rejects duplicate fulfillment, and re-submitting with the same nonce is
// idempotent (the existing PDA is reused).
function windowNonce(uid, windowStartMs) {
  return crypto
    .createHash('sha256')
    .update(`forage-window:${uid}:${windowStartMs}`)
    .digest();
}

async function getOrRequestWindowSeed({ uid, nowMs, firestore, vrfRequester, logger }) {
  const windowStart = windowStartForMs(nowMs);
  const docRef = firestore
    .collection('users')
    .doc(uid)
    .collection('vrf')
    .doc(`window-${windowStart}`);

  const snap = await docRef.get();
  if (snap.exists) {
    const data = snap.data();
    if (data.seed) {
      return { seed: Buffer.from(data.seed, 'base64'), cached: true };
    }
  }

  const nonce = windowNonce(uid, windowStart);
  const { seed, submitted, requestPda } = await vrfRequester.requestVrfSeed({ uid, nonce });
  await docRef.set(
    {
      seed: seed.toString('base64'),
      windowStartMs: windowStart,
      windowEndMs: windowStart + VRF_WINDOW_MS,
      requestPda,
      submitted,
      fulfilledAt: Date.now(),
    },
    { merge: true }
  );
  if (logger) logger.log({ event: 'vrf_seed_cached', uid, windowStart, submitted, requestPda });
  return { seed, cached: false };
}

// Async RNG factory used from game-state.js. Per-request: decides the mode,
// fetches/requests a VRF seed if needed, returns a sync `randomBytes` for
// the engine to use during resolve().
//
// `firestore` and `vrfRequester` are dep-injected so tests can stub them.
async function makeForagingRngForUser({ uid, nowMs, firestore, vrfRequester, logger }) {
  const mode = (process.env.FORAGING_RNG_MODE || 'hmac').toLowerCase();

  if (mode === 'hmac') return makeHmacRng();

  if (mode === 'vrf') {
    try {
      const { seed } = await getOrRequestWindowSeed({
        uid,
        nowMs,
        firestore,
        vrfRequester: vrfRequester || require('./vrf-requester'),
        logger,
      });
      return { mode: 'vrf', randomBytes: vrfSeedToRandomBytes(seed) };
    } catch (e) {
      // Never let a VRF failure break the foraging loop — HMAC is a safe
      // deterministic fallback. Log loudly so ops notices.
      console.error(
        `[foraging-rng] VRF request failed for uid=${uid}, falling back to HMAC: ${e.message}`
      );
      return makeHmacRng();
    }
  }

  throw new Error(`Unknown FORAGING_RNG_MODE: ${mode}`);
}

// Legacy factory kept for test compatibility — always returns HMAC.
function makeForagingRng() {
  return makeHmacRng();
}

module.exports = {
  makeForagingRng,
  makeForagingRngForUser,
  hmacRandomBytes,
  // Exposed for tests
  VRF_WINDOW_MS,
  windowStartForMs,
  windowNonce,
};
