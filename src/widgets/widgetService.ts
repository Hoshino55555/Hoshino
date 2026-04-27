import { requestWidgetUpdate } from 'react-native-android-widget';
import { saveSnapshot } from './snapshotStore';
import CompactWidget from './CompactWidget';
import WideWidget from './WideWidget';
import HeroWidget from './HeroWidget';
import { WidgetMoonokoSnapshot, WidgetSnapshot } from './types';

interface PushArgs {
    characterId: string;
    name: string;
    avatarKey: string;
    mood: number;
    hunger: number;
    energy: number;
    level: number;
    fragments: number;
    isSleeping: boolean;
    foragedCount: number;
}

// Build a snapshot from raw game state and push it to every active widget.
// Call this from the screens/hooks that mutate state — feed, play, sleep
// transitions, foraging drains, level-ups. Cheap to over-call: the launcher
// coalesces redraws.
export async function pushMoonokoSnapshot(args: PushArgs): Promise<void> {
    const snapshot: WidgetMoonokoSnapshot = {
        characterId: args.characterId,
        name: args.name,
        avatarKey: args.avatarKey,
        mood: clamp(args.mood),
        hunger: clamp(args.hunger),
        energy: clamp(args.energy),
        level: Math.max(1, args.level),
        fragments: Math.max(0, args.fragments),
        isSleeping: args.isSleeping,
        foragedCount: Math.max(0, Math.floor(args.foragedCount)),
        snapshotAt: Date.now(),
    };
    await saveSnapshot(snapshot);
    await fanOutUpdate(snapshot);
}

export async function pushEmptySnapshot(): Promise<void> {
    const snapshot: WidgetSnapshot = {
        characterId: null,
        name: 'No Moonoko',
        avatarKey: 'EMPTY',
        snapshotAt: Date.now(),
    };
    await saveSnapshot(snapshot);
    await fanOutUpdate(snapshot);
}

function clamp(n: number): number {
    if (Number.isNaN(n)) return 0;
    return Math.max(0, Math.min(100, Math.round(n)));
}

// Triggers a re-render on all three widget variants. Inactive variants are
// no-ops at the launcher level, so it's safe to fire all three even if the
// user only has Compact placed.
async function fanOutUpdate(snapshot: WidgetSnapshot): Promise<void> {
    const renderers = [
        { widgetName: 'HoshinoCompact', renderWidget: () => CompactWidget({ snapshot }) },
        { widgetName: 'HoshinoWide', renderWidget: () => WideWidget({ snapshot }) },
        { widgetName: 'HoshinoHero', renderWidget: () => HeroWidget({ snapshot }) },
    ];
    await Promise.all(
        renderers.map((r) =>
            requestWidgetUpdate({
                widgetName: r.widgetName as any,
                renderWidget: r.renderWidget as any,
            }).catch(() => {
                // Widget not placed → library throws. Swallow per-widget so
                // a single missing variant doesn't break the others.
            })
        )
    );
}
