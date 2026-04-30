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

# Whole suite (all flows under e2e/flows/)
maestro test e2e/config.yaml

# Smoke tag only
maestro test --include-tags smoke e2e/config.yaml
```

## Layout

```
e2e/
  config.yaml      Suite entry point — globs flows/*.yaml
  flows/           Maestro flow files (one scenario each)
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

| testID                  | Where                              |
| ----------------------- | ---------------------------------- |
| `login-screen`          | LoginScreen root LinearGradient    |

### Flow files

- One scenario per file
- Use `tags:` for grouping (`smoke`, `auth`, `sleep`, etc.)
- Start with `launchApp: { clearState: true, stopApp: true }` for
  hermetic runs unless the scenario explicitly tests warm-launch
  behavior
- Keep flows under ~30 steps; split into sub-flows with `runFlow:` if
  longer

## Roadmap (next scenarios)

These need Firebase fixtures (test user provisioning) before they can run
hermetically:

1. **sleep-rapid-toggle** — open sleep, immediately close, verify menu is
   responsive (regression for the bug fixed in v0.1.11)
2. **feeding-happy-path** — feed an ingredient, verify hunger stat
   increases
3. **menu-navigation** — tap each menu item, verify the right screen mounts
4. **shop-browse** — open shop, scroll catalog, no crash
5. **logout** — sign out from settings, verify back at login screen

## Fixtures (TODO)

The plan is to provision a deterministic test Firebase user (custom claim
`e2e: true`) before each run, then tear it down after. See
`fixtures/README.md` once that lands.
