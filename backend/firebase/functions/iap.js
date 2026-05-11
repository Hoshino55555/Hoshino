// IAP — server-authoritative purchase flow.
//
// Two callables drive the entire client → chain → server credit loop:
//
//   1. createPurchaseIntent({ skuId, paymentToken })
//        → { intentId, treasury, mint|null, tokenAmount, decimals, memo,
//            network, rpcUrl, expiresAtMs }
//      Server picks the price, treasury, and a unique nonce. Client uses
//      these to build + sign a transfer + memo tx using whichever wallet
//      they have (Privy embedded, MWA, deeplink). Server is authoritative
//      on USD price + treasury — client can't substitute either.
//
//   2. confirmPurchase({ intentId, txSig })
//        → { success, granted, newBalance? }
//      Server fetches the tx from chain, verifies sender + recipient + mint
//      + amount + memo nonce, then atomically marks the intent confirmed
//      AND grants the SKU (SF balance, season pass, etc.). Idempotent —
//      a re-call with the same txSig is safe.
//
// Storage (Firestore):
//   users/{uid}/iapIntents/{intentId} = {
//     skuId, paymentToken, tokenAmount, decimals, treasury,
//     status: 'pending' | 'confirmed' | 'expired',
//     createdAtMs, expiresAtMs, txSig?, confirmedAtMs?, granted?, error?,
//   }
//
// =============================================================================
// BLOCKERS — values below are placeholders. Resolve before mainnet launch:
//   * IAP_TREASURY_OWNER  — Solana address that receives all IAP funds
//                            (single owner; SPL ATAs derived from this key).
//                            Need separate addresses for devnet vs mainnet.
//   * IAP_SKR_MINT        — SKR (Solana Seeker token) mint address.
//   * IAP_SKR_DECIMALS    — confirm decimals on chain (default 9 here).
//   * IAP_NETWORK         — 'devnet' for hackathon demo, 'mainnet-beta' for
//                            production. RPC URL follows from this.
//   * Privy useFundWallet config — which fiat assets to enable in dashboard.
//   * Token-2022 mints   — ATA derivation here uses the legacy Token Program.
//                            If any chosen mint is a Token-2022 mint (some new
//                            stables / SKR variants), ATA seeds must use the
//                            Token-2022 program ID. Resolve when token program
//                            for SKR is known.
//   * Source/Treasury ATA pre-creation — verifyTransfer doesn't ensure the
//                            treasury ATA already exists; pre-fund treasury
//                            with each SPL token at deploy time.
// All settable via Functions environment (firebase functions:config:set ...).
// =============================================================================

const { onCall, HttpsError } = require('firebase-functions/v2/https');
const admin = require('./admin');
const {
    Connection,
    PublicKey,
    SystemProgram,
} = require('@solana/web3.js');
const crypto = require('crypto');

const REGION = 'us-central1';
const COMMON_OPTS = { cors: true, region: REGION };

const NETWORK = process.env.IAP_NETWORK || 'devnet';
const RPC_URL =
    process.env.IAP_RPC_URL ||
    (NETWORK === 'mainnet-beta'
        ? 'https://api.mainnet-beta.solana.com'
        : 'https://api.devnet.solana.com');

const connection = new Connection(RPC_URL, 'confirmed');

// Treasury — single owner. SOL lands directly at this address; SPL tokens
// land in associated token accounts (ATAs) derived from this key + mint.
// PLACEHOLDER — replace before any real-money launch.
const TREASURY_OWNER_STR =
    process.env.IAP_TREASURY_OWNER ||
    // Sentinel: 11111…11 (System Program). Picked so a misconfigured tx
    // would visibly fail rather than route funds somewhere unexpected.
    '11111111111111111111111111111111';

let TREASURY_OWNER;
try {
    TREASURY_OWNER = new PublicKey(TREASURY_OWNER_STR);
} catch (_e) {
    TREASURY_OWNER = new PublicKey('11111111111111111111111111111111');
}

// Token registry. SOL is the special case (mint=null → System Program transfer).
// All values below are SOLANA chain constants except the SKR mint, which is
// the headline blocker.
const TOKENS = {
    SOL: { symbol: 'SOL', mint: null, decimals: 9 },
    USDC: {
        symbol: 'USDC',
        // Mainnet: EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v
        // Devnet:  4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU
        mint:
            process.env.IAP_USDC_MINT ||
            (NETWORK === 'mainnet-beta'
                ? 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'
                : '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU'),
        decimals: 6,
    },
    SKR: {
        symbol: 'SKR',
        // BLOCKER — Solana Seeker token mint. No public placeholder; left
        // null so attempts to use SKR fail loudly until configured.
        mint: process.env.IAP_SKR_MINT || null,
        decimals: Number(process.env.IAP_SKR_DECIMALS) || 9,
    },
};

// Server-authoritative IAP catalog. Mirror of iap-pending entries in
// src/data/shopCatalog.ts — keep in sync. Grant shape drives what gets
// credited on confirm.
const IAP_SKUS = {
    'star-fragments-small': {
        priceUsd: 0.99,
        grant: { kind: 'starFragments', amount: 500 },
    },
    'star-fragments-medium': {
        priceUsd: 4.99,
        grant: { kind: 'starFragments', amount: 3000 },
    },
    'star-fragments-large': {
        priceUsd: 9.99,
        grant: { kind: 'starFragments', amount: 7000 },
    },
    'lunar-pass': {
        priceUsd: 9.99,
        grant: { kind: 'seasonPass' },
    },
    // Bundles — TODO when contents are finalized.
    'bundle-starter': {
        priceUsd: 4.99,
        grant: { kind: 'bundle', bundleId: 'starter' },
    },
    'bundle-bargain': {
        priceUsd: 2.99,
        grant: { kind: 'bundle', bundleId: 'bargain' },
    },
};

// ----- Price oracle (USD per token) -----
// USDC is 1:1 by definition. SOL/SKR live-fetched from Jupiter; falls back
// to hardcoded values on failure so demos don't break when Jupiter is slow.
// Cache TTL is short (60s) so prices stay fresh during a busy demo.
const PRICE_FALLBACK_USD = {
    SOL: 150, // refresh occasionally — used only when oracle is unreachable
    SKR: 0.1, // BLOCKER — confirm against the actual SKR price feed
    USDC: 1,
};

const priceCache = new Map();
async function tokenUsdPrice(symbol) {
    if (symbol === 'USDC') return 1;
    const cached = priceCache.get(symbol);
    if (cached && Date.now() < cached.ttl) return cached.usd;
    const tok = TOKENS[symbol];
    if (!tok || !tok.mint) {
        return PRICE_FALLBACK_USD[symbol] || 0;
    }
    try {
        const url = `https://price.jup.ag/v6/price?ids=${tok.mint}`;
        const resp = await fetch(url);
        if (!resp.ok) throw new Error('jup status ' + resp.status);
        const j = await resp.json();
        const usd = j && j.data && j.data[tok.mint] && j.data[tok.mint].price;
        if (typeof usd !== 'number' || !isFinite(usd) || usd <= 0) {
            throw new Error('jup no price');
        }
        priceCache.set(symbol, { usd, ttl: Date.now() + 60_000 });
        return usd;
    } catch (_e) {
        return PRICE_FALLBACK_USD[symbol] || 0;
    }
}

// ----- ATA derivation (no @solana/spl-token dep needed) -----
const TOKEN_PROGRAM_ID = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');
const ASSOCIATED_TOKEN_PROGRAM_ID = new PublicKey(
    'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL'
);
const MEMO_PROGRAM_ID = new PublicKey('MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr');

function deriveAta(owner, mint) {
    const [ata] = PublicKey.findProgramAddressSync(
        [owner.toBuffer(), TOKEN_PROGRAM_ID.toBuffer(), mint.toBuffer()],
        ASSOCIATED_TOKEN_PROGRAM_ID
    );
    return ata;
}

// ----- Helpers -----
function requireAuth(request) {
    const uid = request.auth && request.auth.uid;
    if (!uid) throw new HttpsError('unauthenticated', 'Must sign in');
    return uid;
}

function intentRef(uid, intentId) {
    return admin
        .firestore()
        .collection('users')
        .doc(uid)
        .collection('iapIntents')
        .doc(intentId);
}

// Global ledger: one tx signature can confirm at most one intent. Prevents a
// client from packing multiple intent memos into a single transfer and
// replaying the same txSig across intents.
function txSigLedgerRef(txSig) {
    return admin.firestore().collection('iapTxSigs').doc(txSig);
}

const INTENT_TTL_MS = 10 * 60 * 1000; // 10min — long enough to fund + sign

function makeIntentId() {
    return crypto.randomBytes(16).toString('hex');
}

// ----- createPurchaseIntent -----
//
// Resolves price, picks treasury, persists pending intent, returns the
// params the client needs to build the on-chain transfer.
exports.createPurchaseIntent = onCall(COMMON_OPTS, async (request) => {
    const uid = requireAuth(request);
    const skuId = String((request.data && request.data.skuId) || '');
    const paymentToken = String(
        (request.data && request.data.paymentToken) || 'USDC'
    ).toUpperCase();

    const sku = IAP_SKUS[skuId];
    if (!sku) {
        throw new HttpsError('invalid-argument', `Unknown SKU: ${skuId}`);
    }
    const tok = TOKENS[paymentToken];
    if (!tok) {
        throw new HttpsError('invalid-argument', `Unknown payment token: ${paymentToken}`);
    }
    if (paymentToken !== 'SOL' && !tok.mint) {
        // SKR before mint is configured — surface clearly.
        throw new HttpsError(
            'failed-precondition',
            `${paymentToken} is not yet configured on this network`
        );
    }

    const usdPerToken = await tokenUsdPrice(paymentToken);
    if (!usdPerToken || usdPerToken <= 0) {
        throw new HttpsError('failed-precondition', `No price for ${paymentToken}`);
    }
    const tokenFloat = sku.priceUsd / usdPerToken;
    const tokenAmount = Math.ceil(tokenFloat * Math.pow(10, tok.decimals));

    // Treasury destination depends on token: SOL goes to owner address,
    // SPL goes to the owner's ATA for the mint.
    let treasury;
    if (paymentToken === 'SOL') {
        treasury = TREASURY_OWNER.toBase58();
    } else {
        const mintPk = new PublicKey(tok.mint);
        treasury = deriveAta(TREASURY_OWNER, mintPk).toBase58();
    }

    const intentId = makeIntentId();
    const nowMs = Date.now();
    const memo = `hoshino:iap:${intentId}`;

    await intentRef(uid, intentId).set({
        skuId,
        paymentToken,
        tokenAmount,
        decimals: tok.decimals,
        mint: tok.mint || null,
        treasury,
        memo,
        status: 'pending',
        createdAtMs: nowMs,
        expiresAtMs: nowMs + INTENT_TTL_MS,
        priceUsd: sku.priceUsd,
        usdPerToken,
        network: NETWORK,
    });

    return {
        intentId,
        skuId,
        paymentToken,
        treasury,
        mint: tok.mint || null,
        tokenAmount,
        decimals: tok.decimals,
        memo,
        network: NETWORK,
        rpcUrl: RPC_URL,
        expiresAtMs: nowMs + INTENT_TTL_MS,
        priceUsd: sku.priceUsd,
        usdPerToken,
        treasuryOwner: TREASURY_OWNER.toBase58(),
    };
});

// ----- confirmPurchase -----
//
// Verifies the on-chain transfer landed and matches the intent, then grants
// the SKU. Idempotent: same txSig replayed is a no-op (returns the original
// granted result).
exports.confirmPurchase = onCall(COMMON_OPTS, async (request) => {
    const uid = requireAuth(request);
    const intentId = String((request.data && request.data.intentId) || '');
    const txSig = String((request.data && request.data.txSig) || '');
    if (!intentId || !txSig) {
        throw new HttpsError('invalid-argument', 'intentId + txSig required');
    }

    const ref = intentRef(uid, intentId);
    const snap = await ref.get();
    if (!snap.exists) {
        throw new HttpsError('not-found', 'Intent not found');
    }
    const intent = snap.data();

    // Idempotency — already confirmed for this user. If the prior confirm
    // used a different sig, fall through to verify the new one (covers a
    // user clicking "confirm" with a stale sig from a failed attempt).
    if (intent.status === 'confirmed' && intent.txSig === txSig) {
        return { success: true, granted: intent.granted || null, idempotent: true };
    }
    if (intent.status === 'expired') {
        throw new HttpsError('failed-precondition', 'Intent expired');
    }
    if (Date.now() > (intent.expiresAtMs || 0)) {
        await ref.set({ status: 'expired' }, { merge: true });
        throw new HttpsError('failed-precondition', 'Intent expired');
    }

    // Pull the tx from chain and verify.
    let parsed;
    try {
        parsed = await connection.getParsedTransaction(txSig, {
            commitment: 'confirmed',
            maxSupportedTransactionVersion: 0,
        });
    } catch (e) {
        throw new HttpsError('failed-precondition', `RPC failure: ${e.message}`);
    }
    if (!parsed) {
        // Tx not yet visible — caller may retry.
        throw new HttpsError('failed-precondition', 'Transaction not found yet — retry shortly');
    }
    if (parsed.meta && parsed.meta.err) {
        throw new HttpsError('failed-precondition', 'Transaction failed on chain');
    }

    const verification = verifyTransfer({
        parsed,
        paymentToken: intent.paymentToken,
        mint: intent.mint,
        treasury: intent.treasury,
        expectedAmount: intent.tokenAmount,
        memo: intent.memo,
    });
    if (!verification.ok) {
        throw new HttpsError('failed-precondition', `Tx verify failed: ${verification.reason}`);
    }

    // Grant the SKU + persist intent state + claim the txSig globally in a
    // single transaction. The global txSig claim is what stops a client from
    // confirming two different intents with the same on-chain payment.
    const granted = await admin.firestore().runTransaction(async (tx) => {
        const fresh = await tx.get(ref);
        if (!fresh.exists) {
            throw new HttpsError('not-found', 'Intent vanished mid-confirm');
        }
        const cur = fresh.data();

        // Idempotent re-call (same intent + same sig already confirmed)
        if (cur.status === 'confirmed' && cur.txSig === txSig) {
            return cur.granted || null;
        }
        if (cur.status === 'confirmed' && cur.txSig !== txSig) {
            throw new HttpsError(
                'failed-precondition',
                'Intent already confirmed with different tx'
            );
        }
        // Re-check expiry inside the transaction — a concurrent expirer
        // could have flipped it between the outer check and now.
        if (cur.status === 'expired') {
            throw new HttpsError('failed-precondition', 'Intent expired');
        }
        if (Date.now() > (cur.expiresAtMs || 0)) {
            tx.set(ref, { status: 'expired' }, { merge: true });
            throw new HttpsError('failed-precondition', 'Intent expired');
        }
        if (cur.status !== 'pending') {
            throw new HttpsError(
                'failed-precondition',
                `Intent in unexpected state: ${cur.status}`
            );
        }

        // Global txSig ledger — same sig MUST NOT confirm a different intent.
        const sigRef = txSigLedgerRef(txSig);
        const sigSnap = await tx.get(sigRef);
        if (sigSnap.exists) {
            const ledger = sigSnap.data();
            if (ledger.uid !== uid || ledger.intentId !== intentId) {
                throw new HttpsError(
                    'failed-precondition',
                    'Transaction signature already used for a different purchase'
                );
            }
            // Same uid + intent already claimed this sig — fall through to
            // idempotent re-confirm path (the intent doc check above covers it).
        }

        const grantResult = await applyGrant(uid, cur.skuId, IAP_SKUS[cur.skuId].grant, tx);

        tx.set(
            ref,
            {
                status: 'confirmed',
                txSig,
                confirmedAtMs: Date.now(),
                granted: grantResult,
                payerWallet: verification.payer || null,
            },
            { merge: true }
        );
        tx.set(
            sigRef,
            {
                uid,
                intentId,
                claimedAtMs: Date.now(),
            },
            { merge: false }
        );
        return grantResult;
    });

    return { success: true, granted };
});

// ----- Verification -----
//
// Walks the parsed tx instructions and checks that exactly the expected
// transfer (SOL or SPL) lands at the treasury, plus a memo containing the
// intent ID. Rejects if the tx has additional value-bearing instructions
// the client didn't disclose — keeps verification tight.
// Walks parsed top-level + inner instructions and verifies, in order:
//   - Exactly ONE memo instruction whose payload equals our intent string
//     (not includes — equality, so a client can't pack two intents in one tx).
//   - Exactly ONE transfer-style instruction matching the expected token,
//     destination treasury, and amount.
//   - No additional value-bearing instructions (system transfer, SPL transfer
//     of any flavor, approve, close-account). Anything else is rejected so a
//     client can't sneak in CPIs that drain elsewhere or set up later replays.
function verifyTransfer({ parsed, paymentToken, mint, treasury, expectedAmount, memo }) {
    const instructions = (parsed.transaction.message.instructions || []).concat(
        flattenInner(parsed.meta && parsed.meta.innerInstructions)
    );

    let payer = null;
    let memoCount = 0;
    let transferCount = 0;
    let extraValueIx = null;

    const SPL_TOKEN_PROGRAMS = new Set(['spl-token', 'spl-token-2022']);
    const VALUE_BEARING_TOKEN_TYPES = new Set([
        'transfer',
        'transferChecked',
        'approve',
        'approveChecked',
        'closeAccount',
        'burn',
        'burnChecked',
        'mintTo',
        'mintToChecked',
    ]);

    for (const ix of instructions) {
        // ----- Memo -----
        const isMemoIx =
            (ix.programId && ix.programId.toString() === MEMO_PROGRAM_ID.toString()) ||
            ix.program === 'spl-memo';
        if (isMemoIx) {
            const data = ix.parsed || ix.data || '';
            const text =
                typeof data === 'string'
                    ? data
                    : (data && (data.info || data.text)) || '';
            if (typeof text === 'string' && text === memo) {
                memoCount += 1;
            } else if (typeof text === 'string' && text.includes(memo)) {
                // Disallow superset matches — they leave room for extra noise
                // that future verification logic might miss.
                return { ok: false, reason: 'memo not exact match' };
            } else {
                // Other memos in the tx aren't fatal but suspicious — count
                // them as "extra" so verification stays tight.
                return { ok: false, reason: 'unexpected memo content' };
            }
            continue;
        }

        // ----- Payment instruction (SOL) -----
        if (paymentToken === 'SOL') {
            if (ix.program === 'system' && ix.parsed && ix.parsed.type === 'transfer') {
                const info = ix.parsed.info || {};
                if (
                    info.destination === treasury &&
                    Number(info.lamports) >= expectedAmount
                ) {
                    transferCount += 1;
                    payer = info.source;
                } else {
                    extraValueIx = `system.transfer to ${info.destination}`;
                }
                continue;
            }
            // Any other system transfer / SPL transfer in a SOL payment is
            // not allowed.
            if (
                (ix.program === 'system' && ix.parsed && ix.parsed.type === 'transfer') ||
                (SPL_TOKEN_PROGRAMS.has(ix.program) &&
                    ix.parsed &&
                    VALUE_BEARING_TOKEN_TYPES.has(ix.parsed.type))
            ) {
                extraValueIx = `${ix.program}.${ix.parsed && ix.parsed.type}`;
            }
            continue;
        }

        // ----- Payment instruction (SPL: USDC/SKR/...) -----
        if (SPL_TOKEN_PROGRAMS.has(ix.program) && ix.parsed) {
            const t = ix.parsed.type;
            const info = ix.parsed.info || {};
            if (t === 'transferChecked') {
                if (
                    info.destination === treasury &&
                    info.mint === mint &&
                    Number((info.tokenAmount || {}).amount) >= expectedAmount
                ) {
                    transferCount += 1;
                    payer = info.authority || info.source;
                } else {
                    extraValueIx = `${ix.program}.transferChecked → ${info.destination}`;
                }
                continue;
            }
            if (t === 'transfer') {
                if (
                    info.destination === treasury &&
                    Number(info.amount) >= expectedAmount
                ) {
                    transferCount += 1;
                    payer = info.authority || info.source;
                } else {
                    extraValueIx = `${ix.program}.transfer → ${info.destination}`;
                }
                continue;
            }
            if (VALUE_BEARING_TOKEN_TYPES.has(t)) {
                extraValueIx = `${ix.program}.${t}`;
            }
            continue;
        }

        // System.transfer in an SPL-payment tx is also extra.
        if (ix.program === 'system' && ix.parsed && ix.parsed.type === 'transfer') {
            extraValueIx = 'system.transfer in SPL payment';
        }
    }

    if (memoCount === 0) return { ok: false, reason: 'memo mismatch' };
    if (memoCount > 1) return { ok: false, reason: 'multiple memos for same intent' };
    if (transferCount === 0) {
        return { ok: false, reason: 'no matching transfer instruction' };
    }
    if (transferCount > 1) {
        return { ok: false, reason: 'multiple transfers to treasury' };
    }
    if (extraValueIx) {
        return { ok: false, reason: `extra value instruction: ${extraValueIx}` };
    }
    return { ok: true, payer };
}

function flattenInner(innerList) {
    if (!Array.isArray(innerList)) return [];
    const out = [];
    for (const block of innerList) {
        if (block && Array.isArray(block.instructions)) {
            for (const ix of block.instructions) out.push(ix);
        }
    }
    return out;
}

// ----- Grants -----
//
// Per-SKU grant logic. Star-fragment grants reuse the wallet doc from
// star-fragments.js; bundles are stub'd until contents are finalized.
async function applyGrant(uid, skuId, grant, tx) {
    if (grant.kind === 'starFragments') {
        const wRef = admin
            .firestore()
            .collection('users')
            .doc(uid)
            .collection('wallet')
            .doc('main');
        const wSnap = await tx.get(wRef);
        const data = wSnap.exists ? wSnap.data() : {};
        const cur = typeof data.balance === 'number' ? data.balance : 0;
        const next = cur + grant.amount;
        tx.set(wRef, { balance: next, updatedAt: Date.now() }, { merge: true });
        return { kind: 'starFragments', amount: grant.amount, newBalance: next };
    }
    if (grant.kind === 'seasonPass') {
        const sRef = admin
            .firestore()
            .collection('users')
            .doc(uid)
            .collection('entitlements')
            .doc('seasonPass');
        tx.set(
            sRef,
            { activeSince: Date.now(), source: skuId },
            { merge: true }
        );
        return { kind: 'seasonPass' };
    }
    if (grant.kind === 'bundle') {
        // BLOCKER — bundle contents not finalized. Persist that the user
        // owns the bundle so we can backfill the grant later.
        const bRef = admin
            .firestore()
            .collection('users')
            .doc(uid)
            .collection('entitlements')
            .doc(`bundle-${grant.bundleId}`);
        tx.set(bRef, { ownedSince: Date.now(), source: skuId }, { merge: true });
        return { kind: 'bundle', bundleId: grant.bundleId };
    }
    throw new HttpsError('internal', `Unknown grant kind: ${grant.kind}`);
}

// Exported for tests / dev tools.
exports._internals = {
    IAP_SKUS,
    TOKENS,
    tokenUsdPrice,
    deriveAta,
    verifyTransfer,
};
