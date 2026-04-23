// Randomness source for foraging. See docs/GAME_MECHANICS.md § Foraging.
//
// Exports a single factory makeForagingRng() that returns { randomBytes }.
// randomBytes(userId, tickMs) returns a Buffer of at least 32 bytes, where
// byte[0] gates the find roll and byte[1] picks the rarity tier. Extra bytes
// are reserved for future expansion (e.g. ingredient-within-tier pick when
// tiers grow past 1 ingredient each).
//
// Mode is selected via FORAGING_RNG_MODE env var: 'hmac' (default) or 'vrf'.
// Swapping mode requires no code change downstream — the byte stream looks
// identical, only the source differs.

const crypto = require('crypto');

// HMAC secret. In prod this must be set via Firebase secrets / env; in dev we
// fall back to a fixed dev secret so local emulators work without setup. The
// dev fallback is logged loudly so nobody ships it to prod by accident.
function getHmacSecret() {
  const s = process.env.FORAGING_HMAC_SECRET;
  if (s && s.length >= 32) return s;
  if (process.env.FUNCTIONS_EMULATOR === 'true' || process.env.NODE_ENV !== 'production') {
    console.warn('[foraging-rng] Using DEV HMAC secret — set FORAGING_HMAC_SECRET for prod');
    return 'DEV-ONLY-dev-dev-dev-dev-dev-dev-dev-dev-00';
  }
  throw new Error('FORAGING_HMAC_SECRET not set (prod requires a 32+ char secret)');
}

// HMAC mode: HMAC-SHA256(secret, `${userId}:${tickMs}`) → 32 bytes.
// Deterministic, unpredictable to user, verifiable server-side.
function hmacRandomBytes(userId, tickMs) {
  const h = crypto.createHmac('sha256', getHmacSecret());
  h.update(`${userId}:${tickMs}`);
  return h.digest();
}

// VRF mode: placeholder. Real implementation lives in vrf-requester.js (wip).
// Strategy: batch requests — one VRF fulfillment covers a catchup window,
// seed is split per-tick via HKDF or sequential HMAC. For now this is a stub
// that throws so callers must opt into hmac mode explicitly.
function vrfRandomBytes(_userId, _tickMs) {
  throw new Error('VRF mode not wired yet — use FORAGING_RNG_MODE=hmac');
}

function makeForagingRng() {
  const mode = (process.env.FORAGING_RNG_MODE || 'hmac').toLowerCase();
  if (mode === 'hmac') {
    return { mode, randomBytes: hmacRandomBytes };
  }
  if (mode === 'vrf') {
    return { mode, randomBytes: vrfRandomBytes };
  }
  throw new Error(`Unknown FORAGING_RNG_MODE: ${mode}`);
}

module.exports = { makeForagingRng, hmacRandomBytes };
