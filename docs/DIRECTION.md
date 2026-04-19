# Hoshino MVP Direction

> Living document. Captures MVP scope, core mechanics, architecture, and open questions for the build. Strategic context (beta design, budget, framework principles) lives in the PDFs at `../Hoshino-Notes/`; this doc is the operational filter for what we're actually building.
>
> **Target ship date: 2026-05-11 (end of month, latest).** ~3.5 weeks from 2026-04-16. Forces aggressive scope compression — see §15.
>
> Last updated: 2026-04-16

---

## 1. North Star

Hoshino is a cozy virtual-pet game where care, consistency, and small daily rituals build up to a monthly ascension arc. The whole app is framed as a virtual handheld device; gameplay happens on the device's inner screen. Blockchain is invisible infrastructure for randomness, ownership, and optional on-chain capability — never the product.

**Design philosophy:**
- Fun first. No P2E, no token, no ponzi.
- Device-is-the-game: UX happens *inside* the device screen, not over it.
- Additive on-chain: the crypto layer enhances for those who want it, disappears for those who don't.

---

## 2. MVP Scope Decisions

These decisions layer on top of the MVP framework (see `../Hoshino-Notes/hoshino-mvp-framework.pdf`) based on creative lead direction.

| Area | Decision |
|---|---|
| Ascension NFTs | **Out of MVP** — end-of-season, not core loop. Revisit when ascension ritual is built out. |
| Cosmetic NFTs (shop items) | **In MVP (optional mint)** — onchain users can mint; embedded-wallet users hold in DB |
| Moonoko-as-NFT at ascension | **Out of MVP** |
| Memory Book | Deferred (tied to ascension) |
| Simulated $MOON token layer | Out of MVP |
| MagicBlock | **VRF only** for MVP. Ephemeral Rollups deferred until beta shows backend pipe is inadequate |
| Privy | **In MVP, foundational** — auth + embedded wallets + fiat on-ramp |
| Starter Pack | In MVP |
| Season Pass | In MVP |
| Minigames at launch | Starburst polished first; expansion post-MVP |
| Room decoration | **In MVP (new scope)** |
| Cooking / recipe discovery | **In MVP (new scope)** |

---

## 3. Onboarding Flow

```
App open
  └── Login screen
        ├── "Continue with Privy" (email / Google / Apple)
        │     └── Creates embedded Solana wallet silently
        └── "Connect Wallet" (Phantom / Backpack / Solflare)
              └── Attaches external wallet to account

After auth:
  ├── Existing account → opens app at last-known state
  └── New account
        ├── Welcome / introduction monologue (story intro)
        ├── Free single-pull gacha for starter character
        └── Character captured in DB (and optionally cNFT-minted for onchain users later)
```

**Daily gacha** (post-onboarding): mostly in-game items / soft currency; very rare chance of another character drop.

---

## 4. Core Gameplay Loop

### Day structure (real wall-clock)

The game runs on **Pokemon Sleep-style real-time**. The day is segmented into three meal windows:

| Window | Purpose |
|---|---|
| Breakfast | First feeding opportunity of the day |
| Lunch | Midday feeding |
| Dinner | Evening feeding |

Missing a window → the moonoko gets hungrier (hunger stat increases).

### Stats (hidden gameplay drivers)

All three stats are visible to the user but also drive hidden foraging behavior.

| Stat | User-facing meaning | Hidden foraging effect |
|---|---|---|
| **Hunger** | How hungry the moonoko is | Higher hunger = fatigue = **slower** foraging. Well-fed moonoko forages faster. |
| **Mood** | How happy / engaged | Higher mood = **more rare + interesting** finds. Low mood = disinterest, bland finds. |
| **Energy** | Function of time: full at wake, decays to bedtime | Higher energy = **better general find chance**. |

**Mood is a consistency metric** — driven by:
- Feeding on time (within meal windows)
- Sleeping on time (8-hour night)
- Playing minigames regularly

Consistency compounds mood upward; inconsistency drags it down.

### Sleep

- Moonoko needs **8 real hours of sleep per night**
- During sleep: user cannot interact, but **foraging continues**
- **Morning recap notification** tells the user everything found overnight

### Energy

- Resets to full on wake
- Decays across the day until bedtime
- Shape of the decay curve is an implementation detail — keep it tunable

### Foraging

Periodic ingredient finds driven by the three stats. Frequency, rarity, and find-chance all keyed to the stat model above. Resolves **lazily at read-time** (see §6 Architecture) — no cron ticks.

### Feeding & XP

- Feeding grants **XP that rolls into the final ascension standings**
- Feeding = pot-based cooking (see §5)

### Ascension timing

- Ascension fires at the **end of each real-world lunar cycle (next new moon)** per the MVP framework
- The ascension ritual UX + XP resolution stay in MVP; the **cNFT mint at ascension is deferred** (see §2)
- Lunar cycle phases drive season structure: New Moon (start) → Waxing → Full Moon (buff day) → Waning → Next New Moon (end + ascension)

---

## 5. Cooking System

### Recipe discovery

- Recipes are **unlocked by trial and error**
- User adds **X amount of X ingredients** into the pot — quantity matters, not just ingredient types
- Pot plays a rumble/shake animation, then reveals the result
- **Real recipe** → unlocks permanently (never needs guessing again), grants appropriate XP
- **Wrong combination** → produces **slop** — still food, still grants XP, just low XP

### Feeding mechanics

- Successful recipes grant higher XP than slop; both count as valid feedings for meal-window consistency
- Feeding within the correct meal window compounds mood bonus
- Feeding outside any window still works but misses the consistency bonus

**Open questions:**
- How are recipes *themed*? Simple ingredient combos or layered (cook → bake → plate)?
- Do recipes have rarity tiers matching ingredient rarity?

---

## 6. UI / UX Direction

### Device-integrated zoom

Current problem: pages like Shop, Gallery, Feeding are full-screen and ignore the device framing — the handheld "device" becomes a gimmick instead of the product.

**Fix:** every page zooms *into* the device's inner screen. The casing stays visible at page transitions. The device is always the frame, never dropped. This is a **design-system refactor**, not a one-off.

Practical implications:
- `InnerScreen.tsx` becomes the canonical page container for every interactive surface
- Full-screen takeovers are banned except for specific transitions (zoom-in, zoom-out, ascension)
- Consistent border, shadow, and typography (PressStart2P) across all zoomed surfaces
- Animation: pages "zoom in" from the device screen's normal view, so the transition sells the device metaphor

### Known inconsistencies to resolve

- Border styles and shadows vary across [Shop.tsx](../src/components/Shop.tsx), [Gallery.tsx](../src/components/Gallery.tsx), [FeedingPage.tsx](../src/components/FeedingPage.tsx), [IngredientSelection.tsx](../src/components/IngredientSelection.tsx)
- Some screens bleed into safe areas; some respect them
- Font usage drifts; PressStart2P should be universal

---

## 7. Room

New feature: decoratable/accessorizable room accessed from the device's inner screen.

Minimum MVP:
- Room has a default layout
- Shop sells room decorations (furniture, wallpapers, decorations)
- **Predefined slots** (locked for MVP) — e.g. floor / wall / shelf / corner anchor points, each accepts items of a matching category. Free-position placement deferred post-MVP.

---

## 8. Minigames

**Starburst (Voltorb Flip clone)**
- Current state: proof-of-concept playable, see [Starburst.tsx](../src/components/Starburst.tsx) and [TODO.md](TODO.md)
- Polish priorities for MVP:
  - Memo pad for marking squares
  - Grid solvability guarantee
  - Level progression tied to performance
  - Win/loss rewards feeding into soft currency + mood
  - Animations + sound
- Grid seeds should come from **MagicBlock VRF** (provable randomness)

**Post-MVP minigames:** design-lead picks candidates once Starburst is polished.

---

## 9. Shop & Economy

### Currencies
| Currency | Source | Tradeable |
|---|---|---|
| Soft currency | Minigames, daily rewards, achievements | No |
| Fiat | IAP (App Store/Play) or Privy on-ramp (Seeker/web) | N/A |
| SOL | External wallet or embedded-wallet top-up | N/A |

### Shop items
- Room decorations
- Casing cosmetics (device skins, stickers, themes)
- Consumables (food base, ingredients, treats)
- Starter Pack (one-time, cheap, onboarding)
- Season Pass (monthly/per-cycle)

### Cosmetic NFT minting (optional)
- **Onchain users**: one-tap mint of any purchased cosmetic as a compressed NFT
- **Embedded-wallet users**: cosmetics held in DB; mint path available if they later upgrade to external wallet
- **Zero gameplay difference** between minted and non-minted — framework's "ownership optionality" condition holds

---

## 10. Architecture

### Stack split

| Layer | Responsibility |
|---|---|
| **Privy** | Auth, embedded wallets, session-scoped signing, fiat on-ramps |
| **MagicBlock (VRF)** | Provable randomness for gacha, foraging outcomes, Starburst grid seeds |
| **Backend (Firebase / TBD)** | Stat engine, event log, foraging resolution, inventory, chat, minigame state |
| **Solana mainnet** | Optional cosmetic cNFT minting (Metaplex Bubblegum) |
| **OpenAI GPT-4o-mini** | Per-moonoko personality chat |

### The "rarely sign" UX

| Action | Embedded wallet | External wallet |
|---|---|---|
| Login | No prompt | One prompt |
| Gacha pull | No prompt (server co-sign + VRF) | No prompt after 1x delegation |
| Foraging resolution | No prompt | No prompt |
| Minigame play | No prompt | No prompt |
| Cosmetic purchase (soft currency) | No prompt | No prompt |
| Cosmetic purchase (fiat) | Payment sheet | Payment sheet |
| Cosmetic purchase (SOL) | No prompt (preauthed) | 1 tap |
| Optional cNFT mint | No prompt | 1 tap |

**Embedded-wallet magic:** Privy holds MPC-split key material; the app requests session-scoped signing authority during onboarding; server co-signs subsequent gameplay actions without prompts.

**External-wallet magic:** One-time delegation tx grants MagicBlock permission to act on delegated accounts inside the Ephemeral Rollup (when we adopt ER in Phase 2). For MVP with VRF-only, external wallets behave identically to embedded for randomness events.

### Stat engine: server-authoritative with lazy resolution

The Pokemon-Sleep clock model requires offline simulation.

**Model:**
- Stats stored as `{hunger, mood, energy, last_resolved_at}` snapshots
- Event log captures discrete actions: feedings, sleep start/end, minigame plays, meal-window misses
- On any read, server simulates from `last_resolved_at` to `now`:
  - Decays energy along the known curve
  - Checks meal windows crossed without feeding → hunger up
  - Rolls foraging events in the interval using VRF seeded by `user_id + timestamp`
  - Commits resolved stats + events
- Client only displays; never computes

**Anti-cheat:** device clock doesn't matter — server clock wins. Offline simulation is deterministic given the VRF seed, so results are auditable.

### Integration order (full, aspirational)

1. **Privy integration** — auth, embedded wallet, session signing, fiat on-ramp. Unblocks onboarding, gacha, and shop.
2. **Stat engine + event log + lazy foraging resolver** — the clock architecture above. Unblocks the whole care loop.
3. **MagicBlock VRF** — plug into gacha, foraging rolls, Starburst grid seeds.
4. **Device-frame UX refactor** — `InnerScreen.tsx` as universal page container; migrate Shop, Gallery, Feeding, etc.
5. **Cooking system** — pot UI, recipe discovery, XP.
6. **Sleep + energy clock surfaces** — morning recap notification, sleep lockout.
7. **Room** — decorations, shop integration.
8. **Starburst polish** — memo pad, solvability, rewards.
9. **cNFT mint pipeline** for shop cosmetics (Metaplex Bubblegum on devnet first).
10. **Starter Pack, Season Pass, daily gacha.**

This is the full target. Given the May 11 deadline, the actual shipping subset is defined in **§15**.

---

## 11. Platform Notes

- **Primary launch target:** Solana Seeker dApp Store (per framework).
- **Post-launch:** Google Play → iOS App Store → web.
- **IAP reality:** iOS and Play force digital-goods fiat through their IAP (30% cut). Season Pass and Starter Pack on those platforms route through IAP. Privy fiat on-ramps are useful on Seeker and web, and for on-ramping to SOL.

---

## 11a. Telemetry & Beta Instrumentation

Doc 3 suggests "Postgres/BigQuery + Metabase." We are **not** building that — Firebase natively covers it.

| Need | Firebase tool |
|---|---|
| Event log (feed, sleep, gacha, shop, minigame, etc.) | Firebase Analytics `logEvent()` |
| Cohort assignment (A / B1 / B2 / C) + feature flags | Firebase Remote Config (with A/B Testing on top) |
| D1/D7/D30 retention + funnels | Firebase Analytics native reports |
| Latency SLAs (<3s median tx, <2s loading) | Firebase Performance Monitoring |
| Ad-hoc SQL | Firebase Analytics → BigQuery export (free, one-toggle) |
| Dashboards | Looker Studio (free, native BQ connector) |
| Crash reporting | Crashlytics |
| Satisfaction surveys | Typeform (free tier) — only non-Firebase tool needed |

**Known tradeoff:** Firebase console has ~24h data lag; BigQuery export is near-real-time. Enable BQ export from the start so the Looker Studio dashboards have fresh data during beta.

**Setup cost:** ~half a day, folded into Phase B alongside the stat engine (server-side event emission is the natural place to wire `logEvent`).

---

## 12. Terminology & Hygiene

Canonical terms (enforced in code + docs + external materials):

| Term | Canonical form | Notes |
|---|---|---|
| Creature | **Moonoko** (plural **Moonokos**) | Renamed from "Moonling" in Phase A (2026-04-17) |
| Stats | **Hunger / Energy / Mood** | Doc 2 §2.1 mention of "Sleep" as a stat is a typo — treat sleep as a mechanic |

---

## 13. Open Questions

Tracked here so they don't get lost. Owner in brackets.

**Resolved 2026-04-16:**
- ~~Moonling vs Moonoko~~ → **Moonokos** (rename executed 2026-04-17 in Phase A)
- ~~Room placement~~ → **predefined slots for MVP**
- ~~Backend stack~~ → **Firebase stays for game state**; Postgres/BigQuery reference was from Doc 3's beta *telemetry* line item, not the app backend
- ~~Telemetry pipeline~~ → **Firebase-native stack** (see §11a). No new infra. Doc 3's Postgres/BigQuery/Metabase suggestion was generic AI advice and doesn't apply when Firebase is already in place.

**Still open:**
- **[Creative]** Cooking: recipe theming (simple combos vs layered stages)? Recipe rarity tiers matching ingredient rarity?
- **[Creative]** Gacha rare-character drop rate (daily pull)?
- **[Design]** Energy decay curve shape — linear, stepped, or something custom?
- **[Design]** Hunger increase curve per missed meal window — flat penalty or compounding?

---

## 14. Beta Implications

This MVP scope deliberately reduces the on-chain surface area compared to the original beta plan (`../Hoshino-Notes/Hoshino_Beta_Doc2_Execution_Plan.pdf` §3.0). Specifically:

- No Ascension NFT mint → Ascension NFT identitarian test (Doc 2 §5) cannot run in MVP
- No simulated $MOON → Sub-cohort B1 vs B2 token experiment (Doc 1 §4) cannot run in MVP
- No marketplace → speculative neutrality metric cannot be measured in MVP

Doc 2 §8 already sanctions this as the **Web2-first fallback path**. Under this scope, Phase 1 beta testing focuses on:
- Cohort A retention, satisfaction, session flow (full test still applies)
- Starter Pack three-variant funnel (still applies)
- Cohort B cosmetic-mint behavior (reduced surface — just shop cosmetics, not ascension)
- Wallet upgrade rate (still measurable)

The token-or-no-token question defaults to **no token** without being affirmatively tested. This is a policy call, not an empirical one under MVP scope.

---

## 15. May 11 Ship Plan (scope-compressed)

**Reality check:** The full 10-step integration order (§10) is ~5-8 weeks of work. We have ~3.5 weeks. Cuts are required. This section is the *actual* shipping target.

### In for May 11

**Phase A — Hygiene (days 1-3)**
- Global rename: `Moonoko` → `Moonoko` across code, assets, strings
- Dedupe the hardcoded moonoko arrays (`App.tsx` has them duplicated) → `src/data/moonokos.ts`
- Strip dead code: character-NFT mint call sites (`handleMintCharacter`, ProgrammableNFTService for character minting)
- Fix device-frame UX hygiene (borders/shadows/fonts normalized in `InnerScreen.tsx`)

**Phase B — Foundations (days 4-10)**
- **Privy integration** (auth + embedded wallets; fiat on-ramp can follow)
- **Server-authoritative stat engine** on Firebase Functions: `{hunger, mood, energy, last_resolved_at}` snapshots + event log + lazy resolver on read
- Migrate `StatDecayService` from AsyncStorage-client to server-resolved
- **Telemetry wiring** (§11a): Firebase Analytics `logEvent` at every action emit site, Remote Config cohort param, BigQuery export enabled, Performance Monitoring traces on tx + loading paths

**Phase C — Core loop (days 11-18)**
- **Meal window** mechanics (breakfast/lunch/dinner windows, mood bonus for on-time feeding)
- **Cooking** pot UI with quantity + ingredients → rumble → recipe/slop reveal
- **Sleep** flow: 8h lockout, foraging continues, morning recap notification
- **Foraging** engine driven by hunger/mood/energy; resolves lazily at read time

**Phase D — Surfaces (days 19-24)**
- **Gacha** onboarding (free pull) + daily gacha (items + rare character drop)
- **Shop** zoomed into device frame; soft currency + SOL paths; room decorations for sale
- **Room** with predefined slots + shop-purchased decorations

**Phase E — Polish (days 25-26, buffer to May 11)**
- Starburst polish (memo pad + solvability guarantee + rewards wired to soft currency/mood)
- MagicBlock VRF plugged into gacha + foraging + Starburst seeds (if time; otherwise deterministic PRNG with server seed — swap later)
- Ascension stub (flag + notification at new moon; full ritual deferred)

### Deferred past May 11

- Cosmetic cNFT minting pipeline (shop cosmetics held in DB only for MVP — Bubblegum wiring comes later)
- Starter Pack + Season Pass (monetization surfaces)
- Morning recap animation polish beyond basic notification
- Free-position room placement
- Ascension ritual UX + lunar-cycle season boundaries beyond stub
- Full device-frame refactor across every screen (normalize the top 4 surfaces — Shop, Gallery, Feeding, IngredientSelection — let the rest slip)
- MagicBlock Ephemeral Rollups (VRF-only in MVP; ER stays deferred)

### Risk register

| Risk | Mitigation |
|---|---|
| Privy + Solana embedded wallet integration slower than expected on RN | Fallback to Privy email auth + keep MWA path for wallet users; skip embedded wallet if blocked and revisit |
| Stat engine server-side migration breaks existing AsyncStorage saves | One-shot migration on first load; wipe test accounts if needed |
| MagicBlock VRF integration stalls | Ship with server-side deterministic PRNG; swap to VRF post-launch |
| Scope creep from "one more surface" | This doc. Anything not in Phase A-E slides to "deferred". |

### Success definition for May 11

Playable end-to-end loop: login via Privy → free gacha → feed (cook) → play Starburst → sleep → wake to morning recap → spend soft currency in shop → place room item. Everything else is icing.

---

## 16. Pointers

- Strategic PDFs: `../Hoshino-Notes/`
  - `hoshino-mvp-framework.pdf` — product summary, platforms, auth tiers, core loop
  - `Hoshino_Beta_Doc1_Framework_and_Cohort_Design.pdf` — cohort design, simulated tokenomics
  - `Hoshino_Beta_Doc2_Execution_Plan.pdf` — protocols, go/no-go criteria
  - `Hoshino_Beta_Doc3_Budget_Allocation.pdf` — Phase 1 budget
- Existing in-repo notes:
  - [README.md](../README.md) — setup
  - [DEV_NOTES.md](DEV_NOTES.md) — stale, archived feature requests + limitations
  - [TODO.md](TODO.md) — stale, archived Starburst implementation notes
