// Pure state resolver. No Firestore, no Privy, no I/O.
// Given a state snapshot + `now`, returns the resolved snapshot.
// Called from game-state.js on every read and before every mutation.

const MEAL_WINDOWS = {
  breakfast: { startHour: 6, endHour: 10 },
  lunch: { startHour: 11, endHour: 14 },
  dinner: { startHour: 17, endHour: 21 },
};

const SLEEP_REQUIRED_MS = 8 * 60 * 60 * 1000;
const ENERGY_DECAY_HOURS = 4; // lose 1 energy per 4 awake hours

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
// Uses a calibration pass because JS Date can't directly construct a local-tz timestamp.
function tzWallClockToMs(dateKey, hour, tz) {
  const [y, m, d] = dateKey.split('-').map(Number);
  // Start with UTC approximation, then correct for tz offset.
  let guess = Date.UTC(y, m - 1, d, hour, 0, 0, 0);
  // What hour does this guess appear as in tz?
  for (let i = 0; i < 2; i++) {
    const appearedHour = localHour(guess, tz);
    const appearedDateKey = localDateKey(guess, tz);
    const expected = { dateKey, hour };
    // If we're in the right hour on the right day, done.
    if (appearedHour === expected.hour && appearedDateKey === expected.dateKey) return guess;
    // Otherwise offset by difference
    const hourDiff = expected.hour - appearedHour;
    const dayDiff =
      expected.dateKey < appearedDateKey ? -1 : expected.dateKey > appearedDateKey ? 1 : 0;
    guess += (dayDiff * 24 + hourDiff) * 3600 * 1000;
  }
  return guess;
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

function currentWindowName(ms, tz) {
  const hour = localHour(ms, tz);
  for (const [name, { startHour, endHour }] of Object.entries(MEAL_WINDOWS)) {
    if (hour >= startHour && hour < endHour) return name;
  }
  return null;
}

function defaultMealClaims(dateKey) {
  return { dateKey, breakfast: false, lunch: false, dinner: false };
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
    mealBonusClaimed: defaultMealClaims(localDateKey(nowMs, tz || 'UTC')),
    totalFeedings: 0,
    totalPlays: 0,
    totalSleeps: 0,
    level: 1,
    experience: 0,
  };
}

// Normalize: make sure derived fields exist, claims match today's dateKey.
function normalize(state, nowMs) {
  const tz = state.timezone || 'UTC';
  const todayKey = localDateKey(nowMs, tz);
  const claims = state.mealBonusClaimed;
  const needsReset = !claims || claims.dateKey !== todayKey;
  return {
    ...state,
    mealBonusClaimed: needsReset ? defaultMealClaims(todayKey) : claims,
  };
}

// Pure: resolve stats from lastResolvedAt to nowMs.
// Sleep pauses all decay; waking up does not happen here (handled by endSleep mutator).
function resolve(state, nowMs) {
  if (state.sleepStartedAt) {
    // No decay while asleep. Keep lastResolvedAt as-is.
    return normalize(state, nowMs);
  }

  const tz = state.timezone || 'UTC';
  const fromMs = state.lastResolvedAt || nowMs;
  if (nowMs <= fromMs) return normalize(state, nowMs);

  const todayKey = localDateKey(nowMs, tz);
  const claims = state.mealBonusClaimed || defaultMealClaims(todayKey);

  const ends = getWindowEndsInRange(fromMs, nowMs, tz);
  let missed = 0;
  for (const { windowName, dateKey } of ends) {
    // A window is "missed" if its end time passed unclaimed.
    // We only have claim state for today; assume unclaimed for prior days.
    if (dateKey === claims.dateKey && claims[windowName]) continue;
    missed++;
  }

  const hoursAwake = (nowMs - fromMs) / 3600000;
  const energyDrop = Math.floor(hoursAwake / ENERGY_DECAY_HOURS);

  const nextClaims =
    claims.dateKey === todayKey ? claims : defaultMealClaims(todayKey);

  return {
    ...state,
    hunger: clamp(1, 5, state.hunger - missed),
    mood: clamp(1, 5, state.mood - missed),
    energy: clamp(1, 5, state.energy - energyDrop),
    mealBonusClaimed: nextClaims,
    lastResolvedAt: nowMs,
  };
}

// Feed action: bumps hunger + optional mood boost, grants meal-window bonus if applicable.
function applyFeed(state, nowMs, hungerBoost = 0, moodBoost = 0) {
  if (state.sleepStartedAt) {
    throw new Error('Cannot feed: moonoko is sleeping');
  }
  const resolved = resolve(state, nowMs);
  const tz = resolved.timezone || 'UTC';
  const windowName = currentWindowName(nowMs, tz);
  const claims = { ...resolved.mealBonusClaimed };
  let bonusMood = 0;
  if (windowName && !claims[windowName]) {
    bonusMood = 1;
    claims[windowName] = true;
  }
  return {
    ...resolved,
    hunger: clamp(1, 5, resolved.hunger + hungerBoost),
    mood: clamp(1, 5, resolved.mood + moodBoost + bonusMood),
    mealBonusClaimed: claims,
    totalFeedings: (resolved.totalFeedings || 0) + 1,
    experience: (resolved.experience || 0) + 10,
    lastResolvedAt: nowMs,
  };
}

function applyPlay(state, nowMs) {
  if (state.sleepStartedAt) {
    throw new Error('Cannot play: moonoko is sleeping');
  }
  const resolved = resolve(state, nowMs);
  return {
    ...resolved,
    mood: clamp(1, 5, resolved.mood + 1),
    energy: clamp(1, 5, resolved.energy - 1),
    totalPlays: (resolved.totalPlays || 0) + 1,
    experience: (resolved.experience || 0) + 15,
    lastResolvedAt: nowMs,
  };
}

function applyChat(state, nowMs) {
  if (state.sleepStartedAt) {
    throw new Error('Cannot chat: moonoko is sleeping');
  }
  const resolved = resolve(state, nowMs);
  return {
    ...resolved,
    mood: clamp(1, 5, resolved.mood + 1),
    lastResolvedAt: nowMs,
  };
}

function applyStartSleep(state, nowMs) {
  if (state.sleepStartedAt) {
    // Already sleeping — idempotent.
    return state;
  }
  const resolved = resolve(state, nowMs);
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

module.exports = {
  MEAL_WINDOWS,
  SLEEP_REQUIRED_MS,
  defaultState,
  normalize,
  resolve,
  applyFeed,
  applyPlay,
  applyChat,
  applyStartSleep,
  applyEndSleep,
  currentWindowName,
  localDateKey,
  localHour,
};
