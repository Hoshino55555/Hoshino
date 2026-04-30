import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Image, Animated, Easing, Pressable, StyleSheet } from 'react-native';
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
// Base width tuned for typical forage drops (1–5 items): a 4-wide base reads
// as a clear pyramid for small piles. Larger batches taper down and any
// overflow stacks vertically at the apex (Math.max(1, …) below).
const BASE_ROW_SIZE = 4;
function placeOnPile(i: number, total: number) {
    const baseRowSize = Math.min(BASE_ROW_SIZE, Math.max(1, total));
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
    const remaining = total - placed;
    const actualRowSize = Math.min(rowSize, remaining);
    return { row, slot: i - placed, rowSize: actualRowSize, baseRowSize };
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
}

// Snappier pile-at-feet feel:
// - One arc (up + down), no rebounds — items thud and stay put.
// - Items land in a triangular pile at the moonoko's feet: the first
//   items in form the wide base, later items stack higher and narrower
//   toward the apex.
const ARC_HALF_MS = 220;
const STAGGER_MS = 55;
const GROUND_HOLD_MS = 10000;
const FADE_DURATION_MS = 400;
// Pile footprint at the moonoko's feet. SPREAD is the half-width of the
// base row; higher items get a narrower spread (see spreadFactor below)
// so the silhouette reads as a triangle rather than a vertical column.
const PILE_BASE_SPREAD_X = 52; // ±px at the base of the pile
const PILE_LIFT_PER_ITEM = 12; // px each subsequent item sits higher
const PILE_LIFT_CAP = 72;     // hard cap on stack height (~6 items high)
// Gap between the menu bar's top edge (or screen bottom if no chrome) and
// the visual base of the pile. Tunable by eye.
const PILE_BASE_GAP = 30;

const flightMs = () => ARC_HALF_MS * 2;

export const FORAGE_FLIGHT_MS = ARC_HALF_MS * 2;

// Items launch from the Moonoko's feet, arc once, and land in a pile at the
// feet. Each item is tappable for a quick pop-dismiss. Leftovers fade on a
// global timer. Inventory was already credited by the parent's drain call —
// this overlay is the reward flourish, not the source of truth.
const ForagePopOut: React.FC<Props> = ({ items, onComplete, bottomInset = 0 }) => {
    const xRefs = useRef(items.map(() => new Animated.Value(0))).current;
    const yRefs = useRef(items.map(() => new Animated.Value(0))).current;
    const fadeRefs = useRef(items.map(() => new Animated.Value(1))).current;
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
        items.forEach((item, i) => {
            const delayMs = i * STAGGER_MS;
            // Slightly varying arc heights so identical sprites don't fly in
            // perfect lockstep — pure visual texture, no gameplay meaning.
            const peak = 110 + jitterForId(item.id, 7) * 18;
            // Horizontal drift over the full flight so items don't fall
            // straight down. Native driver throughout.
            Animated.timing(xRefs[i], {
                toValue: 1,
                duration: flight,
                delay: delayMs,
                easing: Easing.out(Easing.quad),
                useNativeDriver: true,
            }).start();
            // Single arc: up (decel) then down (accel) — no rebound.
            // Per-item Y jitter on the landing height so items in the same
            // row don't sit on a perfectly flat line — looks more like a
            // real pile.
            const { row } = placeOnPile(i, items.length);
            const yJitter = jitterForId(item.id, 19) * 6;
            const stackOffset = -Math.min(row * PILE_LIFT_PER_ITEM, PILE_LIFT_CAP) + yJitter;
            Animated.sequence([
                Animated.delay(delayMs),
                Animated.timing(yRefs[i], {
                    toValue: -peak,
                    duration: ARC_HALF_MS,
                    easing: Easing.out(Easing.quad),
                    useNativeDriver: true,
                }),
                Animated.timing(yRefs[i], {
                    toValue: stackOffset,
                    duration: ARC_HALF_MS,
                    easing: Easing.in(Easing.quad),
                    useNativeDriver: true,
                }),
            ]).start();
        });

        // Global ground-hold timer: starts when the LAST item has finished
        // landing, so every find gets its full shelf life regardless of
        // batch size. Fades whatever is still on the ground and resolves.
        const lastLandingMs = flight + (items.length - 1) * STAGGER_MS;
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
    const pileBaseBottom = bottomInset + PILE_BASE_GAP;
    return (
        <View
            pointerEvents="box-none"
            style={StyleSheet.absoluteFill}
        >
            {items.map((item, i) => {
                // Triangular pile: each row holds one fewer item than the
                // one below it. Slot positions evenly spread across the
                // row's available width, with a small id-derived jitter
                // so identical sprites don't sit on perfectly straight
                // lines.
                const { row, slot, rowSize, baseRowSize } = placeOnPile(i, items.length);
                const spreadFactor = (baseRowSize - row) / baseRowSize;
                const slotBase = rowSize > 1 ? (slot / (rowSize - 1)) * 2 - 1 : 0;
                const xJitter = jitterForId(item.id, 11) * 0.4;
                const landingX = (slotBase + xJitter) * PILE_BASE_SPREAD_X * spreadFactor;
                // Per-item rotation so sprites don't all lie flat. ±18° read
                // as a tossed-in pile rather than placed.
                const rotateDeg = jitterForId(item.id, 23) * 18;

                const translateX = xRefs[i].interpolate({
                    inputRange: [0, 1],
                    outputRange: [0, landingX],
                });
                const translateY = yRefs[i]; // pixels, driven by the sequence
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
                            style={styles.pressable}
                        >
                            <Image source={img} style={styles.ingredientImage} resizeMode="contain" />
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
