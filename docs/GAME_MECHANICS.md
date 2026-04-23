# Game Mechanics

Implementation spec for gameplay levers. Numbers here are the current tuning target; real numbers will move with playtesting. When tuning changes, update this doc in the same commit as the code.

Companion to [DIRECTION.md](DIRECTION.md) — that doc is product-level "what the game is", this doc is the levers and formulas.

## Stats

Three visible stats, integer 1–5, always clamped.

| Stat | User-facing | Hidden effect |
|---|---|---|
| Hunger | How hungry | Foraging **find rate** (higher = faster) |
| Mood | How happy | Foraging **rarity distribution** (higher = rarer finds) |
| Energy | Awake / rested | Foraging **find rate** (higher = more finds) |

### Stat decay

Each stat has its own clock — they're deliberately decoupled so "hungry", "tired", and "bored" mean different things to the user.

**Hunger — stepwise, per missed meal window.** Windows (local time): breakfast 06–10, lunch 11–14, dinner 17–21. Each unclaimed window end drops hunger by 3 (floor 1). Between windows there's no hunger decay — grace period. Cascade: 5 → miss → 2 → miss → 1 (bottomed after two consecutive misses). Feeding *during* a window claims it (no decay at window end). Each feeding is worth up to +3 hunger (clamp 1–5), so climbing from 1 back to 5 takes two feedings.

**Energy — time-based.** Drops 1 per 4 awake hours. Full 8h sleep restores to 5. Forced wake grants partial (+1 per 2h slept).

**Mood — time-based, separate clock with hunger + sleep-debt multipliers.** Base rate: 1 point per 24 awake hours (5 → 1 in 4 days if otherwise perfect). Hunger and sleep debt are **independent additive bonuses** — either can present without the other:

- Hungry (H ≤ 2) adds a flat **+1×**.
- Sleep debt adds **0 to +1× linearly** with energy: 0 at E=5, 0.5 at E=3, 1.0 at E=1. Partial sleep (forced wake → partial energy) carries a partial bonus; a completely missed night hits the full +1×.

| Condition | H | E | Multiplier | Effective time to bottom |
|---|:-:|:-:|---:|---|
| Fed + rested | ≥3 | 5 | 1.0× | ~4 days |
| Fed, sleep-starved | ≥3 | 1 | 2.0× | ~2 days |
| Hungry, rested | ≤2 | 5 | 2.0× | ~2 days |
| Hungry, partial sleep | ≤2 | 3 | 2.5× | ~1.5 days |
| Hungry + sleep-starved | ≤2 | 1 | 3.0× | ~1 day |

- Decay pauses entirely during sleep. 8h sleep grants **+1 mood**; forced wake does not.
- The multiplier is evaluated continuously — as hunger and energy drop across the day, the instantaneous mood-decay rate climbs. A fractional-progress accumulator (`moodDecayProgressMs`) carries sub-point decay across `resolve()` calls.

Example timeline (starting H=5, M=5):

| Event | H | M |
|---|---:|---:|
| Breakfast window opens | 5 | 5 |
| Breakfast ends unclaimed | 2 | 5 |
| Lunch window opens (grace) | 2 | 5 |
| Feed during lunch (+3 H) | 5 | 5 |
| Lunch ends claimed — no decay | 5 | 5 |
| Dinner ends unclaimed | 2 | 5 |

Mood is visibly eroded only over days, not single events — `M` column shown here doesn't move within one day because mood decay is continuous and small at this scale.

Implementation: [backend/firebase/functions/game-state-engine.js](../backend/firebase/functions/game-state-engine.js) (`resolve`, `applyStatDecay`, `applyFeed`, `applyStartSleep`, `applyEndSleep`).

## Foraging

Passive ingredient finds that resolve **lazily** in the same `resolve()` pass as stat decay. No cron, no push — when the client calls `getGameState`, any forage events scheduled since `lastForagedAt` are replayed in order and emitted finds are appended to `foragedItems[]`.

Each stat owns one axis, so the triangle of hunger/energy/mood has no redundant controls:

| Stat | Axis |
|---|---|
| Hunger | **Cadence** — time between forage events |
| Energy | **Yield** — per-event ingredient count (0–3) |
| Mood | **Rarity** — tier distribution of each ingredient |

### Cadence (hunger)

```
interval_ms = 15min + (5 - hunger) * 5min
```

| Hunger | Interval | Events/day (max) |
|---:|---:|---:|
| 5 | 15 min | 96 |
| 4 | 20 min | 72 |
| 3 | 25 min | ~58 |
| 2 | 30 min | 48 |
| 1 | 35 min | ~41 |

Hunger *decays* as meal windows pass unclaimed, so a neglected moonoko naturally stretches its own forage interval — the game waits longer for you when you stop showing up.

### Yield (energy)

Each forage event rolls **3 independent slots**, each succeeding with probability `p`:

```
p = 0.05 + (energy - 1) * 0.025          // 0.05 @ E=1 → 0.15 @ E=5
sleep_p = p * 0.7                         // reduced during sleep
```

Yield per event is Binomial(3, p):

| Energy | p | E[yield/event] | Most common outcomes |
|---:|---:|---:|---|
| 5 | 0.150 | 0.45 | 66% zero, 28% one, 5% two |
| 3 | 0.100 | 0.30 | 73% zero, 24% one, 3% two |
| 1 | 0.050 | 0.15 | 86% zero, 13% one, 1% two |

Dry events are the norm — the exclamation badge (below) only appears when yield > 0, so each buzz is meaningful.

### Combined daily yield

```
daily = events_per_day(hunger) * 3 * p(energy)
```

| Profile | Hunger | Energy | Daily yield (sim'd) |
|---|---:|---:|---:|
| Neglected | 1 | 1 | ~6 |
| Typical | 3 | 3 | ~17 |
| Well-tended | 5 | 5 | ~41 |
| Fed but tired | 5 | 1 | ~14 |
| Hungry but rested | 1 | 5 | ~19 |

Stat crosstalk is intentional: "fed but tired" and "hungry but rested" land in the same band but the former buzzes the player often with small yields while the latter delivers fewer, larger bursts. Mood is orthogonal — it shifts what tiers land, not how many.

### Rarity distribution

When a tick produces a find, roll a second random for tier. Base distribution plus mood shift:

| Tier | Base | Shift per mood point above 3 | Ingredient (v1) |
|---|---:|---|---|
| Common | 60% | −4% | Mira Berry |
| Uncommon | 25% | 0 | Nova Egg |
| Rare | 12% | +2% | Pink Sugar |
| Legendary | 3% | +2% | *(reserved)* |

Examples:
- Mood = 1 → Common 68% / Uncommon 25% / Rare 8% / Legendary 0% (legendary clamps to 0, redistributed to common)
- Mood = 3 → baseline
- Mood = 5 → Common 52% / Uncommon 25% / Rare 16% / Legendary 7%

### Ingredient pool (v1 bootstrap)

Three ingredients to start. Each ingredient maps to one rarity tier. Legendary slot is reserved so the UI/drop table is ready when new ingredients land.

| ID | Display | Tier |
|---|---|---|
| `mira_berry` | Mira Berry | Common |
| `nova_egg` | Nova Egg | Uncommon |
| `pink_sugar` | Pink Sugar | Rare |

When more ingredients ship, they fill additional slots per tier — update the table and add ingredient art to `assets/images/ingredients/`.

### Randomness source

Two implementations live side-by-side behind a feature flag `FORAGING_RNG_MODE` (server-side env var, no client knowledge needed):

- **`hmac` (default for April 30)** — `HMAC-SHA256(server_secret, user_id || tick_timestamp_ms)` → 32-byte seed. Unpredictable to the user, verifiable server-side, zero network cost, zero SOL cost.
- **`vrf`** — MagicBlock VRF with a server-signer keypair paying fees. Provably on-chain random. Batched: one VRF request covers N ticks of catch-up, seed is split deterministically. Higher latency (1–5s per batch), has a SOL cost.

Both modes produce the same 32-byte seed; downstream tier + find logic is identical. Swap via env flag without code changes.

### Surfacing finds (exclamation + pop-out)

When `foragedItems[]` is non-empty, the moonoko shows an exclamation overlay above its head. Tapping the character (instead of opening the menu) drains the queue: each ingredient pops out from the character with a short scatter animation and the badge clears. The menu is reachable via the normal tap only when no finds are pending.

This turns the passive forage loop into a tactile check-in — the player taps when they see the badge, and each tap is a mini-reward proportional to how long they were away (and how well they tended the stats).

### Morning recap

On first `getGameState` of a local day, if any pending finds are tagged `source: 'sleep'`, the pop-out is styled as a "while you slept" recap (subtle visual distinction — same mechanic, different framing). No push notifications — deferred to iOS launch.

## Feeding

- Client sends `hungerBoost` (0–3) and `moodBoost` (0–5) per food item.
- Server applies boosts, clamps 1–5. Feeding inside a meal window *claims* it (prevents hunger decay at window end) but grants no mood bonus — mood is on its own clock, deliberately decoupled from meal timing.
- v1: 8 placeholder recipes ([src/components/FeedingPage.tsx](../src/components/FeedingPage.tsx)) each `+1 hunger, +1 mood`.
- v2 (post-hackathon): recipes derived from ingredient combinations — cooking system TBD.

## Sleep

- 8 hour required for full rest.
- Client surface currently disabled pending UX rework ([DIRECTION.md §13](DIRECTION.md#13-open-questions)). Server-side state engine still tracks sleep.
- Foraging continues during sleep at reduced rate — this is how overnight progress accrues for the morning recap.

## Tuning process

1. When tuning a lever, update the constant in [game-state-engine.js](../backend/firebase/functions/game-state-engine.js) and the table in this doc in the **same commit**.
2. Ship a preview APK to at least one beta tester before locking the change.
3. Record playtest-driven changes in the commit message body, not here — this doc is the *current* state, not history.
