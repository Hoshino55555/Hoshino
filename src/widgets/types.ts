// Snapshot of the player's currently-active moonoko, formatted for widget
// rendering. Widgets run in the launcher process and can't reach React state,
// so we serialize this and hand it to the widget via SharedPreferences (the
// `react-native-android-widget` library handles the bridge under the hood).
export interface WidgetMoonokoSnapshot {
    characterId: string;
    name: string;
    // Asset key that the widget understands. The widget's image map maps this
    // to a bundled drawable — we keep the same names as src/widgets/assets.ts
    // so the JS side never has to know which native resource id it lands on.
    avatarKey: string;
    // Stat bars are rendered as 0..100 fills inside the widget. Server values
    // can range slightly outside that — we clamp here so the widget never has
    // to think about it.
    mood: number;
    hunger: number;
    energy: number;
    level: number;
    fragments: number;
    // Sleep state lets the widget swap to a "Zzz" badge instead of stat bars
    // when the moonoko is asleep — matches the in-app Sleep screen.
    isSleeping: boolean;
    // Count of foraged items waiting to be drained. The widget shows a badge
    // when > 0 and a tap deep-links into the app's forage flow, where the
    // existing drain animation plays. Zero means no badge — keeps the tile
    // quiet most of the time.
    foragedCount: number;
    // ms-since-epoch the snapshot was taken. Surfaced as "Updated 3m ago" on
    // the larger variant so a stale tile reads as stale rather than wrong.
    snapshotAt: number;
}

// Empty-state snapshot — shown when the user has no moonoko selected yet
// (fresh install, mid-onboarding) or before the first state load completes.
// Keeping this as a discriminated union saves the widget from null checks
// inside its layout code.
export interface WidgetEmptySnapshot {
    characterId: null;
    name: 'No Moonoko';
    avatarKey: 'EMPTY';
    snapshotAt: number;
}

export type WidgetSnapshot = WidgetMoonokoSnapshot | WidgetEmptySnapshot;

// Discriminator predicate. `tsconfig.strict` is currently off, which keeps
// TypeScript from narrowing the union via a plain `s.characterId !== null`
// ternary. Routing through an explicit `s is WidgetMoonokoSnapshot` predicate
// forces the narrowing so widget code can write `if (isFilledSnapshot(s))`
// and access stat properties without `!` or casts.
//
// Body uses `typeof === 'string'` rather than `!== null`: snapshots are
// re-hydrated from SharedPreferences JSON on the launcher side, so a
// malformed or schema-drifted entry could carry `undefined` or another
// falsy non-null value. `typeof` keeps the predicate strict in that case.
export function isFilledSnapshot(s: WidgetSnapshot): s is WidgetMoonokoSnapshot {
    return typeof s.characterId === 'string';
}
