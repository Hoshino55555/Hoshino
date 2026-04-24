// Server-side VRF requester. Submits `request_randomness` to the Hoshino VRF
// consumer program on Solana devnet, waits for MagicBlock to fulfill the
// request, and returns the 32-byte randomness.
//
// This is the backend twin of src/services/VRFService.ts — same wire format,
// same PDA derivation, same account decoding — but signed by a dedicated
// server keypair instead of the user's wallet. That lets us submit requests
// during `getGameState` without prompting the user.
//
// ---
// Why server-signed?
//
// Foraging resolves up to 96 ticks per day, lazily replayed on each
// getGameState call. Prompting the user's wallet per tick is a non-starter.
// Instead: the server signs one VRF request per "catchup window" (24h by
// default), caches the resulting 32-byte seed, and derives per-tick bytes
// locally via HMAC-SHA256(seed, tickMs). Provably random *seed*, cheap to
// expand, one on-chain tx per day per user max.
//
// ---
// Required env vars:
//   FORAGING_VRF_SIGNER_SECRET_KEY  JSON array of 64 u8s (Solana keypair file
//                                   format — paste the contents of the file).
//                                   Must be funded on devnet.
//   FORAGING_VRF_RPC_URL            Optional; defaults to devnet public RPC.

const {
  Connection,
  PublicKey,
  Keypair,
  Transaction,
  TransactionInstruction,
  SystemProgram,
  SYSVAR_SLOT_HASHES_PUBKEY,
} = require('@solana/web3.js');
const crypto = require('crypto');

// Devnet program + oracle addresses. Kept in sync with src/config/vrf.ts.
const VRF_PROGRAM_ID = new PublicKey('CSQ7mu1XoBv171bXFBhYCFNcLHp2Xbpa9voExh8qfBbp');
const VRF_ORACLE_QUEUE = new PublicKey('Cuj97ggrhhidhbu39TijNVqE74xvKJ69gDervRUXAxGh');
const MAGICBLOCK_VRF_PROGRAM_ID = new PublicKey('Vrf1RNUjXmQGjmQrQLvJHs9SNkvDJEsRVFPkfSQUwGz');
const DEFAULT_RPC = 'https://api.devnet.solana.com';

const REQUEST_RANDOMNESS_DISCRIMINATOR = Buffer.from([213, 5, 173, 166, 37, 236, 31, 18]);
const VRF_REQUEST_ACCOUNT_DISCRIMINATOR = Buffer.from([153, 180, 194, 105, 91, 34, 95, 113]);
const VRF_PURPOSE_FORAGE_ROLL = 2;

// Lazy singletons so we don't build the connection or parse the keypair at
// module load (cold-start cost; also lets tests inject alternatives).
let _signer = null;
let _connection = null;

function getSigner() {
  if (_signer) return _signer;
  const raw = process.env.FORAGING_VRF_SIGNER_SECRET_KEY;
  if (!raw) {
    throw new Error(
      'FORAGING_VRF_SIGNER_SECRET_KEY not set — paste the JSON array from your Solana keypair file'
    );
  }
  let secret;
  try {
    secret = Uint8Array.from(JSON.parse(raw));
  } catch (e) {
    throw new Error(
      `FORAGING_VRF_SIGNER_SECRET_KEY must be a JSON array of 64 u8s: ${e.message}`
    );
  }
  if (secret.length !== 64) {
    throw new Error(
      `FORAGING_VRF_SIGNER_SECRET_KEY must decode to 64 bytes, got ${secret.length}`
    );
  }
  _signer = Keypair.fromSecretKey(secret);
  return _signer;
}

function getConnection() {
  if (_connection) return _connection;
  _connection = new Connection(process.env.FORAGING_VRF_RPC_URL || DEFAULT_RPC, 'confirmed');
  return _connection;
}

// Deterministically map a Firebase UID to a 32-byte pubkey-like value. The
// Anchor program treats `user` as an UncheckedAccount (just seed material),
// so any 32 bytes work. Using sha256 keeps each user's PDAs disjoint without
// needing a real on-chain account for them.
function userPubkeyForUid(uid) {
  const hash = crypto.createHash('sha256').update(`hoshino-user:${uid}`).digest();
  return new PublicKey(hash);
}

function deriveRequestPda(userPubkey, purposeCode, nonce) {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('vrf-request'), userPubkey.toBuffer(), Buffer.from([purposeCode]), nonce],
    VRF_PROGRAM_ID
  )[0];
}

function deriveProgramIdentityPda() {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('identity')],
    VRF_PROGRAM_ID
  )[0];
}

function buildRequestInstruction({ payer, userPubkey, requestPda, purposeCode, nonce, callerSeed }) {
  const programIdentity = deriveProgramIdentityPda();
  const data = Buffer.concat([
    REQUEST_RANDOMNESS_DISCRIMINATOR,
    Buffer.from([purposeCode]),
    nonce,
    callerSeed,
  ]);
  return new TransactionInstruction({
    programId: VRF_PROGRAM_ID,
    keys: [
      { pubkey: payer, isSigner: true, isWritable: true },
      { pubkey: userPubkey, isSigner: false, isWritable: false },
      { pubkey: requestPda, isSigner: false, isWritable: true },
      { pubkey: VRF_ORACLE_QUEUE, isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: programIdentity, isSigner: false, isWritable: false },
      { pubkey: MAGICBLOCK_VRF_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: SYSVAR_SLOT_HASHES_PUBKEY, isSigner: false, isWritable: false },
    ],
    data,
  });
}

// Account layout mirrors `VrfRequest` in programs/hoshino-vrf-consumer/src/lib.rs
// and the decoder in src/services/VRFService.ts. Keep the two in sync.
function decodeVrfRequestAccount(data) {
  const buf = Buffer.from(data);
  if (buf.length < 155) throw new Error('VRF account data too small');
  const discriminator = buf.subarray(0, 8);
  if (!discriminator.equals(VRF_REQUEST_ACCOUNT_DISCRIMINATOR)) {
    throw new Error('Unexpected VRF request account discriminator');
  }
  let offset = 8;
  offset += 1; // bump
  offset += 32; // user
  offset += 1; // purpose
  offset += 32; // nonce
  offset += 32; // oracleQueue
  const statusCode = buf.readUInt8(offset); offset += 1;
  const randomness = Buffer.from(buf.subarray(offset, offset + 32));
  return {
    status: statusCode === 1 ? 'fulfilled' : 'pending',
    randomness,
  };
}

async function fetchRequestAccount(connection, requestPda) {
  const info = await connection.getAccountInfo(requestPda, 'confirmed');
  if (!info?.data) return null;
  return decodeVrfRequestAccount(info.data);
}

async function pollForFulfillment(connection, requestPda, timeoutMs, pollIntervalMs) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const acct = await fetchRequestAccount(connection, requestPda);
    if (acct?.status === 'fulfilled') return acct;
    await new Promise((r) => setTimeout(r, pollIntervalMs));
  }
  throw new Error(`VRF fulfillment timed out after ${timeoutMs}ms`);
}

// Request a 32-byte VRF seed for (uid, nonce). Idempotent: if the PDA
// already exists (e.g. previous retry submitted but client crashed before
// caching), we skip the submit and just poll. If it's already fulfilled,
// we return immediately with no on-chain activity.
//
// `nonce` must be a 32-byte Buffer; caller-chosen and deterministic per
// logical request so retries are safe.
async function requestVrfSeed({ uid, nonce, timeoutMs = 12000, pollIntervalMs = 1000 }) {
  if (!Buffer.isBuffer(nonce) || nonce.length !== 32) {
    throw new Error('nonce must be a 32-byte Buffer');
  }
  const connection = getConnection();
  const signer = getSigner();
  const userPubkey = userPubkeyForUid(uid);
  const requestPda = deriveRequestPda(userPubkey, VRF_PURPOSE_FORAGE_ROLL, nonce);

  const existing = await fetchRequestAccount(connection, requestPda);
  if (existing?.status === 'fulfilled') {
    return { seed: existing.randomness, submitted: false, requestPda: requestPda.toBase58() };
  }

  if (!existing) {
    // callerSeed feeds MagicBlock's VRF input; tying it to (uid, nonce) keeps
    // the resulting seed unguessable-in-advance but reproducible across retries.
    const callerSeed = crypto
      .createHash('sha256')
      .update(Buffer.concat([Buffer.from(`hoshino-vrf:forage:${uid}:`), nonce]))
      .digest();
    const ix = buildRequestInstruction({
      payer: signer.publicKey,
      userPubkey,
      requestPda,
      purposeCode: VRF_PURPOSE_FORAGE_ROLL,
      nonce,
      callerSeed,
    });
    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');
    const tx = new Transaction({ feePayer: signer.publicKey, blockhash, lastValidBlockHeight }).add(ix);
    tx.sign(signer);
    const signature = await connection.sendRawTransaction(tx.serialize(), {
      skipPreflight: false,
      preflightCommitment: 'confirmed',
    });
    await connection.confirmTransaction(
      { signature, blockhash, lastValidBlockHeight },
      'confirmed'
    );
  }

  const fulfilled = await pollForFulfillment(connection, requestPda, timeoutMs, pollIntervalMs);
  return { seed: fulfilled.randomness, submitted: existing === null, requestPda: requestPda.toBase58() };
}

module.exports = {
  requestVrfSeed,
  userPubkeyForUid,
  deriveRequestPda,
  VRF_PURPOSE_FORAGE_ROLL,
  // Exposed for testing
  _getSigner: getSigner,
  _getConnection: getConnection,
};
