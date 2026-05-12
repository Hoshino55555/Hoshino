import type { ForagedItem } from './GameStateService';

// Demo-only recap shown when the player taps Wake before a real full-rest
// has accrued. Lets the hackathon demo show the morning ceremony every time
// regardless of how long they actually slept. Items here are display-only —
// the server's foragedItems list is empty in this path, so drainForaged on
// dismiss is a no-op and inventory isn't actually granted.
export const DEMO_WAKE_FALLBACK_DELTAS = {
    energyGained: 4,
    moodGained: 2,
    xpGained: 30,
};

const DEMO_INGREDIENTS: Array<{ ingredient: string; tier: ForagedItem['tier'] }> = [
    { ingredient: 'mira-berry', tier: 'rare' },
    { ingredient: 'strawberry', tier: 'common' },
    { ingredient: 'milk', tier: 'common' },
    { ingredient: 'nova-egg', tier: 'uncommon' },
    { ingredient: 'oat', tier: 'common' },
];

export function buildDemoWakeForagedItems(nowMs: number): ForagedItem[] {
    return DEMO_INGREDIENTS.map((entry, i) => ({
        id: `demo-wake-${nowMs}-${i}`,
        ingredient: entry.ingredient,
        tier: entry.tier,
        tickMs: nowMs,
        slot: i,
        source: 'sleep' as const,
    }));
}
