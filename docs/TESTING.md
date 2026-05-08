# Testing strategy

What we have, what we want, and the order to build the gap.

## Where we are (2026-05-08)

**Maestro E2E (`e2e/flows/`)** — 7 flows running against a real Seeker over USB.
Smoke + regression scope only. See `e2e/README.md` for the full list.

**Coverage gaps**
- No unit or integration tests anywhere in the repo
- No automated coverage on `backend/firebase/functions/` — the
  highest-churn, highest-blast-radius code
- No CI: every flow needs a human + a connected device
- Maestro flows can't assert state changes (no fixtures), only screen
  mounts and back-button regressions

## Where we want to be

A four-layer pyramid, fast to slow:

```
                 ┌──────────────────┐
                 │  4. CI on GHA    │  every PR, gates merge
                 └──────────────────┘
              ┌──────────────────────┐
              │  3. Maestro E2E      │  fixture-seeded user, real
              │     (fixtured)       │  state assertions
              └──────────────────────┘
           ┌────────────────────────────┐
           │  2. Firebase Emulator      │  callables hit real Firestore,
           │     integration tests      │  asserts security + transactions
           └────────────────────────────┘
        ┌──────────────────────────────────┐
        │  1. Jest unit tests              │  pure functions, <5s, runs
        │     (game-state-engine.js etc.)  │  every save
        └──────────────────────────────────┘
```

Each layer catches a different failure mode. Don't try to make E2E catch
everything — it's too slow and too brittle. The pyramid is wide at the
bottom because that's where the bugs are cheapest to find.

## The plan, in build order

### Phase 1 — Jest unit suite *(highest leverage; do first)*

**What it covers:** pure functions in `backend/firebase/functions/game-state-engine.js`
and `src/services/`.

**Concrete first targets:**
- `drainAcrossSleep(state, deltaMs)` — stat decay math, edge cases
  (negative deltas, zero-time, overshoot)
- `shouldShowMorningRecap(state, nowMs)` — date-key comparison, source
  filtering
- `applyForage(state, items)` — wallet/inventory mutation, idempotency
  via `requestId`
- Recipe XP math: `basePoints × levelBonus × moodMult × hungerMult`
- `localDateKey(ms, tz)` and its client-side mirror — TZ correctness
- Idempotency helper from `backend/firebase/functions/lib/idempotency.js`

**Why first:** these are pure functions, no I/O, no React. Test in
seconds, refactor with confidence. Catches the most bugs per hour
spent. Forces the testable seams that Phase 2 will want.

**Setup cost:** ~1-2 hours. Add `jest` + `ts-jest`, write a couple
fixtures, point at the existing engine module. Functions side already
runs Node — no transpile gymnastics needed.

### Phase 2 — Firebase Emulator integration tests

**What it covers:** the contract between the client and the callable
functions: argument validation, security rules, Firestore transactions,
idempotency dedup at the storage layer.

**Concrete first targets:**
- `spinDailyForage` happy + replay (same `requestId` returns same result,
  doesn't double-credit)
- `claimRecipe` cooldown enforcement
- `buyShop` per-line dispatch (boxes → reveal payload, instants →
  inventory delta, spin → reroll)
- Security rule tests: a user can't read another user's wallet doc

**Why second:** unit tests can't catch transaction races or rule
misconfig, and E2E is too slow to run hundreds of these. The emulator
gives you a real Firestore + real Auth in <2s startup.

**Setup cost:** ~half a day. `firebase-tools` already installed for
deploys; just need `@firebase/rules-unit-testing` and a test runner
config that boots emulators before each suite.

### Phase 3 — Maestro fixtures (deterministic E2E)

**What it covers:** real assertions about state changes, not just
"screen mounted." Catches end-to-end regressions across client +
server + Firestore.

**The piece that needs building:**
1. `e2e/fixtures/seed.ts` — uses `firebase-admin` to:
   - Provision a test user with custom claim `{ e2e: true }`
   - Seed `users/{uid}/profile`, `wallet`, `inventory`,
     `characters/{characterId}` to known values (50 of each ingredient,
     1000 fragments, mid-stat character, no pending sleep)
   - Generate a custom token, write it somewhere the app reads on boot
2. **App-side bridge** behind `__DEV__ || process.env.E2E_MODE`:
   read the seeded token at startup, sign in via
   `signInWithCustomToken(auth, token)`, skip Privy entirely.
3. New `setup/sign-in-fixture.yaml` that uses the bridge.

**Once that exists, real flows become possible:**
- `feeding-happy-path` — cook a recipe, assert hunger goes 50→65 and
  ingredient counts decrement. Today's `feeding-open` is a placeholder
  for this.
- `shop-checkout` — buy a known SKU, assert wallet decrements + reveal
  modal opens.
- `forage-overnight` — seed `foragedAt` 8h ago, sleep, wake, assert
  recap modal appears with correct items.

**Tradeoff worth flagging:** Phase 3 requires plumbing an "E2E mode"
through the auth flow that didn't previously exist. That's real
production surface area — it has to be gated tightly so a misconfig
can't bypass Privy in a release build. Worth it once we're past
hackathon crunch, probably not before.

**Setup cost:** ~1-2 days.

### Phase 4 — CI on GitHub Actions

**What it covers:** running everything on every PR so we don't have to
remember to.

**Shape:**
- Jest suite on every push (fast, ~30s)
- Firebase emulator integration tests on every PR
- Maestro suite on every PR via `reactivecircus/android-emulator-runner`
  + `mobile-dev-inc/action-maestro-cloud` (or self-hosted Maestro CLI
  against the GHA emulator)

**Setup cost:** ~half a day once Phases 1-3 exist. The bottleneck is
emulator startup time on a cold runner (~3-5 min) — keep the Maestro
flow set tight or split into a nightly + per-PR-smoke split.

## What NOT to chase

- **React component snapshot tests.** High maintenance, low signal —
  every UI tweak triggers a noisy diff. Skip.
- **End-to-end coverage on the wallet/Privy auth dance.** The real
  Privy SDK isn't easily mockable; trying to E2E it without fixtures
  is what got us into the fragile-Google-OTP hole in the first place.
  Phase 3's custom-token bridge is the right answer; a "test Privy
  account" isn't.
- **100% coverage as a goal.** Coverage % is a lagging indicator.
  Test the things that break, not the things that are easy to test.

## Notes & open questions

- The Maestro README's "Fixtures (TODO)" section is what Phase 3
  delivers. Update both when this lands.
- Sleep-flow regression: `sleep-rapid-toggle.yaml` had to be updated
  in this pass to handle the `SleepConfirmationModal` step. If we keep
  adding modals between menu taps and screens, the flows get longer
  and more brittle — consider a `sleep-direct` test ID path that skips
  the modal in `__DEV__` for E2E.
- Idempotency seam: every callable that spends fragments uses the
  shared `idempotency.js` helper + a client-generated `requestId`. The
  unit tests in Phase 1 should treat that helper as the contract; the
  emulator tests in Phase 2 should verify the dedup persists across
  retries.
