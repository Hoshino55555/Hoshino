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

**Hunger — stepwise, per missed meal window.** Windows (local time) are contiguous and tile the 24h day: breakfast 06–12, lunch 12–18, dinner 18–06 (dinner wraps past midnight). Every local hour resolves to exactly one meal. A "game day" starts at 06:00 and runs to the next 06:00, so dinner eaten at 02:00 belongs to the previous game day's claims. Each unclaimed window end drops hunger by 3 (floor 1). Cascade: 5 → miss → 2 → miss → 1 (bottomed after two consecutive misses). Feeding *during* a window claims it (no decay at window end). Each feeding is worth up to +3 hunger (clamp 1–5), so climbing from 1 back to 5 takes two feedings.

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
| Breakfast window opens (06:00) | 5 | 5 |
| Breakfast ends unclaimed (12:00) | 2 | 5 |
| Lunch window opens (12:00) | 2 | 5 |
| Feed during lunch (+3 H) | 5 | 5 |
| Lunch ends claimed (18:00) — no decay | 5 | 5 |
| Dinner ends unclaimed (06:00 next day) | 2 | 5 |

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

When a tick produces a find, roll a second random for tier, then a third to pick an ingredient within that tier's pool. Base distribution plus mood shift:

| Tier | Base | Shift per mood point above 3 |
|---|---:|---|
| Common | 60% | −4% |
| Uncommon | 25% | 0 |
| Rare | 12% | +2% |
| Ultra rare | 3% | +2% |

Examples:
- Mood = 1 → Common 68% / Uncommon 25% / Rare 8% / Ultra rare 0% (ultra rare clamps to 0, redistributed to common)
- Mood = 3 → baseline
- Mood = 5 → Common 52% / Uncommon 25% / Rare 16% / Ultra rare 7%

### Ingredient pool

16 ingredients across 4 tiers. Within a tier, picks are uniform — every common is equally likely when the roll lands on "common", and so on.

| Tier | Pool |
|---|---|
| Common (5) | `egg`, `lettuce`, `potato`, `rice`, `carrot` |
| Uncommon (6) | `banana`, `strawberry`, `tomato`, `tofu`, `oat`, `bread` |
| Rare (4) | `bacon`, `milk`, `tuna`, `gouda` |
| Ultra rare (1) | `star_dust` |

The tier + within-tier split means adding a new ingredient doesn't require retuning the rarity curve — drop it into the relevant pool and it inherits the tier's drop odds (divided across pool size).

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

### Cooking

The v1 cooking system is trial-and-error: toss any subset of foraged ingredients into the pot, and the recipe catalog decides what you made.

- Canonical match is a **sorted multiset** of ingredient ids — order doesn't matter, duplicates do.
- If the multiset matches a recipe exactly → that dish, full reward.
- Any other combination → **slop** (still food, trivial base points, still feeds). This is the discovery loop.

**One cook per meal window.** A successful cook *claims* the current meal window just like a raw feed does. The server throws on repeat cook attempts inside the same window, and the client greys out the manual + recipe cards to match. Rationale: hunger boosts are the strongest lever in the game; uncapped cooking would let grinders pin hunger at 5 and trivialize the forage cadence clock that punishes neglect. Players who feed on schedule still sit near hunger=5 naturally; repeat cooks only ever bought spam.

Catalog: [src/services/RecipeCatalog.ts](../src/services/RecipeCatalog.ts). 14 recipes to start:

| Recipe | Ingredients | Tier signal |
|---|---|---|
| Eggtato | egg, potato | 2× common |
| Wobble | egg, strawberry | common + uncommon |
| Veggeta | carrot, rice, tofu | 2× common + uncommon |
| Miso Nori | carrot, egg, lettuce, potato, tofu | 4× common + uncommon |
| Healthy Era | carrot, egg, lettuce, potato, tofu, tomato | 4× common + 2× uncommon |
| Maki-chan | lettuce, rice, tuna | 2× common + rare |
| Oat & Cheese | gouda, oat | uncommon + rare |
| Oatmaxxing | milk, oat, strawberry | 2× uncommon + rare |
| Babana Bred | banana, egg, milk, oat | common + 2× uncommon + rare |
| Hoshi Boba | banana, milk, rice, strawberry | common + 2× uncommon + rare |
| Burdger | bacon, bread, lettuce, tomato | common + 2× uncommon + rare |
| Don't Ask.. | bacon, star_dust, tuna | 2× rare + ultra rare |
| Hoshi Tato | banana, egg, milk, star_dust, strawberry | common + 2× uncommon + rare + ultra rare |
| TURBOSLAYER9000 | bacon, bread, gouda, lettuce, star_dust | common + uncommon + 2× rare + ultra rare |

The tier-signal column is advisory — it's just the sum of constituent tiers, useful for surfacing "you probably can't cook this yet" hints without hardcoding per-recipe unlock gates.

### Dish art — placeholder until authored

Per-recipe dish sprites haven't been authored yet. Until they land, the recipe book picks one of three existing ingredient sprites (Mira Berry / Nova Egg / Pink Sugar) per recipe by hashing the recipe id, so the same recipe always shows the same placeholder. When real art ships, replace `PLACEHOLDER_DISH_IMAGES` in [src/components/FeedingPage.tsx](../src/components/FeedingPage.tsx) with a per-recipe map. The forage pop-out uses the same placeholder scheme hashed by foraged-item id.

### Dual XP — player score vs. recipe progress

Cooking drives two independent counters. Both pull from the same mood × hunger multiplier stack, so stat management is load-bearing for both, but the swings are deliberately different magnitudes.

**Shared multipliers** (evaluated from the pre-feed resolved state):

```
moodMult   = 1 + 0.1 * mood       // mood ∈ [0,5] → 1.0..1.5, clamped stats put it at 1.1..1.5
hungerMult = 0.5 + 0.1 * hunger   // hunger ∈ [0,5] → 0.5..1.0, clamped stats at 0.6..1.0
```

**Player XP** (cumulative season score — leaderboard lever):

```
recipeLevelBonus = 1 + 0.1 * (level - 1)        // +10% per recipe level above 1
playerXp         = basePoints
                 * recipeLevelBonus
                 * moodMult
                 * hungerMult
```

- `basePoints` is the sum of constituent ingredient tier points × 10 (2 commons → 20, ultra-rare combos → 100+). Slop is a flat 3.
- The product of mood × hunger modifiers lives in ~0.66× (mood 1, hunger 1) to 1.5× (mood 5, hunger 5). Well-timed feeds can more than 2× a badly-timed one at the same recipe.
- `recipeLevelBonus` applies to recipes only; slop has no level track and its bonus is 1.0×.
- Slop still gets the mood/hunger swing on its 3-point base, so feeding well matters even when you fail the recipe match.

**Recipe progress** (per-recipe level, separate from player XP):

```
progressDelta = 1 + 0.2 * (moodMult * hungerMult - 1)   // subtle ±10% band
level         = 1 + floor(recipeProgress / 3)           // no cap
```

- Stored in `/users/{uid}/cooking/profile.recipeProgress` as `{ [recipeId]: number }` floats.
- Three cooks at baseline (`moodMult*hungerMult = 1.0`) hits level 2. Strong modifiers shave ~10% off the progress needed; weak modifiers add ~10%. Over a season this compounds, but never dominates basePoint tier ordering — an ultra-rare combo at level 1 still out-scores a 2-common recipe at level 5.
- Slop does **not** advance any recipe (no matched recipe to credit).
- No level cap for the hackathon build. If leaderboard telemetry shows a grind ceiling problem we'll add one.

**Why two counters.** Player XP is the *outcome* score — the thing the leaderboard ranks. Recipe level is the *input* lever — it makes the same recipe quietly more valuable over time, so players invest in favorites instead of always chasing ultra-rares. The multipliers are shared so stat management affects both, but the recipe-progress delta is compressed by 0.2 so the leveling race doesn't trivialize the base-points tier structure.

- v1 (April 30 hackathon target): server-authoritative cook with one-per-window claim, dual-XP accounting, per-recipe progress tracking, and 2-col recipe book UI with placeholder dish art are all shipped. Open task: real per-recipe dish sprites.
- v2 (post-hackathon): authored dish art, recipe unlock animations, possibly a recipe-level-cap if telemetry shows one is needed.

## Sleep

- 8 hour required for full rest.
- Client surface currently disabled pending UX rework ([DIRECTION.md §13](DIRECTION.md#13-open-questions)). Server-side state engine still tracks sleep.
- Foraging continues during sleep at reduced rate — this is how overnight progress accrues for the morning recap.

## Tuning process

1. When tuning a lever, update the constant in [game-state-engine.js](../backend/firebase/functions/game-state-engine.js) and the table in this doc in the **same commit**.
2. Ship a preview APK to at least one beta tester before locking the change.
3. Record playtest-driven changes in the commit message body, not here — this doc is the *current* state, not history.
