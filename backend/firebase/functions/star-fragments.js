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
const idem = require('./idempotency');

const REGION = 'us-central1';
const COMMON_OPTS = { cors: true, region: REGION };

const DAILY_SPIN_COOLDOWN_MS = 24 * 60 * 60 * 1000;

// Forage carry / pantry inventory caps. Values are placeholders pending a
// design pass with Will — chosen to be tuneable without touching call sites.
// Stored on the wallet doc (one cap per user, not per moonoko) so all
// characters share the same pantry/queue.
//
// Carry-cap default sized against the forage rate: at h=5/e=5 the engine
// emits ~1.8 finds/hr awake (~10–14 over an 8h sleep or workday), so a cap
// below ~15 would routinely drop overnight finds. 20 covers a normal sleep
// plus buffer.
const DEFAULT_CARRY_CAP = 20;
const DEFAULT_INVENTORY_CAP = 100;
const CARRY_CAP_INCREMENT = 5;
const INVENTORY_CAP_INCREMENT = 50;
const CARRY_CAP_MAX = 50;
const INVENTORY_CAP_MAX = 500;
const UPGRADE_CARRY_PRICE_SF = 750;
const UPGRADE_INVENTORY_PRICE_SF = 750;

function readCaps(data) {
    return {
        carryCap:
            typeof data.carryCap === 'number' && data.carryCap > 0
                ? data.carryCap
                : DEFAULT_CARRY_CAP,
        inventoryCap:
            typeof data.inventoryCap === 'number' && data.inventoryCap > 0
                ? data.inventoryCap
                : DEFAULT_INVENTORY_CAP,
    };
}

function totalIngredients(counts) {
    let n = 0;
    for (const v of Object.values(counts || {})) {
        if (typeof v === 'number') n += v;
    }
    return n;
}

exports.readCaps = readCaps;
exports.DEFAULT_CARRY_CAP = DEFAULT_CARRY_CAP;
exports.DEFAULT_INVENTORY_CAP = DEFAULT_INVENTORY_CAP;

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
        return {
            balance: 0,
            dailySpin: { lastClaimedAtMs: 0 },
            caps: { carryCap: DEFAULT_CARRY_CAP, inventoryCap: DEFAULT_INVENTORY_CAP },
            activeCamp: null,
        };
    }
    const data = snap.data() || {};
    const nowMs = Date.now();
    const camp = data.activeCamp;
    // Filter out an expired camp at read time so the client never sees stale
    // active state — the doc still has the field but the buff has elapsed.
    const activeCamp =
        camp && typeof camp.expiresAtMs === 'number' && camp.expiresAtMs > nowMs
            ? camp
            : null;
    const rawReadBalance = data.balance;
    const rawBoosters = data && typeof data.boosters === 'object' ? data.boosters : null;
    const boosters = {};
    if (rawBoosters) {
        for (const [k, v] of Object.entries(rawBoosters)) {
            if (Number.isSafeInteger(v) && v > 0) boosters[k] = v;
        }
    }
    return {
        balance:
            Number.isSafeInteger(rawReadBalance) && rawReadBalance >= 0
                ? rawReadBalance
                : 0,
        dailySpin: {
            lastClaimedAtMs:
                (data.dailySpin && data.dailySpin.lastClaimedAtMs) || 0,
        },
        caps: readCaps(data),
        activeCamp,
        boosters,
    };
}

exports.loadWalletForUid = loadWallet;

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
        caps: w.caps,
        capLimits: {
            carryCapMax: CARRY_CAP_MAX,
            inventoryCapMax: INVENTORY_CAP_MAX,
            carryCapIncrement: CARRY_CAP_INCREMENT,
            inventoryCapIncrement: INVENTORY_CAP_INCREMENT,
            upgradeCarryPriceSF: UPGRADE_CARRY_PRICE_SF,
            upgradeInventoryPriceSF: UPGRADE_INVENTORY_PRICE_SF,
        },
        activeCamp: w.activeCamp,
        boosters: w.boosters || {},
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
        const rawCurrent = data.balance;
        const current = Number.isSafeInteger(rawCurrent) && rawCurrent >= 0 ? rawCurrent : 0;
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
    const rawCurrent = data.balance;
    const current = Number.isSafeInteger(rawCurrent) && rawCurrent >= 0 ? rawCurrent : 0;
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

        const rawClaimBalance = data.balance;
        let newBalance =
            Number.isSafeInteger(rawClaimBalance) && rawClaimBalance >= 0
                ? rawClaimBalance
                : 0;
        if (reward.kind === 'starFragments') {
            newBalance += reward.amount;
        } else if (reward.kind === 'ingredient') {
            // Inventory cap enforcement: silently swap ingredient → SF if at
            // the pantry cap so the user still gets *something* from the spin.
            // Read inventory first to honor Firestore tx (reads-before-writes).
            const iRef = inventoryRef(uid);
            const iSnap = await tx.get(iRef);
            const cur = (iSnap.exists && iSnap.data().counts) || {};
            const { inventoryCap } = readCaps(data);
            if (totalIngredients(cur) + reward.qty > inventoryCap) {
                // Convert to a small SF reward instead — same value tier as
                // the smallest SF prize so the spin never feels worthless.
                reward.kind = 'starFragments';
                reward.amount = 10;
                newBalance += 10;
            } else {
                await creditIngredients(uid, { [reward.id]: reward.qty }, tx);
            }
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
// cooldown, no payment, no one-time gate; intentionally unlimited so the
// internal team can top up test wallets freely during the hackathon demo
// period. Remove (or gate behind a debug flag) before public launch — this
// callable is a free SF firehose for any authenticated user.
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
    const requestId = idem.validateRequestId(request.data && request.data.requestId);

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

    // Canonicalized counts string — deterministic across reorderings of the
    // input map. Matching on this (not just totalCost) prevents a replay with
    // a different basket of equivalently-priced items from returning the
    // original cached grant.
    const countsKey = Object.keys(cleaned)
        .sort()
        .map((k) => `${k}:${cleaned[k]}`)
        .join(',');

    const lRef = requestId
        ? idem.ledgerRef({ uid, collection: 'ingredientPurchases', requestId })
        : null;

    const result = await admin.firestore().runTransaction(async (tx) => {
        if (lRef) {
            const replay = await idem.checkIdempotency(tx, lRef, {
                totalCost,
                countsKey,
            });
            if (replay.hit) {
                return {
                    newBalance: replay.cached.newBalance,
                    granted: replay.cached.granted,
                    totalCost: replay.cached.totalCost,
                    replayed: true,
                };
            }
        }
        const wRef = walletRef(uid);
        const wSnap = await tx.get(wRef);
        const wData = wSnap.exists ? wSnap.data() : {};
        const rawBalance = wData.balance;
        const balance = Number.isSafeInteger(rawBalance) && rawBalance >= 0 ? rawBalance : 0;
        if (balance < totalCost) {
            throw new HttpsError('failed-precondition', 'Insufficient Star Fragments');
        }

        // Read inventory before any writes (Firestore tx requires reads first).
        const iRef = inventoryRef(uid);
        const iSnap = await tx.get(iRef);
        const curCounts = (iSnap.exists && iSnap.data().counts) || {};

        // Inventory cap enforcement: refuse the entire purchase if it would
        // overflow the pantry. Refusing keeps the SF safe — better than
        // silently dropping ingredients the user paid for.
        const { inventoryCap } = readCaps(wData);
        const grantTotal = Object.values(cleaned).reduce((s, n) => s + n, 0);
        if (totalIngredients(curCounts) + grantTotal > inventoryCap) {
            throw new HttpsError(
                'failed-precondition',
                `Pantry full (${totalIngredients(curCounts)}/${inventoryCap}) — upgrade Inventory Size or cook to free up room`
            );
        }

        const nextCounts = { ...curCounts };
        for (const [id, n] of Object.entries(cleaned)) {
            nextCounts[id] = (nextCounts[id] || 0) + n;
        }

        const nowMs = Date.now();
        const newBalance = balance - totalCost;
        tx.set(wRef, { balance: newBalance, updatedAt: nowMs }, { merge: true });
        tx.set(iRef, { counts: nextCounts, updatedAt: nowMs }, { merge: true });
        if (lRef) {
            idem.writeLedger(tx, lRef, {
                uid,
                totalCost,
                countsKey,
                granted: cleaned,
                newBalance,
            });
        }

        return { newBalance, granted: cleaned, totalCost, replayed: false };
    });

    return result;
});

// Ingredient boxes — atomic SF deduction + N random rolls within a tier.
// Server is authoritative on tier composition + price + roll count so the
// client cannot cheat the cost or skew the loot table.
const INGREDIENT_BOX_DEFS = {
    'box-ingredients-common':   { tier: 'common',   rolls: 5, priceSF: 30 },
    'box-ingredients-uncommon': { tier: 'uncommon', rolls: 5, priceSF: 60 },
    'box-ingredients-rare':     { tier: 'rare',     rolls: 3, priceSF: 65 },
};

exports.purchaseIngredientBox = onCall(COMMON_OPTS, async (request) => {
    const uid = requireAuth(request);
    const boxId = String((request.data && request.data.boxId) || '');
    const def = INGREDIENT_BOX_DEFS[boxId];
    if (!def) {
        throw new HttpsError('invalid-argument', 'Unknown ingredient box');
    }
    const pool = TIER_INGREDIENTS[def.tier] || [];
    if (pool.length === 0) {
        throw new HttpsError('failed-precondition', 'Tier pool empty');
    }
    const requestId = idem.validateRequestId(request.data && request.data.requestId);

    // Roll outside the transaction — these are pseudo-random pulls and do not
    // depend on read state. The transaction enforces price + atomic credit.
    // The rolled result is then persisted to the idempotency ledger so a
    // replay returns the SAME items the user already saw, not a fresh roll.
    const rolled = {};
    for (let i = 0; i < def.rolls; i++) {
        const id = pool[Math.floor(Math.random() * pool.length)];
        rolled[id] = (rolled[id] || 0) + 1;
    }

    const lRef = requestId
        ? idem.ledgerRef({ uid, collection: 'ingredientBoxPurchases', requestId })
        : null;

    const result = await admin.firestore().runTransaction(async (tx) => {
        if (lRef) {
            const replay = await idem.checkIdempotency(tx, lRef, { boxId });
            if (replay.hit) {
                return {
                    newBalance: replay.cached.newBalance,
                    granted: replay.cached.granted,
                    totalCost: replay.cached.totalCost,
                    rolls: replay.cached.rolls,
                    tier: replay.cached.tier,
                    replayed: true,
                };
            }
        }
        const wRef = walletRef(uid);
        const wSnap = await tx.get(wRef);
        const wData = wSnap.exists ? wSnap.data() : {};
        const rawBalance = wData.balance;
        const balance = Number.isSafeInteger(rawBalance) && rawBalance >= 0 ? rawBalance : 0;
        if (balance < def.priceSF) {
            throw new HttpsError('failed-precondition', 'Insufficient Star Fragments');
        }

        const iRef = inventoryRef(uid);
        const iSnap = await tx.get(iRef);
        const curCounts = (iSnap.exists && iSnap.data().counts) || {};

        // Inventory cap enforcement: refuse the box if it can't fit. `rolls`
        // is the worst-case grant (every roll is a distinct count, total = rolls).
        const { inventoryCap } = readCaps(wData);
        if (totalIngredients(curCounts) + def.rolls > inventoryCap) {
            throw new HttpsError(
                'failed-precondition',
                `Pantry full (${totalIngredients(curCounts)}/${inventoryCap}) — upgrade Inventory Size or cook to free up room`
            );
        }

        const nextCounts = { ...curCounts };
        for (const [id, n] of Object.entries(rolled)) {
            nextCounts[id] = (nextCounts[id] || 0) + n;
        }

        const nowMs = Date.now();
        const newBalance = balance - def.priceSF;
        tx.set(wRef, { balance: newBalance, updatedAt: nowMs }, { merge: true });
        tx.set(iRef, { counts: nextCounts, updatedAt: nowMs }, { merge: true });
        if (lRef) {
            idem.writeLedger(tx, lRef, {
                uid,
                boxId,
                tier: def.tier,
                rolls: def.rolls,
                totalCost: def.priceSF,
                granted: rolled,
                newBalance,
            });
        }

        return {
            newBalance,
            granted: rolled,
            totalCost: def.priceSF,
            rolls: def.rolls,
            tier: def.tier,
            replayed: false,
        };
    });

    // Best-effort tx log.
    try {
        await admin
            .firestore()
            .collection('users')
            .doc(uid)
            .collection('walletTx')
            .add({
                amount: -result.totalCost,
                reason: `box:${boxId}`,
                balanceAfter: result.newBalance,
                granted: result.granted,
                atMs: Date.now(),
            });
    } catch (_e) {}

    return result;
});

// Cap-upgrade callables. Atomic SF deduction + cap bump in a single
// transaction. Server-authoritative on price + increment + hard cap; the
// client cannot bypass the ceiling.
function makeUpgradeCallable({ field, increment, max, priceSF, defaultValue, label }) {
    return onCall(COMMON_OPTS, async (request) => {
        const uid = requireAuth(request);
        const requestId = idem.validateRequestId(request.data && request.data.requestId);
        const lRef = requestId
            ? idem.ledgerRef({ uid, collection: 'capUpgrades', requestId })
            : null;
        const result = await admin.firestore().runTransaction(async (tx) => {
            if (lRef) {
                const replay = await idem.checkIdempotency(tx, lRef, { field });
                if (replay.hit) {
                    return {
                        newBalance: replay.cached.newBalance,
                        [field]: replay.cached[field],
                        replayed: true,
                    };
                }
            }
            const ref = walletRef(uid);
            const snap = await tx.get(ref);
            const data = snap.exists ? snap.data() : {};
            const rawBalance = data.balance;
            const balance = Number.isSafeInteger(rawBalance) && rawBalance >= 0 ? rawBalance : 0;
            const current =
                typeof data[field] === 'number' && data[field] > 0
                    ? data[field]
                    : defaultValue;
            if (current >= max) {
                throw new HttpsError(
                    'failed-precondition',
                    `${label} already at max (${max})`
                );
            }
            if (balance < priceSF) {
                throw new HttpsError(
                    'failed-precondition',
                    'Insufficient Star Fragments'
                );
            }
            const next = Math.min(max, current + increment);
            const nowMs = Date.now();
            tx.set(
                ref,
                { balance: balance - priceSF, [field]: next, updatedAt: nowMs },
                { merge: true }
            );
            if (lRef) {
                idem.writeLedger(tx, lRef, {
                    uid,
                    field,
                    priceSF,
                    newBalance: balance - priceSF,
                    [field]: next,
                });
            }
            return { newBalance: balance - priceSF, [field]: next, replayed: false };
        });
        try {
            await admin
                .firestore()
                .collection('users')
                .doc(uid)
                .collection('walletTx')
                .add({
                    amount: -priceSF,
                    reason: `upgrade:${field}`,
                    balanceAfter: result.newBalance,
                    [field]: result[field],
                    atMs: Date.now(),
                });
        } catch (_e) {}
        return result;
    });
}

exports.upgradeCarryCapacity = makeUpgradeCallable({
    field: 'carryCap',
    increment: CARRY_CAP_INCREMENT,
    max: CARRY_CAP_MAX,
    priceSF: UPGRADE_CARRY_PRICE_SF,
    defaultValue: DEFAULT_CARRY_CAP,
    label: 'Carry Capacity',
});

exports.upgradeInventorySize = makeUpgradeCallable({
    field: 'inventoryCap',
    increment: INVENTORY_CAP_INCREMENT,
    max: INVENTORY_CAP_MAX,
    priceSF: UPGRADE_INVENTORY_PRICE_SF,
    defaultValue: DEFAULT_INVENTORY_CAP,
    label: 'Inventory Size',
});

// Camp catalog. Single active camp slot per user (server-authoritative on
// price + duration). Effects (carryCap × 1.5, forage interval × 0.8) are
// applied in game-state.js getForagingOptsForUser via readActiveCamp.
const CAMP_DEFS = {
    'sleeping-camp': {
        priceSF: 1500,
        durationMs: 7 * 24 * 60 * 60 * 1000, // 1 week
        label: 'Sleeping Camp',
    },
};

// Atomic camp purchase: deduct SF + write activeCamp = { id, startedAtMs,
// expiresAtMs } in one transaction. Refuses while a camp is still active so
// users cannot accidentally double-spend; future "extend" SKU could relax this.
exports.purchaseCamp = onCall(COMMON_OPTS, async (request) => {
    const uid = requireAuth(request);
    const campId = String((request.data && request.data.campId) || '');
    const def = CAMP_DEFS[campId];
    if (!def) {
        throw new HttpsError('invalid-argument', `Unknown camp: ${campId}`);
    }
    const requestId = idem.validateRequestId(request.data && request.data.requestId);
    const lRef = requestId
        ? idem.ledgerRef({ uid, collection: 'campPurchases', requestId })
        : null;

    const result = await admin.firestore().runTransaction(async (tx) => {
        if (lRef) {
            const replay = await idem.checkIdempotency(tx, lRef, { campId });
            if (replay.hit) {
                return {
                    newBalance: replay.cached.newBalance,
                    activeCamp: replay.cached.activeCamp,
                    replayed: true,
                };
            }
        }
        const ref = walletRef(uid);
        const snap = await tx.get(ref);
        const data = snap.exists ? snap.data() : {};
        const rawBalance = data.balance;
        const balance = Number.isSafeInteger(rawBalance) && rawBalance >= 0 ? rawBalance : 0;
        if (balance < def.priceSF) {
            throw new HttpsError(
                'failed-precondition',
                `Not enough Star Fragments — need ${def.priceSF}, have ${balance}.`
            );
        }
        const nowMs = Date.now();
        const existing = data.activeCamp;
        if (
            existing &&
            typeof existing.expiresAtMs === 'number' &&
            existing.expiresAtMs > nowMs
        ) {
            const remainingMs = existing.expiresAtMs - nowMs;
            const days = Math.ceil(remainingMs / (24 * 60 * 60 * 1000));
            throw new HttpsError(
                'failed-precondition',
                `${def.label} still active — ${days} day${days === 1 ? '' : 's'} remaining.`
            );
        }
        const activeCamp = {
            id: campId,
            startedAtMs: nowMs,
            expiresAtMs: nowMs + def.durationMs,
        };
        const newBalance = balance - def.priceSF;
        tx.set(
            ref,
            { balance: newBalance, activeCamp, updatedAt: nowMs },
            { merge: true }
        );
        if (lRef) {
            idem.writeLedger(tx, lRef, {
                uid,
                campId,
                priceSF: def.priceSF,
                newBalance,
                activeCamp,
            });
        }
        return { newBalance, activeCamp, replayed: false };
    });
    return result;
});
