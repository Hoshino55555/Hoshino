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
    // Meal claims let the widget compute whether the current meal window is
    // available at render time, including periodic launcher refreshes.
    mealBonusClaimed?: WidgetMealClaims;
    timezone?: string;
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

export type WidgetMealWindow = 'breakfast' | 'lunch' | 'dinner';

export interface WidgetMealClaims {
    dateKey: string;
    breakfast: boolean;
    lunch: boolean;
    dinner: boolean;
}

function localDateKey(now: Date, timezone?: string): string {
    try {
        return new Intl.DateTimeFormat('en-CA', {
            timeZone: timezone,
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
        }).format(now);
    } catch {
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }
}

function currentMealWindow(now: Date, timezone?: string): WidgetMealWindow {
    let hour = now.getHours();
    if (timezone) {
        try {
            const hourPart = new Intl.DateTimeFormat('en-US', {
                timeZone: timezone,
                hour: '2-digit',
                hour12: false,
            }).formatToParts(now).find((part) => part.type === 'hour');
            if (hourPart) {
                hour = Number(hourPart.value) % 24;
            }
        } catch {
            // Fall back to device-local time.
        }
    }

    if (hour >= 6 && hour < 12) return 'breakfast';
    if (hour >= 12 && hour < 18) return 'lunch';
    return 'dinner';
}

export function isFeedingReady(
    snapshot: WidgetMoonokoSnapshot,
    now = new Date()
): boolean {
    if (snapshot.isSleeping) return false;
    const claims = snapshot.mealBonusClaimed;
    if (!claims) return false;
    const today = localDateKey(now, snapshot.timezone);
    if (claims.dateKey !== today) return true;
    return !claims[currentMealWindow(now, snapshot.timezone)];
}

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
