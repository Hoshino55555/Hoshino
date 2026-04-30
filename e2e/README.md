# Hoshino E2E

UI regression tests for the Android app, driven by [Maestro](https://maestro.mobile.dev).

## Prerequisites

- Maestro: `brew install mobile-dev-inc/tap/maestro`
- A connected Android device or emulator (`adb devices` shows it)
- Hoshino release APK installed on the device (the testIDs the flows depend
  on are present in any build cut from this branch onward — there is no
  separate "test build")

## Running

```sh
# Single flow
maestro test e2e/flows/launch.yaml

# Whole suite (every .yaml under e2e/flows/, recursively)
maestro test e2e/flows/

# Smoke tag only
maestro test --include-tags smoke e2e/flows/
```

## Layout

```
e2e/
  flows/           Maestro flow files (one scenario each)
  setup/           Reusable sub-flows pulled in via `runFlow:`
                   (kept out of e2e/flows/ so they don't run as
                    standalone scenarios)
  fixtures/        Firebase seed/teardown helpers (TODO)
```

## Conventions

### testIDs

Flows prefer `id:` (testID) over visible text where the text is likely to
churn (button labels, copy). Reserve text matchers for stable strings
("Sign In") or for asserting copy that is itself the thing under test.

Add a testID only when a flow needs it. Don't blanket-instrument
components — the harness should drive the testID surface, not the other
way around.

Naming: `<screen>-<element>` in kebab-case.

| testID                  | Where                                          |
| ----------------------- | ---------------------------------------------- |
| `login-screen`          | LoginScreen root LinearGradient                |
| `menu-<action>`          | MoonokoInteraction menu buttons (sleep, feed,  |
|                          | shop, chat, games, gallery, inventory,         |
|                          | settings)                                       |
| `sleep-screen`          | SleepScreen root ImageBackground               |
| `sleep-wake-button`     | SleepScreen wake-up TouchableOpacity           |
| `feeding-screen`        | FeedingPage root ImageBackground               |

### Flow files

- One scenario per file
- Use `tags:` for grouping (`smoke`, `auth`, `sleep`, etc.)
- Start with `launchApp: { clearState: true, stopApp: true }` for
  hermetic runs unless the scenario explicitly tests warm-launch
  behavior
- Keep flows under ~30 steps; split into sub-flows with `runFlow:` if
  longer

## Authentication

Flows that need a signed-in user pull in `setup/sign-in-google.yaml` via
`runFlow:`. That sub-flow taps the Google button on LoginScreen and picks
the device account (`socksironed@gmail.com` per memory). The signed-in
state belongs to a real Privy/Firebase user — we're not bypassing auth.

This is fine for local dev runs but isn't hermetic for CI: it depends on
the Seeker having that Google account signed in, and on the user's
real game state. A proper fixture path (custom-token Firebase auth +
Firestore seed via `firebase-admin`) is on the roadmap.

## Existing scenarios

| Flow                  | Tags             | What it covers                           |
| --------------------- | ---------------- | ---------------------------------------- |
| `launch`              | smoke            | Cold-start, splash dismisses, login UI.  |
| `sleep-rapid-toggle`  | sleep, regression| Open sleep, wake immediately, tap a      |
|                       |                  | different menu — verifies the home UI    |
|                       |                  | isn't blocked by a stale sleep overlay   |
|                       |                  | (regression for v0.1.11 fix).            |

## Roadmap (next scenarios)

1. **feeding-happy-path** — feed an ingredient, verify hunger stat
   increases
2. **menu-navigation** — tap each menu item, verify the right screen mounts
3. **shop-browse** — open shop, scroll catalog, no crash
4. **logout** — sign out from settings, verify back at login screen
5. **welcome-flow-no-flash** — assert WelcomeScreen never paints between
   splash and interaction for a returning user (regression for the bug
   fixed alongside v0.1.11)

## Fixtures (TODO)

The plan is to provision a deterministic test Firebase user (custom claim
`e2e: true`) before each run, then tear it down after. See
`fixtures/README.md` once that lands.
