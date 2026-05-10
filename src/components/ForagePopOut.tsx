import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Image, Animated, Easing, Pressable, StyleSheet, useWindowDimensions } from 'react-native';
import type { ForagedItem } from '../services/GameStateService';
import { getIngredientArt } from '../assets';

// Hash to a deterministic float in [-1, 1] so each item gets stable jitter
// across rerenders without using random (which would reshuffle on every render).
function jitterForId(id: string, salt: number) {
    let h = salt;
    for (let i = 0; i < id.length; i++) h = (h * 131 + id.charCodeAt(i)) | 0;
    return ((h & 0xffff) / 0xffff) * 2 - 1;
}

// Triangular row layout: bottom row holds the most items, each subsequent row
// holds one fewer. Returns which row the i-th item belongs to, its slot
// within that row, and the row's total size — enough to compute lift +
// horizontal placement so items pile up like a pyramid instead of a column.
// Base width grows with item count so a triangle of N(N+1)/2 always fits
// without falling back to a vertical column at the apex. The "natural" base
// for small piles is 4 — anything larger widens the pyramid instead.
const BASE_ROW_SIZE = 4;
// Last few items roll off the pile edge instead of stacking. Triggers once
// the pile is large enough that one or two stragglers read as overflow
// rather than a stunted base.
function stragglerCount(total: number): number {
    if (total < 6) return 0;
    if (total < 12) return 1;
    if (total < 18) return 2;
    return 3;
}

interface Placement {
    row: number;
    slot: number;
    rowSize: number;
    baseRowSize: number;
    isStraggler: boolean;
    stragglerIndex: number;
    stragglerSide: -1 | 1;
}

function placeOnPile(i: number, total: number): Placement {
    const stragglers = stragglerCount(total);
    const pileCount = total - stragglers;
    if (i >= pileCount) {
        const stragglerIndex = i - pileCount;
        return {
            row: 0,
            slot: 0,
            rowSize: 1,
            baseRowSize: 1,
            isStraggler: true,
            stragglerIndex,
            stragglerSide: stragglerIndex % 2 === 0 ? -1 : 1,
        };
    }
    // Smallest N where N(N+1)/2 ≥ pileCount, but never narrower than the
    // small-pile default so 1–10 items still read with a 4-wide base.
    const fitBase = Math.ceil((-1 + Math.sqrt(1 + 8 * Math.max(1, pileCount))) / 2);
    const baseRowSize = Math.max(
        1,
        Math.min(pileCount, Math.max(BASE_ROW_SIZE, fitBase)),
    );
    let row = 0;
    let placed = 0;
    let rowSize = baseRowSize;
    while (placed + rowSize <= i) {
        placed += rowSize;
        row++;
        rowSize = Math.max(1, rowSize - 1);
    }
    // Last row may be partial — clamp rowSize to remaining items so slot
    // math stays in range.
    const remaining = pileCount - placed;
    const actualRowSize = Math.min(rowSize, remaining);
    return {
        row,
        slot: i - placed,
        rowSize: actualRowSize,
        baseRowSize,
        isStraggler: false,
        stragglerIndex: 0,
        stragglerSide: 1,
    };
}

interface PileDims {
    spread: number; // pile half-width at base, in dp
    liftPerItem: number; // dp each row sits higher than the one below it
    liftCap: number; // hard ceiling on stack height in dp
    // Hard horizontal bound: |landingX| is clamped to this. Keeps stragglers
    // and wide pyramid bases from drifting past the viewport edge on narrow
    // devices or in large drops where the dynamic base widens significantly.
    maxX: number;
}

// Computes final resting offset (relative to the pile center, in dp) plus
// rotation. Shared by both the launch animation (needs landingY for the
// down-arc target) and the render pass (needs landingX for the X interpolate).
// Pile dimensions come in via `dims` so the component can scale them off
// useWindowDimensions — module-level constants would freeze the pile to one
// device size and break under Android Display-Size scaling.
function computeLanding(i: number, total: number, itemId: string, dims: PileDims) {
    const placement = placeOnPile(i, total);
    const xJ = jitterForId(itemId, 11);
    const yJ = jitterForId(itemId, 19);
    const rJ = jitterForId(itemId, 23);

    const clampX = (x: number) => Math.max(-dims.maxX, Math.min(dims.maxX, x));

    if (placement.isStraggler) {
        // Roll past the pile's outer edge. Each subsequent straggler lands a
        // little further out, alternating sides so they don't bunch on one side.
        // Spacing offsets scale with the pile spread so they stay proportional.
        const extra = dims.spread + dims.spread * 0.42 + placement.stragglerIndex * dims.spread * 0.35;
        const landingX = clampX(placement.stragglerSide * extra + xJ * dims.spread * 0.12);
        const landingY = yJ * dims.liftPerItem * 0.25; // sit on the ground, tiny bump
        const rotateDeg = rJ * 28; // slightly tipped — they tumbled
        return { landingX, landingY, rotateDeg };
    }

    const { row, slot, rowSize, baseRowSize } = placement;
    // Widen the pile footprint when the base grows so items don't pancake on
    // top of each other. Base 4 → 1× (existing look); base 6 → 1.5×; etc.
    const spreadScale = Math.max(1, baseRowSize / BASE_ROW_SIZE);
    const effectiveSpread = dims.spread * spreadScale;
    const spreadFactor = baseRowSize > 0 ? (baseRowSize - row) / baseRowSize : 0;
    const slotBase = rowSize > 1 ? (slot / (rowSize - 1)) * 2 - 1 : 0;
    const xJitter = xJ * 0.4;
    const landingX = clampX((slotBase + xJitter) * effectiveSpread * spreadFactor);
    const landingY = -Math.min(row * dims.liftPerItem, dims.liftCap) + yJ * dims.liftPerItem * 0.5;
    const rotateDeg = rJ * 18;
    return { landingX, landingY, rotateDeg };
}

interface Props {
    items: ForagedItem[];
    onComplete: () => void;
    /**
     * Pixels to subtract from the parent's bottom — i.e. the height of any
     * absolutely-positioned bottom chrome (menu bar) that the parent doesn't
     * already exclude from its layout. Without this, the pile's `top: 78%`
     * lands inside the menu bar overlay because mainDisplayArea is flex:1
     * and the menu sits on top of its lower portion.
     */
    bottomInset?: number;
    /**
     * Spawn position in dp relative to the pile center. `launchOffsetX` is
     * left/right of the pile's horizontal center (negative = left).
     * `launchOffsetY` is dp ABOVE the pile baseline (positive = higher).
     * Used to make items appear to fly out of an on-screen object — e.g.
     * the moonoko's forage bag — instead of from the moonoko's feet. The arc
     * peak still rises `peak` dp above the launch height so the throw shape
     * stays consistent regardless of where the launch point is.
     */
    launchOffsetX?: number;
    launchOffsetY?: number;
}

// Snappier pile-at-feet feel:
// - One arc (up + down), no rebounds — items thud and stay put.
// - Items land in a triangular pile at the moonoko's feet: the first
//   items in form the wide base, later items stack higher and narrower
//   toward the apex.
const ARC_HALF_MS = 220;
// Stagger drives both item-launch cadence and the bag's per-item squeeze
// pulse in MoonokoInteraction. Computed from item count so total spill
// duration stays roughly constant (~TARGET_SPILL_MS) — small queues spill
// slowly so the bag stays visible long enough to read, big queues spill
// fast so the player isn't waiting forever.
const TARGET_SPILL_MS = 1800;
const MIN_STAGGER_MS = 50;
const MAX_STAGGER_MS = 350;
export const computeForageStaggerMs = (count: number): number => {
    if (count <= 1) return MAX_STAGGER_MS;
    return Math.max(MIN_STAGGER_MS, Math.min(MAX_STAGGER_MS, Math.round(TARGET_SPILL_MS / count)));
};
const GROUND_HOLD_MS = 10000;
const FADE_DURATION_MS = 400;

// Reference design width these layout values were tuned against. Real values
// scale linearly with viewport width via `winW / REFERENCE_WIDTH` so the pile
// adapts to Android Display-Size scaling and to wider/narrower devices.
const REFERENCE_WIDTH = 400;
// All values below are in "reference dp" (i.e. dp at REFERENCE_WIDTH);
// multiply by `scale` inside the component to get the live dp.
const ITEM_SIZE_REF = 40;
const PILE_BASE_SPREAD_REF = 52; // ±dp at the base of the pile
const PILE_LIFT_PER_ITEM_REF = 12;
const PILE_LIFT_CAP_REF = 72;
const PILE_BASE_GAP_REF = -10; // dp above bottom chrome where the pile sits
const ARC_PEAK_BASE_REF = 110; // dp the arc rises above the launch point
const ARC_PEAK_JITTER_REF = 18;

const flightMs = () => ARC_HALF_MS * 2;

// Combined arc easing applied to a single 0→1 progress value: ease-out for
// the first half (rising), ease-in for the second half (falling). Driving
// the whole arc from one timing means no JS-side sequence handoff at apex.
const easeOutQuad = Easing.out(Easing.quad);
const easeInQuad = Easing.in(Easing.quad);
const arcEasing = (t: number): number =>
    t < 0.5
        ? easeOutQuad(t * 2) * 0.5
        : 0.5 + easeInQuad((t - 0.5) * 2) * 0.5;

export const FORAGE_FLIGHT_MS = ARC_HALF_MS * 2;

// Items launch from the Moonoko's feet, arc once, and land in a pile at the
// feet. Each item is tappable for a quick pop-dismiss. Leftovers fade on a
// global timer. Inventory was already credited by the parent's drain call —
// this overlay is the reward flourish, not the source of truth.
const ForagePopOut: React.FC<Props> = ({
    items,
    onComplete,
    bottomInset = 0,
    launchOffsetX = 0,
    launchOffsetY = 0,
}) => {
    // All pile/arc dimensions are derived from the live screen width relative
    // to REFERENCE_WIDTH (400dp). The item sprite, pile spread, lift per row,
    // arc peak, and base gap all scale together so the silhouette stays the
    // same shape across Display-Size scales and form factors.
    const { width: winW } = useWindowDimensions();
    const scale = winW / REFERENCE_WIDTH;
    const itemSize = ITEM_SIZE_REF * scale;
    const pileDims: PileDims = {
        spread: PILE_BASE_SPREAD_REF * scale,
        liftPerItem: PILE_LIFT_PER_ITEM_REF * scale,
        liftCap: PILE_LIFT_CAP_REF * scale,
        // Items render with `left: '50%'` and a centered marginLeft, then
        // get rotated up to ±28° (stragglers) or ±18° (pile). Rotation
        // pushes the bounding box past itemSize/2 — worst case is the
        // half-diagonal (itemSize × √2/2). Use that plus a safety pad so
        // the rotated sprite never crosses the viewport edge.
        maxX: winW / 2 - (itemSize * Math.SQRT2) / 2 - 12,
    };
    const pileBaseGap = PILE_BASE_GAP_REF * scale;
    const arcPeakBase = ARC_PEAK_BASE_REF * scale;
    const arcPeakJitter = ARC_PEAK_JITTER_REF * scale;

    const xRefs = useRef(items.map(() => new Animated.Value(0))).current;
    const yRefs = useRef(items.map(() => new Animated.Value(0))).current;
    // Start hidden and pop in the instant each item launches. Without this,
    // every queued item sits visible at the spawn point (translate 0,0) until
    // its delay fires — with large batches that reads as a stationary blob
    // clearing one sprite at a time before any arc movement is visible.
    const fadeRefs = useRef(items.map(() => new Animated.Value(0))).current;
    const [dismissed, setDismissed] = useState<Set<string>>(new Set());
    const completedRef = useRef(false);

    const finish = useCallback(() => {
        if (completedRef.current) return;
        completedRef.current = true;
        onComplete();
    }, [onComplete]);

    // Stash `finish` in a ref so the throw-animation effect doesn't list
    // it as a dependency. Parent (`MoonokoInteraction`) passes
    // `onComplete={() => setPopOutItems(null)}` — a fresh arrow every
    // render — which made `finish` a new reference on every parent tick
    // and re-fired the effect, re-launching Animated.timing on items
    // that had already landed (read on screen as a periodic re-bounce).
    const finishRef = useRef(finish);
    useEffect(() => {
        finishRef.current = finish;
    }, [finish]);

    useEffect(() => {
        if (items.length === 0) {
            finishRef.current();
            return;
        }
        const flight = flightMs();
        const staggerMs = computeForageStaggerMs(items.length);
        items.forEach((item, i) => {
            const delayMs = i * staggerMs;
            // Slightly varying arc heights so identical sprites don't fly in
            // perfect lockstep — pure visual texture, no gameplay meaning.
            // Base + jitter scale with the screen so the arc reads the same
            // proportion regardless of Display Size.
            const peak = arcPeakBase + jitterForId(item.id, 7) * arcPeakJitter;
            // Snap-in at launch — fadeRef starts at 0 to keep queued items
            // hidden at the spawn point until their delay elapses.
            Animated.timing(fadeRefs[i], {
                toValue: 1,
                duration: 60,
                delay: delayMs,
                useNativeDriver: true,
            }).start();
            // Horizontal drift over the full flight so items don't fall
            // straight down. Native driver throughout.
            Animated.timing(xRefs[i], {
                toValue: 1,
                duration: flight,
                delay: delayMs,
                easing: Easing.out(Easing.quad),
                useNativeDriver: true,
            }).start();
            // Single native timing for the entire arc (0→1 over `flight`).
            // The arc shape (up to -peak, then down to landingY) is applied
            // in render via interpolate, so there's no JS-side handoff
            // between up- and down-arcs. Earlier we used Animated.sequence
            // here, but its completion callback is JS-side: with 50 items
            // staggered 55ms apart, those handoffs collide on the JS thread
            // and items visibly park at apex while waiting for the down-arc
            // to be scheduled — that was the "flash at top of arc" the user
            // was seeing.
            Animated.timing(yRefs[i], {
                toValue: 1,
                duration: flight,
                delay: delayMs,
                easing: arcEasing,
                useNativeDriver: true,
            }).start();
        });

        // Global ground-hold timer: starts when the LAST item has finished
        // landing, so every find gets its full shelf life regardless of
        // batch size. Fades whatever is still on the ground and resolves.
        const lastLandingMs = flight + (items.length - 1) * staggerMs;
        const timeout = setTimeout(() => {
            const remaining = items.filter((it) => !dismissed.has(it.id));
            if (remaining.length === 0) {
                finishRef.current();
                return;
            }
            Animated.parallel(
                items.map((_, i) =>
                    Animated.timing(fadeRefs[i], {
                        toValue: 0,
                        duration: FADE_DURATION_MS,
                        useNativeDriver: true,
                    })
                )
            ).start(() => finishRef.current());
        }, lastLandingMs + GROUND_HOLD_MS);

        return () => clearTimeout(timeout);
        // dismissed and finish deliberately omitted from deps — dismissed
        // is read at timer fire (not setup), and finish is read via
        // finishRef to avoid re-firing the throw animation on every
        // parent re-render.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [items]);

    const dismissItem = (id: string, index: number) => {
        setDismissed((prev) => {
            if (prev.has(id)) return prev;
            const next = new Set(prev);
            next.add(id);
            Animated.timing(fadeRefs[index], {
                toValue: 0,
                duration: 220,
                useNativeDriver: true,
            }).start(() => {
                if (next.size >= items.length) finish();
            });
            return next;
        });
    };

    // `box-none` lets taps pass through the empty overlay to the menu below,
    // while the item Pressables still receive their own hits.
    // Pile base sits a fixed pad above whatever bottom chrome the parent owns
    // (menu bar). This is what `bottomInset` is for — without it, items land
    // inside the menu overlay because `popItem` uses `bottom: 0` of the
    // overlay, and the overlay extends to the bottom of mainDisplayArea.
    const pileBaseBottom = bottomInset + pileBaseGap;
    return (
        <View
            pointerEvents="box-none"
            style={StyleSheet.absoluteFill}
        >
            {items.map((item, i) => {
                // Pile geometry (row/slot, dynamic base width, plus straggler
                // overflow for large drops) is computed in computeLanding so
                // the launch animation and the render share one source of truth.
                const { landingX, landingY, rotateDeg } = computeLanding(i, items.length, item.id, pileDims);
                // Same per-item peak jitter the launch animation uses — kept
                // local because peak isn't part of computeLanding.
                const peak = arcPeakBase + jitterForId(item.id, 7) * arcPeakJitter;

                const translateX = xRefs[i].interpolate({
                    inputRange: [0, 1],
                    outputRange: [launchOffsetX, landingX],
                });
                // yRefs[i] is a 0→1 progress driven natively over the full
                // flight; interpolation here turns it into the up-then-down
                // pixel arc. Single timing = no JS sequence handoff at apex.
                // launchOffsetY shifts the spawn point up by that many dp so
                // items emerge from an on-screen object (e.g. the forage bag)
                // — the arc apex stays `peak` dp above the launch height.
                const translateY = yRefs[i].interpolate({
                    inputRange: [0, 0.5, 1],
                    outputRange: [-launchOffsetY, -(launchOffsetY + peak), landingY],
                });
                const opacity = fadeRefs[i];

                // Look up by `ingredient` (e.g. "tomato"), not by `id`. The
                // server emits id as `${eventMs}-${slot}-${ingredient}` —
                // a unique per-instance handle — so the INGREDIENT_ART map
                // never hits a match on it and every find was rendering as
                // a placeholder despite real art being shipped.
                const img = getIngredientArt(item.ingredient);
                return (
                    <Animated.View
                        key={item.id}
                        pointerEvents={dismissed.has(item.id) ? 'none' : 'box-none'}
                        style={[
                            styles.popItem,
                            {
                                bottom: pileBaseBottom,
                                width: itemSize,
                                height: itemSize,
                                marginLeft: -itemSize / 2,
                                marginBottom: -itemSize / 2,
                                opacity,
                                transform: [
                                    { translateX },
                                    { translateY },
                                    { rotate: `${rotateDeg}deg` },
                                ],
                            },
                        ]}
                    >
                        <Pressable
                            hitSlop={8}
                            onPress={() => dismissItem(item.id, i)}
                            style={[styles.pressable, { width: itemSize, height: itemSize }]}
                        >
                            <Image
                                source={img}
                                style={{ width: itemSize, height: itemSize }}
                                resizeMode="contain"
                            />
                        </Pressable>
                    </Animated.View>
                );
            })}
        </View>
    );
};

const styles = StyleSheet.create({
    // Pile base sits a fixed dp above the menu bar (or screen bottom if no
    // chrome). `bottom` is supplied per-render from the parent's bottomInset
    // — see ForagePopOut props.
    popItem: {
        position: 'absolute',
        left: '50%',
        marginLeft: -20,
        marginBottom: -20,
        width: 40,
        height: 40,
        alignItems: 'center',
        justifyContent: 'center',
    },
    pressable: {
        width: 40,
        height: 40,
        alignItems: 'center',
        justifyContent: 'center',
    },
    ingredientImage: {
        width: 40,
        height: 40,
    },
});

export default ForagePopOut;
