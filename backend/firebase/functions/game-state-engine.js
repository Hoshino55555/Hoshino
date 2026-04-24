// Pure state resolver. No Firestore, no Privy, no I/O.
// Given a state snapshot + `now`, returns the resolved snapshot.
// Called from game-state.js on every read and before every mutation.

// Meal windows cover the full 24h with no grace period. Dinner wraps past
// midnight — from 18:00 local to 06:00 next day. To keep arithmetic simple
// in tzWallClockToMs, dinner's endHour is encoded as 30 (= 24 + 6).
// A "game day" (see gameDayKey) starts at 06:00 local and runs until the
// next 06:00, so dinner Apr 15 belongs to game day Apr 15 even when it
// ends/claims at 02:00 Apr 16.
const MEAL_WINDOWS = {
  breakfast: { startHour: 6, endHour: 12 },
  lunch: { startHour: 12, endHour: 18 },
  dinner: { startHour: 18, endHour: 30 },
};
const GAME_DAY_START_HOUR = 6;

const SLEEP_REQUIRED_MS = 8 * 60 * 60 * 1000;
const ENERGY_DECAY_HOURS = 4; // lose 1 energy per 4 awake hours

// Mood decay clock is separate from meal windows. Base: 1 point per 24 awake
// hours (5→1 in 4 days). Hunger and sleep debt stack additively and
// independently — either can be present without the other:
//   - base:             1x (fed, fully rested)
//   - + HUNGRY_BONUS    if H ≤ 2 (flat add)
//   - + sleep-debt      linear from 0 at E=5 to MAX at E=1 (independent of hunger)
// Examples:
//   - Fed, not slept (H=5, E=1):      1 + 0 + 1.0 = 2.0x
//   - Hungry, rested (H=1, E=5):      1 + 1 + 0   = 2.0x
//   - Hungry, partial sleep (H=1, E=3): 1 + 1 + 0.5 = 2.5x
//   - Hungry, no sleep (H=1, E=1):    1 + 1 + 1.0 = 3.0x
const MOOD_DECAY_BASE_MS = 24 * 3600 * 1000;
const MOOD_DECAY_HUNGRY_THRESHOLD = 2;
const MOOD_DECAY_HUNGRY_BONUS = 1.0; // flat add when hungry
const MOOD_DECAY_SLEEP_DEBT_MAX_BONUS = 1.0; // full add when E=1, scaled down as E rises

// Hunger is stepwise: each missed meal window drops hunger by this amount,
// floored at 1. 5→2→1 in two missed meals.
const HUNGER_DECAY_PER_MISS = 3;

// Foraging constants. Tuned in docs/GAME_MECHANICS.md — keep in sync.
//
// Model: passive forage events scheduled by hunger (cadence), yielding 0–3
// ingredients per event via Binomial(3, p) where p is driven by energy.
// Mood shifts the rarity tier of each yielded ingredient.
const FORAGE_MIN_INTERVAL_MS = 15 * 60 * 1000; // hunger=5 → forage every 15 min
const FORAGE_INTERVAL_STEP_MS = 5 * 60 * 1000; // each hunger step below 5 adds 5 min
const FORAGE_SLEEP_RATE_MULT = 0.7; // per-slot prob multiplied during sleep
const FORAGE_SLOTS_PER_TICK = 3; // max ingredients per forage event
const FORAGE_BASE_SLOT_PROB = 0.05; // energy=1
const FORAGE_ENERGY_COEF = 0.025; // per energy point above 1

// Rarity tier → ingredient pool. Each successful slot picks a tier (from the
// mood-driven CDF), then picks one ingredient uniformly within that tier's
// array using an additional random byte. Keep in sync with the recipe catalog
// and the docs/GAME_MECHANICS.md ingredient table.
const FORAGE_INGREDIENT_BY_TIER = {
  common: ['egg', 'lettuce', 'potato', 'rice', 'carrot'],
  uncommon: ['banana', 'strawberry', 'tomato', 'tofu', 'oat', 'bread'],
  rare: ['bacon', 'milk', 'tuna', 'gouda'],
  ultra_rare: ['star_dust'],
};

// Cap how much backlog is honored. If a user is away longer than this, we
// fast-forward `lastForagedAt` to (now - cap) so they get the cap's worth of
// yield, not unbounded. The event count cap is a belt-and-suspenders guard
// against bad stats values producing sub-interval replay loops.
const FORAGE_MAX_CATCHUP_MS = 3 * 24 * 3600 * 1000; // 3 days
const FORAGE_MAX_CATCHUP_EVENTS = 3 * 96; // 3 days at min (15 min) interval

const clamp = (min, max, n) => Math.max(min, Math.min(max, n));

function localDateKey(ms, tz) {
  // en-CA format is YYYY-MM-DD
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(ms));
}

function localHour(ms, tz) {
  const h = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hour: 'numeric',
    hour12: false,
  }).format(new Date(ms));
  return parseInt(h, 10);
}

// Get the epoch ms at (dateKey, hour, 0, 0) in the given timezone.
// `hour` may be ≥ 24 to express wall-clock times that spill past midnight
// (e.g. dinner's endHour=30 means 06:00 the day *after* dateKey). We roll the
// date forward so the calibration loop always works with an in-range hour.
// Uses a calibration pass because JS Date can't directly construct a local-tz timestamp.
function tzWallClockToMs(dateKey, hour, tz) {
  const daysForward = Math.floor(hour / 24);
  const hourInDay = hour - daysForward * 24;
  let effectiveDateKey = dateKey;
  if (daysForward > 0) {
    const [y0, m0, d0] = dateKey.split('-').map(Number);
    const next = new Date(Date.UTC(y0, m0 - 1, d0 + daysForward));
    effectiveDateKey =
      `${next.getUTCFullYear()}-` +
      `${String(next.getUTCMonth() + 1).padStart(2, '0')}-` +
      `${String(next.getUTCDate()).padStart(2, '0')}`;
  }
  const [y, m, d] = effectiveDateKey.split('-').map(Number);
  // Start with UTC approximation, then correct for tz offset.
  let guess = Date.UTC(y, m - 1, d, hourInDay, 0, 0, 0);
  // What hour does this guess appear as in tz?
  for (let i = 0; i < 2; i++) {
    const appearedHour = localHour(guess, tz);
    const appearedDateKey = localDateKey(guess, tz);
    // If we're in the right hour on the right day, done.
    if (appearedHour === hourInDay && appearedDateKey === effectiveDateKey) return guess;
    // Otherwise offset by difference
    const hourDiff = hourInDay - appearedHour;
    const dayDiff =
      effectiveDateKey < appearedDateKey ? -1 : effectiveDateKey > appearedDateKey ? 1 : 0;
    guess += (dayDiff * 24 + hourDiff) * 3600 * 1000;
  }
  return guess;
}

// A "game day" starts at GAME_DAY_START_HOUR local time. Dinner eaten at
// 02:00 belongs to the previous game day (so claims.dateKey matches the
// window's start-day, not the calendar day it technically ends on).
function gameDayKey(ms, tz) {
  return localDateKey(ms - GAME_DAY_START_HOUR * 3600 * 1000, tz);
}

function getWindowEndsInRange(fromMs, toMs, tz) {
  if (fromMs >= toMs) return [];
  const results = [];
  const DAY_MS = 24 * 3600 * 1000;
  // Start one day before fromMs to be safe across DST boundaries
  let cursor = fromMs - DAY_MS;
  const limit = toMs + DAY_MS;
  while (cursor <= limit) {
    const dk = localDateKey(cursor, tz);
    for (const [windowName, { endHour }] of Object.entries(MEAL_WINDOWS)) {
      const endMs = tzWallClockToMs(dk, endHour, tz);
      if (endMs > fromMs && endMs <= toMs) {
        results.push({ windowName, endMs, dateKey: dk });
      }
    }
    cursor += DAY_MS;
  }
  // Dedupe (DST boundaries can cause double-visits of same day)
  const seen = new Set();
  return results.filter(({ windowName, dateKey }) => {
    const key = `${dateKey}|${windowName}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// Contiguous windows: every local hour maps to exactly one meal. Dinner
// covers the 18:00–06:00 wrap, so hours 0–5 and 18–23 both resolve to dinner.
function currentWindowName(ms, tz) {
  const hour = localHour(ms, tz);
  if (hour >= 6 && hour < 12) return 'breakfast';
  if (hour >= 12 && hour < 18) return 'lunch';
  return 'dinner';
}

function defaultMealClaims(dateKey) {
  return { dateKey, breakfast: false, lunch: false, dinner: false };
}

// ----- Foraging -----

// Interval between forage events. Hunger=5 → 15 min (every tick feels snappy),
// hunger=1 → 35 min (the moonoko is distracted and foraging less). See
// docs/GAME_MECHANICS.md § Foraging.
function forageInterval(hunger) {
  const h = clamp(1, 5, hunger);
  return FORAGE_MIN_INTERVAL_MS + (5 - h) * FORAGE_INTERVAL_STEP_MS;
}

// Per-slot yield probability. Energy=5 → 0.15 (expected 0.45 ingredients per
// event, from Binomial(3, 0.15)). Energy=1 → 0.05 (0.15 avg). Sleep multiplies
// by FORAGE_SLEEP_RATE_MULT.
function forageSlotProb(energy, asleep) {
  const e = clamp(1, 5, energy);
  const base = FORAGE_BASE_SLOT_PROB + (e - 1) * FORAGE_ENERGY_COEF;
  return asleep ? base * FORAGE_SLEEP_RATE_MULT : base;
}

// Tier weights from mood (1..5). Ultra-rare clamps to 0 when the shift would
// make it negative; the mass is redistributed into common. Returns an ordered
// array of [tier, cumulativeWeight] pairs summing to 1.0, ready for bucket
// pick.
function forageTierCDF(mood) {
  const moodDelta = mood - 3;
  let common = 0.6 - moodDelta * 0.04;
  const uncommon = 0.25;
  let rare = 0.12 + moodDelta * 0.02;
  let ultraRare = 0.03 + moodDelta * 0.02;
  if (ultraRare < 0) {
    common += ultraRare; // ultraRare is negative, so this subtracts
    ultraRare = 0;
  }
  if (rare < 0) {
    common += rare;
    rare = 0;
  }
  return [
    ['common', common],
    ['uncommon', common + uncommon],
    ['rare', common + uncommon + rare],
    ['ultra_rare', common + uncommon + rare + ultraRare],
  ];
}

// Pick a tier from a [0,1) random. `u` is a float.
function pickTier(u, mood) {
  const cdf = forageTierCDF(mood);
  for (const [tier, ceiling] of cdf) {
    if (u < ceiling) return tier;
  }
  return 'common'; // numerical safety net
}

// Replay foraging events from state.lastForagedAt (exclusive) up to nowMs
// (inclusive). Each event rolls FORAGE_SLOTS_PER_TICK independent ingredient
// slots; success-per-slot probability comes from energy, tier from mood.
// Event spacing comes from hunger (via forageInterval).
//
// We use current (post-decay) hunger/energy uniformly for all replayed events
// — precise retroactive stat simulation is out of scope for v1.
//
// `randomBytes(userId, tickMs)` is injected so HMAC vs VRF can swap cleanly.
// Must return ≥ 3 * FORAGE_SLOTS_PER_TICK bytes:
//   bytes[0..slots-1]            gate each slot (find/no-find)
//   bytes[slots..2*slots-1]      pick tier for successful slots
//   bytes[2*slots..3*slots-1]    pick ingredient within the chosen tier
function resolveForaging(state, nowMs, randomBytes) {
  const asleep = !!state.sleepStartedAt;
  const interval = forageInterval(state.hunger);
  const slotProb = forageSlotProb(state.energy, asleep);

  // Fast-forward lastForagedAt if the gap exceeds the catchup cap — we honor
  // at most FORAGE_MAX_CATCHUP_MS of backlog no matter how long the user is away.
  let lastForagedAt = state.lastForagedAt || nowMs;
  if (nowMs - lastForagedAt > FORAGE_MAX_CATCHUP_MS) {
    lastForagedAt = nowMs - FORAGE_MAX_CATCHUP_MS;
  }

  const finds = [];
  let eventMs = lastForagedAt + interval;
  let lastEventMs = lastForagedAt;
  let replayed = 0;

  while (eventMs <= nowMs && replayed < FORAGE_MAX_CATCHUP_EVENTS) {
    const bytes = randomBytes(state.characterId || 'anon', eventMs);
    for (let slot = 0; slot < FORAGE_SLOTS_PER_TICK; slot++) {
      const findRoll = bytes[slot] / 256;
      if (findRoll < slotProb) {
        const tierRoll = bytes[FORAGE_SLOTS_PER_TICK + slot] / 256;
        const tier = pickTier(tierRoll, state.mood);
        const pool = FORAGE_INGREDIENT_BY_TIER[tier];
        if (pool && pool.length > 0) {
          const poolRoll = bytes[2 * FORAGE_SLOTS_PER_TICK + slot] / 256;
          const ingredient = pool[Math.min(pool.length - 1, Math.floor(poolRoll * pool.length))];
          finds.push({
            id: `${eventMs}-${slot}-${ingredient}`,
            ingredient,
            tier,
            tickMs: eventMs,
            slot,
            source: asleep ? 'sleep' : 'awake',
          });
        }
      }
    }
    lastEventMs = eventMs;
    eventMs += interval;
    replayed++;
  }
  return { finds, lastForagedAt: lastEventMs };
}

function defaultState(characterId, nowMs, tz) {
  return {
    characterId,
    hunger: 3,
    mood: 3,
    energy: 5,
    lastResolvedAt: nowMs,
    sleepStartedAt: null,
    timezone: tz || 'UTC',
    mealBonusClaimed: defaultMealClaims(gameDayKey(nowMs, tz || 'UTC')),
    totalFeedings: 0,
    totalPlays: 0,
    totalSleeps: 0,
    level: 1,
    experience: 0,
    moodDecayProgressMs: 0,
    // Foraging
    foragedItems: [],
    lastForagedAt: nowMs, // first event resolves at nowMs + forageInterval(hunger)
    foragedRecapDateKey: localDateKey(nowMs, tz || 'UTC'), // last day recap was shown
  };
}

// Normalize: make sure derived fields exist, claims match today's game day.
function normalize(state, nowMs) {
  const tz = state.timezone || 'UTC';
  const todayKey = gameDayKey(nowMs, tz);
  const claims = state.mealBonusClaimed;
  const needsReset = !claims || claims.dateKey !== todayKey;
  return {
    ...state,
    mealBonusClaimed: needsReset ? defaultMealClaims(todayKey) : claims,
  };
}

// Pure: resolve stats from lastResolvedAt to nowMs. Also replays foraging ticks
// (independent of sleep, sleep just lowers the rate). Caller can pass opts.randomBytes
// to enable foraging; without it, foraging is a no-op (used when engine is loaded
// in environments without server RNG wired up, e.g. tests).
function resolve(state, nowMs, opts = {}) {
  // Apply stat decay first (paused by sleep), then foraging (runs regardless).
  const withDecay = applyStatDecay(state, nowMs);

  if (!opts.randomBytes) {
    return withDecay;
  }

  const { finds, lastForagedAt } = resolveForaging(withDecay, nowMs, opts.randomBytes);
  if (finds.length === 0 && lastForagedAt === withDecay.lastForagedAt) {
    return withDecay;
  }
  return {
    ...withDecay,
    lastForagedAt,
    foragedItems: [...(withDecay.foragedItems || []), ...finds],
  };
}

// Stat-decay half of resolve(). Pulled out so foraging can run post-decay
// regardless of sleep state.
function applyStatDecay(state, nowMs) {
  if (state.sleepStartedAt) {
    // No decay while asleep. Keep lastResolvedAt as-is.
    return normalize(state, nowMs);
  }

  const tz = state.timezone || 'UTC';
  const fromMs = state.lastResolvedAt || nowMs;
  if (nowMs <= fromMs) return normalize(state, nowMs);

  const todayKey = gameDayKey(nowMs, tz);
  const claims = state.mealBonusClaimed || defaultMealClaims(todayKey);

  // Merge hunger-drop events (meal window ends) and energy-drop events (every
  // ENERGY_DECAY_HOURS from fromMs) into a single sorted timeline. Between
  // events, both stats are constant, so the mood decay rate is constant.
  const windowEnds = getWindowEndsInRange(fromMs, nowMs, tz);
  const events = [];
  for (const w of windowEnds) {
    const claimed =
      w.dateKey === claims.dateKey && claims[w.windowName];
    events.push({ t: w.endMs, type: 'hunger', claimed });
  }
  const energyStepMs = ENERGY_DECAY_HOURS * 3600000;
  for (let i = 1; fromMs + i * energyStepMs <= nowMs; i++) {
    events.push({ t: fromMs + i * energyStepMs, type: 'energy' });
  }
  events.sort((a, b) => a.t - b.t);

  let hunger = state.hunger;
  let energy = state.energy;
  let moodDecayMs = state.moodDecayProgressMs || 0;
  let segStart = fromMs;

  const moodMult = (h, e) => {
    const hungryBonus = h <= MOOD_DECAY_HUNGRY_THRESHOLD ? MOOD_DECAY_HUNGRY_BONUS : 0;
    // Sleep-debt bonus: 0 when fully rested (E=5), MAX when exhausted (E=1).
    // Applies regardless of hunger — a well-fed but sleep-deprived moonoko
    // still loses mood faster than one that's fed and rested.
    const sleepDebt = (5 - clamp(1, 5, e)) / 4;
    return 1.0 + hungryBonus + sleepDebt * MOOD_DECAY_SLEEP_DEBT_MAX_BONUS;
  };

  for (const ev of events) {
    moodDecayMs += (ev.t - segStart) * moodMult(hunger, energy);
    if (ev.type === 'hunger') {
      if (!ev.claimed) hunger = Math.max(1, hunger - HUNGER_DECAY_PER_MISS);
    } else {
      energy = Math.max(1, energy - 1);
    }
    segStart = ev.t;
  }
  moodDecayMs += (nowMs - segStart) * moodMult(hunger, energy);

  const moodDrops = Math.floor(moodDecayMs / MOOD_DECAY_BASE_MS);
  const moodRemainderMs = moodDecayMs - moodDrops * MOOD_DECAY_BASE_MS;

  const nextClaims =
    claims.dateKey === todayKey ? claims : defaultMealClaims(todayKey);

  return {
    ...state,
    hunger: clamp(1, 5, hunger),
    mood: clamp(1, 5, state.mood - moodDrops),
    moodDecayProgressMs: moodRemainderMs,
    energy: clamp(1, 5, energy),
    mealBonusClaimed: nextClaims,
    lastResolvedAt: nowMs,
  };
}

// Feed action: bumps hunger + optional mood boost. Claims the meal window if
// we're inside one (which prevents hunger decay at window end) — but no mood
// bonus: mood has its own clock and isn't tied to meal timing.
//
// opts.xp overrides the default +10 per feed (used by cook() to scale xp with
// recipe complexity; slop/one-off feeds stick with the default).
function applyFeed(state, nowMs, hungerBoost = 0, moodBoost = 0, opts = {}) {
  if (state.sleepStartedAt) {
    throw new Error('Cannot feed: moonoko is sleeping');
  }
  const resolved = resolve(state, nowMs, opts);
  const tz = resolved.timezone || 'UTC';
  const windowName = currentWindowName(nowMs, tz);
  const claims = { ...resolved.mealBonusClaimed };
  if (windowName && !claims[windowName]) {
    claims[windowName] = true;
  }
  const xpGain = typeof opts.xp === 'number' ? opts.xp : 10;
  return {
    ...resolved,
    hunger: clamp(1, 5, resolved.hunger + hungerBoost),
    mood: clamp(1, 5, resolved.mood + moodBoost),
    mealBonusClaimed: claims,
    totalFeedings: (resolved.totalFeedings || 0) + 1,
    experience: (resolved.experience || 0) + xpGain,
    lastResolvedAt: nowMs,
  };
}

function applyPlay(state, nowMs, opts = {}) {
  if (state.sleepStartedAt) {
    throw new Error('Cannot play: moonoko is sleeping');
  }
  const resolved = resolve(state, nowMs, opts);
  return {
    ...resolved,
    mood: clamp(1, 5, resolved.mood + 1),
    energy: clamp(1, 5, resolved.energy - 1),
    totalPlays: (resolved.totalPlays || 0) + 1,
    experience: (resolved.experience || 0) + 15,
    lastResolvedAt: nowMs,
  };
}

function applyChat(state, nowMs, opts = {}) {
  if (state.sleepStartedAt) {
    throw new Error('Cannot chat: moonoko is sleeping');
  }
  const resolved = resolve(state, nowMs, opts);
  return {
    ...resolved,
    mood: clamp(1, 5, resolved.mood + 1),
    lastResolvedAt: nowMs,
  };
}

function applyStartSleep(state, nowMs, opts = {}) {
  if (state.sleepStartedAt) {
    // Already sleeping — idempotent.
    return state;
  }
  const resolved = resolve(state, nowMs, opts);
  return {
    ...resolved,
    sleepStartedAt: nowMs,
    lastResolvedAt: nowMs,
  };
}

function applyEndSleep(state, nowMs, opts = {}) {
  if (!state.sleepStartedAt) {
    throw new Error('Not sleeping');
  }
  const elapsed = nowMs - state.sleepStartedAt;
  if (elapsed < SLEEP_REQUIRED_MS && !opts.force) {
    const remainingMin = Math.ceil((SLEEP_REQUIRED_MS - elapsed) / 60000);
    const err = new Error(`Sleep not complete: ${remainingMin} min remaining`);
    err.code = 'sleep-in-progress';
    err.remainingMin = remainingMin;
    throw err;
  }
  // Grant full rest on 8h completion, partial on forced wake.
  const full = elapsed >= SLEEP_REQUIRED_MS;
  return {
    ...state,
    sleepStartedAt: null,
    energy: full ? 5 : clamp(1, 5, state.energy + Math.floor(elapsed / (60 * 60 * 1000) / 2)),
    mood: full ? clamp(1, 5, state.mood + 1) : state.mood,
    totalSleeps: (state.totalSleeps || 0) + (full ? 1 : 0),
    lastResolvedAt: nowMs,
  };
}

// Client consumed the foraged items. Wipe the queue and return state.
function applyDrainForaged(state, nowMs) {
  const tz = state.timezone || 'UTC';
  const todayKey = localDateKey(nowMs, tz);
  return {
    ...state,
    foragedItems: [],
    foragedRecapDateKey: todayKey,
  };
}

// Should the client show the morning recap banner? True if foragedItems
// contains any sleep-sourced finds AND we haven't shown today's recap yet.
function shouldShowMorningRecap(state, nowMs) {
  const tz = state.timezone || 'UTC';
  const todayKey = localDateKey(nowMs, tz);
  if (state.foragedRecapDateKey === todayKey) return false;
  const items = state.foragedItems || [];
  return items.some((f) => f.source === 'sleep');
}

module.exports = {
  MEAL_WINDOWS,
  SLEEP_REQUIRED_MS,
  FORAGE_MIN_INTERVAL_MS,
  FORAGE_SLOTS_PER_TICK,
  FORAGE_INGREDIENT_BY_TIER,
  defaultState,
  normalize,
  resolve,
  applyFeed,
  applyPlay,
  applyChat,
  applyStartSleep,
  applyEndSleep,
  applyDrainForaged,
  shouldShowMorningRecap,
  resolveForaging,
  forageInterval,
  forageSlotProb,
  forageTierCDF,
  pickTier,
  currentWindowName,
  localDateKey,
  localHour,
};
