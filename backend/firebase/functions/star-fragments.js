// Server-authoritative Star Fragment wallet + daily spin gacha.
//
// Storage layout:
//   users/{uid}/wallet/main  →  { balance: number, dailySpin: { lastClaimedAtMs },
//                                 updatedAt }
// Inventory grants land in users/{uid}/inventory/ingredients (same doc the
// foraging drain writes to) so cooking sees them immediately.

const { onCall, HttpsError } = require('firebase-functions/v2/https');
const admin = require('./admin');
const { INGREDIENT_TIER, isKnownIngredient } = require('./recipe-catalog');

const REGION = 'us-central1';
const COMMON_OPTS = { cors: true, region: REGION };

const DAILY_SPIN_COOLDOWN_MS = 24 * 60 * 60 * 1000;

function requireAuth(request) {
    const uid = request.auth && request.auth.uid;
    if (!uid) {
        throw new HttpsError('unauthenticated', 'Must sign in');
    }
    return uid;
}

function walletRef(uid) {
    return admin.firestore().collection('users').doc(uid).collection('wallet').doc('main');
}

function inventoryRef(uid) {
    return admin
        .firestore()
        .collection('users')
        .doc(uid)
        .collection('inventory')
        .doc('ingredients');
}

async function loadWallet(uid) {
    const snap = await walletRef(uid).get();
    if (!snap.exists) {
        return { balance: 0, dailySpin: { lastClaimedAtMs: 0 } };
    }
    const data = snap.data() || {};
    return {
        balance: typeof data.balance === 'number' ? data.balance : 0,
        dailySpin: {
            lastClaimedAtMs:
                (data.dailySpin && data.dailySpin.lastClaimedAtMs) || 0,
        },
    };
}

exports.getStarFragments = onCall(COMMON_OPTS, async (request) => {
    const uid = requireAuth(request);
    const w = await loadWallet(uid);
    const nowMs = Date.now();
    return {
        balance: w.balance,
        dailySpin: {
            lastClaimedAtMs: w.dailySpin.lastClaimedAtMs,
            nextEligibleAtMs: w.dailySpin.lastClaimedAtMs + DAILY_SPIN_COOLDOWN_MS,
            available: nowMs - w.dailySpin.lastClaimedAtMs >= DAILY_SPIN_COOLDOWN_MS,
        },
    };
});

exports.spendStarFragments = onCall(COMMON_OPTS, async (request) => {
    const uid = requireAuth(request);
    const amount = Number(request.data && request.data.amount);
    const reason = String((request.data && request.data.reason) || 'spend');
    if (!Number.isFinite(amount) || amount <= 0 || !Number.isInteger(amount)) {
        throw new HttpsError('invalid-argument', 'amount must be a positive integer');
    }

    const ref = walletRef(uid);
    const newBalance = await admin.firestore().runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        const data = snap.exists ? snap.data() : {};
        const current = typeof data.balance === 'number' ? data.balance : 0;
        if (current < amount) {
            throw new HttpsError('failed-precondition', 'Insufficient Star Fragments');
        }
        const next = current - amount;
        tx.set(
            ref,
            { balance: next, updatedAt: Date.now() },
            { merge: true }
        );
        return next;
    });

    // Best-effort transaction log — doesn't block the spend if it fails.
    try {
        await admin
            .firestore()
            .collection('users')
            .doc(uid)
            .collection('walletTx')
            .add({ amount: -amount, reason, balanceAfter: newBalance, atMs: Date.now() });
    } catch (_e) {}

    return { newBalance };
});

// Atomic credit — used by daily-spin and (in tests) admin grants. Not exposed
// directly; client cannot mint SF.
async function creditStarFragments(uid, amount, reason, tx) {
    const ref = walletRef(uid);
    const snap = await tx.get(ref);
    const data = snap.exists ? snap.data() : {};
    const current = typeof data.balance === 'number' ? data.balance : 0;
    const next = current + amount;
    tx.set(ref, { balance: next, updatedAt: Date.now() }, { merge: true });
    return next;
}

// Increment ingredient counts inside the same transaction so balance + grant
// land atomically. Mirrors the foraging drain inventory update.
async function creditIngredients(uid, counts, tx) {
    const ref = inventoryRef(uid);
    const snap = await tx.get(ref);
    const cur = snap.exists ? snap.data() : {};
    const next = { ...(cur.counts || {}) };
    for (const [id, qty] of Object.entries(counts)) {
        if (!isKnownIngredient(id)) continue;
        if (!Number.isFinite(qty) || qty <= 0) continue;
        next[id] = (next[id] || 0) + Math.floor(qty);
    }
    tx.set(ref, { counts: next, updatedAt: Date.now() }, { merge: true });
    return next;
}

// Daily spin reward pool. Weights are integers; total can be anything (we
// pick uniformly in [0, sum) and walk). Each entry returns a reward object.
const SPIN_POOL = [
    // 25% — common ingredient (×1)
    { weight: 25, kind: 'ingredient', tier: 'common' },
    // 20% — uncommon ingredient
    { weight: 20, kind: 'ingredient', tier: 'uncommon' },
    // 12% — rare ingredient
    { weight: 12, kind: 'ingredient', tier: 'rare' },
    // 3% — ultra-rare (star_dust)
    { weight: 3,  kind: 'ingredient', tier: 'ultra_rare' },
    // 25% — small SF reward
    { weight: 25, kind: 'starFragments', amount: 10 },
    // 12% — medium SF
    { weight: 12, kind: 'starFragments', amount: 50 },
    // 3% — jackpot SF
    { weight: 3,  kind: 'starFragments', amount: 250 },
];

const TIER_INGREDIENTS = (() => {
    const buckets = { common: [], uncommon: [], rare: [], ultra_rare: [] };
    for (const [id, tier] of Object.entries(INGREDIENT_TIER)) {
        if (buckets[tier]) buckets[tier].push(id);
    }
    return buckets;
})();

function pickReward() {
    const total = SPIN_POOL.reduce((s, e) => s + e.weight, 0);
    let roll = Math.floor(Math.random() * total);
    for (const entry of SPIN_POOL) {
        if (roll < entry.weight) {
            if (entry.kind === 'ingredient') {
                const ids = TIER_INGREDIENTS[entry.tier];
                const id = ids[Math.floor(Math.random() * ids.length)];
                return { kind: 'ingredient', id, qty: 1, tier: entry.tier };
            }
            return { kind: 'starFragments', amount: entry.amount };
        }
        roll -= entry.weight;
    }
    return { kind: 'starFragments', amount: 10 };
}

exports.claimDailySpin = onCall(COMMON_OPTS, async (request) => {
    const uid = requireAuth(request);
    const nowMs = Date.now();
    const reward = pickReward();

    const result = await admin.firestore().runTransaction(async (tx) => {
        const ref = walletRef(uid);
        const snap = await tx.get(ref);
        const data = snap.exists ? snap.data() : {};
        const lastClaimedAtMs =
            (data.dailySpin && data.dailySpin.lastClaimedAtMs) || 0;
        if (nowMs - lastClaimedAtMs < DAILY_SPIN_COOLDOWN_MS) {
            throw new HttpsError(
                'failed-precondition',
                'Daily spin not available yet'
            );
        }

        let newBalance = typeof data.balance === 'number' ? data.balance : 0;
        if (reward.kind === 'starFragments') {
            newBalance += reward.amount;
        } else if (reward.kind === 'ingredient') {
            await creditIngredients(uid, { [reward.id]: reward.qty }, tx);
        }

        tx.set(
            ref,
            {
                balance: newBalance,
                dailySpin: { lastClaimedAtMs: nowMs },
                updatedAt: nowMs,
            },
            { merge: true }
        );

        return {
            reward,
            newBalance,
            nextEligibleAtMs: nowMs + DAILY_SPIN_COOLDOWN_MS,
        };
    });

    return result;
});

// Hackathon demo grant — gives the calling user 10,000 SF on tap. No
// cooldown, no payment, no one-time gate; intended only for the hackathon
// demo period so judges/testers can spin up a wallet instantly. Remove
// (or gate behind a debug flag) before public launch.
const HACKATHON_SPECIAL_AMOUNT = 10000;
exports.claimHackathonSpecial = onCall(COMMON_OPTS, async (request) => {
    const uid = requireAuth(request);
    const newBalance = await admin.firestore().runTransaction(async (tx) =>
        creditStarFragments(uid, HACKATHON_SPECIAL_AMOUNT, 'hackathon_special', tx)
    );
    try {
        await admin
            .firestore()
            .collection('users')
            .doc(uid)
            .collection('walletTx')
            .add({
                amount: HACKATHON_SPECIAL_AMOUNT,
                reason: 'hackathon_special',
                balanceAfter: newBalance,
                atMs: Date.now(),
            });
    } catch (_e) {}
    return { newBalance, granted: HACKATHON_SPECIAL_AMOUNT };
});

// Server-side ingredient prices, keyed by tier. Mirrors
// STAR_FRAGMENT_PRICE_BY_TIER in src/data/shopCatalog.ts — must stay in sync.
// Server is authoritative on price so the client cannot cheat the cost.
const INGREDIENT_PRICE_BY_TIER = {
    common: 8,
    uncommon: 15,
    rare: 25,
    ultra_rare: 60,
};

function ingredientPrice(id) {
    const tier = INGREDIENT_TIER[id];
    return tier ? INGREDIENT_PRICE_BY_TIER[tier] : null;
}

// Atomic shop purchase: deducts SF + grants ingredients in a single
// transaction. Replaces the old mint-style grantPurchasedIngredients —
// authentic callers can no longer get free ingredients without paying.
exports.purchaseIngredients = onCall(COMMON_OPTS, async (request) => {
    const uid = requireAuth(request);
    const counts = (request.data && request.data.counts) || {};
    if (typeof counts !== 'object' || Array.isArray(counts)) {
        throw new HttpsError('invalid-argument', 'counts must be an object');
    }

    const cleaned = {};
    let totalCost = 0;
    for (const [id, qty] of Object.entries(counts)) {
        const price = ingredientPrice(id);
        if (price == null) continue; // unknown id — skip silently
        const n = Math.floor(Number(qty));
        if (!Number.isFinite(n) || n <= 0) continue;
        cleaned[id] = n;
        totalCost += price * n;
    }
    if (Object.keys(cleaned).length === 0 || totalCost <= 0) {
        throw new HttpsError('invalid-argument', 'no purchasable items');
    }

    const result = await admin.firestore().runTransaction(async (tx) => {
        const wRef = walletRef(uid);
        const wSnap = await tx.get(wRef);
        const wData = wSnap.exists ? wSnap.data() : {};
        const balance = typeof wData.balance === 'number' ? wData.balance : 0;
        if (balance < totalCost) {
            throw new HttpsError('failed-precondition', 'Insufficient Star Fragments');
        }

        // Read inventory before any writes (Firestore tx requires reads first).
        const iRef = inventoryRef(uid);
        const iSnap = await tx.get(iRef);
        const curCounts = (iSnap.exists && iSnap.data().counts) || {};
        const nextCounts = { ...curCounts };
        for (const [id, n] of Object.entries(cleaned)) {
            nextCounts[id] = (nextCounts[id] || 0) + n;
        }

        const nowMs = Date.now();
        const newBalance = balance - totalCost;
        tx.set(wRef, { balance: newBalance, updatedAt: nowMs }, { merge: true });
        tx.set(iRef, { counts: nextCounts, updatedAt: nowMs }, { merge: true });

        return { newBalance, granted: cleaned, totalCost };
    });

    return result;
});
