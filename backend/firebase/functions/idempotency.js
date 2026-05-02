// Reusable Firestore-transaction-friendly idempotency ledger. Each
// callable that spends Star Fragments (or otherwise mutates wallet/state)
// should claim a per-request ledger doc inside its transaction so that a
// network retry, double-tap, or replay cannot double-spend.
//
// Storage layout: users/{uid}/{ledger}/{requestId} — uid in the path means
// cross-user replay is impossible at the Firestore-rules level.
//
// All ledger docs carry expiresAt (now + LEDGER_TTL_MS) so a future
// Firestore TTL policy on each ledger collection garbage-collects them
// automatically — without a TTL policy the docs persist forever, which
// works correctly for replay protection but grows unbounded.

const { HttpsError } = require('firebase-functions/v2/https');
const admin = require('./admin');

// 30-day replay window. Beyond that the client request is long gone —
// resending after a month would be a different transaction in the user's
// mental model, and storage cost dominates over correctness gain.
const LEDGER_TTL_MS = 30 * 24 * 60 * 60 * 1000;

const REQUEST_ID_RE = /^[A-Za-z0-9_-]{1,128}$/;

// Validate the optional client-supplied requestId. Returns null when the
// caller didn't pass one (non-idempotent path retained for backwards
// compat). Throws invalid-argument on a malformed id rather than silently
// dropping it — a malformed id is a client bug we want to surface.
function validateRequestId(rid) {
  if (rid === undefined || rid === null) return null;
  if (typeof rid !== 'string' || !REQUEST_ID_RE.test(rid)) {
    throw new HttpsError(
      'invalid-argument',
      'requestId must be 1-128 chars of [A-Za-z0-9_-]'
    );
  }
  return rid;
}

// Resolve the ledger doc reference for a given uid + collection + requestId.
function ledgerRef({ uid, collection, requestId }) {
  return admin
    .firestore()
    .collection('users')
    .doc(uid)
    .collection(collection)
    .doc(requestId);
}

// Inside a runTransaction, check if this requestId has already been
// processed. Returns { hit: true, cached } when a matching ledger entry
// exists; { hit: false } when there's no entry to read. A mismatch (same
// requestId reused for a different op shape) throws already-exists so we
// don't return wrong cached data.
//
// `match` is a record of { fieldName: expectedValue } that must equal the
// stored ledger fields; the helper throws if any value differs.
async function checkIdempotency(tx, ref, match) {
  const snap = await tx.get(ref);
  if (!snap.exists) return { hit: false };
  const cached = snap.data();
  for (const [k, v] of Object.entries(match)) {
    if (cached[k] !== v) {
      throw new HttpsError(
        'already-exists',
        `requestId already used for a different ${k} (got ${cached[k]}, requested ${v})`
      );
    }
  }
  return { hit: true, cached };
}

// Write a ledger doc inside the same transaction as the wallet/state
// mutation. Pass the full payload you want returned on replay; the helper
// adds expiresAt automatically.
function writeLedger(tx, ref, payload) {
  const nowMs = Date.now();
  tx.set(ref, {
    ...payload,
    createdAtMs: nowMs,
    expiresAt: admin.firestore.Timestamp.fromMillis(nowMs + LEDGER_TTL_MS),
  });
}

module.exports = {
  validateRequestId,
  ledgerRef,
  checkIdempotency,
  writeLedger,
  LEDGER_TTL_MS,
};
