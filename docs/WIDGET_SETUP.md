# Android home-screen widget — setup

The app ships three widget variants that surface the active moonoko on the
launcher: **Compact** (2x2), **Wide** (4x2), and **Hero** (4x4). They share
one snapshot store and one task handler — adding more variants is mostly a
new component file plus an entry in `app.json`.

## File layout

```
src/widgets/
  types.ts              snapshot interface (mood/hunger/energy/fragments/...)
  assets.ts             avatarKey -> drawable resolver
  snapshotStore.ts      AsyncStorage cache of the latest snapshot
  widgetService.ts      pushMoonokoSnapshot / pushEmptySnapshot from JS
  widgetTaskHandler.tsx launcher-side handler that picks a variant and renders
  StatBar.tsx           shared stat bar
  CompactWidget.tsx     2x2 layout
  WideWidget.tsx        4x2 layout
  HeroWidget.tsx        4x4 layout
```

## One-time install

1. `npm install` (the dep is already added to `package.json`:
   `react-native-android-widget`).
2. Drop the static avatar PNGs into `assets/images/widget/`:
   - `LYRA.png`, `ORION.png`, `ARO.png`, `SIRIUS.png`, `ZANIAH.png`
   - `EMPTY.png` (empty-state placeholder)
   - `preview-compact.png`, `preview-wide.png`, `preview-hero.png`
     (shown in the launcher's widget picker — ~250×250 each is fine)
3. `npx expo prebuild --clean --platform android` to regenerate
   AndroidManifest with the widget receivers.
4. Rebuild the APK: `cd android && ./gradlew assembleRelease`
5. Install: `adb install -r android/app/build/outputs/apk/release/app-release.apk`
6. Long-press the home screen → Widgets → Hoshino, drop the variant.

## Pushing updates from JS

Whenever game state changes that should be visible on the widget, call:

```ts
import { pushMoonokoSnapshot } from '../widgets/widgetService';

await pushMoonokoSnapshot({
    characterId: state.characterId,
    name: character.name,
    avatarKey: character.image.replace('.gif', ''), // 'LYRA' etc.
    mood: state.mood,
    hunger: state.hunger,
    energy: state.energy,
    level: state.level,
    fragments: profile.starFragments,
    isSleeping: state.sleepStartedAt != null,
});
```

Hooks worth wiring (in order of impact):
- `useGameState`'s `feed`, `play`, `startSleep`, `endSleep`, `drainForaged`
- `cookRecipe` / `cookManual`
- Login flow (push empty snapshot on logout via `pushEmptySnapshot`)

Push is cheap — the launcher coalesces redraws — so safe to call every time
state mutates.

## Caveats

- Widgets render in the launcher process, so they can't import RN components
  or run JS continuously. All UI must use `react-native-android-widget`'s
  primitives (`FlexWidget`, `TextWidget`, `ImageWidget`).
- Animated GIFs aren't supported reliably; we use static PNGs that mirror
  the in-app GIFs.
- `updatePeriodMillis: 1800000` (30 min) is the launcher's minimum auto-refresh.
  Real-time freshness comes from the JS push side.
- iOS widgets aren't covered here — that's a separate WidgetKit/Swift effort
  scheduled for the iOS port in a few months.
