# Local Dev Iteration Loop

The fastest path to see code changes on a connected Android device. Use this during active development; use [INSTALL_APK.md](INSTALL_APK.md) for non-technical install of release builds, and [SETUP_ANDROID.md](SETUP_ANDROID.md) for first-time machine setup.

Three tiers, fastest to slowest. Pick the lowest one that covers what you changed.

## Tier 1 — JS reload (~2 seconds)

For TypeScript/JSX/asset-manifest edits when the dev client is already installed and Metro is already running.

```bash
adb shell input keyevent 82   # opens RN dev menu, tap Reload
```

Or in the Metro terminal, press `r`. Or double-tap `R` while the app is foregrounded.

If reload picks up a stale bundle (rare — usually after editing `babel.config.js`, adding a new dependency to `package.json`, or asset hash drift), restart Metro with a clean cache:

```bash
npx expo start --dev-client --clear
```

## Tier 2 — Rebuild dev client (~2-10 minutes)

Required when any of these change:

- Anything under `android/` (gradle, manifest, native modules)
- A new package with native code added to `package.json`
- A switch between Hermes/JSC, debug/release, or arch flags
- The app starts crashing on boot with `Embedded wallet proxy not initialized` or similar native-side error

```bash
npx expo run:android
```

This builds the debug variant, installs to the connected device, and starts Metro. Subsequent runs are faster because the gradle cache is warm.

If the install fails with `INSTALL_FAILED_UPDATE_INCOMPATIBLE`, a release-signed APK is on the device and the debug-signed dev client can't replace it. Uninstall first:

```bash
adb uninstall com.socks.hoshino
npx expo run:android
```

Uninstalling wipes AsyncStorage and SecureStore — local Moonoko/profile state goes with it. Server-side state restores on relogin via Firebase.

## Tier 3 — Signed release build (~5-15 minutes)

Only when you need to ship a build to other devices via the public release flow. See [scripts/release.sh](../scripts/release.sh).

```bash
bash scripts/release.sh <version>   # e.g. 0.1.13-preview
```

Bumps versionCode + versionName, runs `./gradlew assembleRelease`, commits, tags, pushes, and uploads the APK to a GitHub release. Requires a clean working tree and `gh` authenticated. Refuses to proceed if either is missing (use `--force` for the working tree, only when you know what you're doing).

## Common state checks

```bash
adb devices                                  # is the phone visible?
adb shell pm list packages | grep hoshino    # is the app installed?
lsof -nP -iTCP:8081 -sTCP:LISTEN             # is Metro running?
```

If `adb devices` shows nothing: see SETUP_ANDROID.md "adb devices shows nothing" troubleshooting (cable, USB mode, debugging permission).

## Picking the right tier

| You changed | Tier |
|---|---|
| `.tsx` / `.ts` / new file under `src/` | 1 |
| Static asset (PNG, GIF) referenced by an existing `require()` | 1 |
| New `require()` of a brand-new asset path | 1 (Metro picks it up; if not, 2) |
| `app.json`, `babel.config.js`, `metro.config.js` | 2 |
| New `npm install <package-with-native-code>` | 2 |
| `android/` files, `Info.plist`, native module config | 2 |
| Anything you want to ship to teammates / Seeker testers | 3 |

When unsure, try Tier 1 first — it's 2 seconds, and a failure mode (stale bundle, native mismatch crash) is unambiguous and fast to recover from.
