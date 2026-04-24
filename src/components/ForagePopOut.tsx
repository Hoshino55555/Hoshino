import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Image, Animated, Easing, Pressable, StyleSheet } from 'react-native';
import type { ForagedItem } from '../services/GameStateService';

// Placeholder sprite set used until per-ingredient art lands. Each foraged
// item deterministically picks one of these three via a hash of its id, so
// a rerender during the animation doesn't swap sprites mid-flight.
const PLACEHOLDER_IMAGES = [
    require('../../assets/images/Mira Berry.png'),
    require('../../assets/images/Nova Egg.png'),
    require('../../assets/images/Pink Sugar.png'),
];

function placeholderForId(id: string) {
    let h = 0;
    for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
    return PLACEHOLDER_IMAGES[Math.abs(h) % PLACEHOLDER_IMAGES.length];
}

interface Props {
    items: ForagedItem[];
    onComplete: () => void;
}

// Ballistic tuning. T is the half-period of the main arc (up-time = down-time
// under constant gravity). Subsequent bounces shrink by BOUNCE_DECAY, and
// their half-periods shrink with √height to match projectile physics.
const ARC_HALF_MS = 260;
const BOUNCE_DECAY = 0.35; // energy retained per ground contact
const STAGGER_MS = 80;
const GROUND_HOLD_MS = 10000;
const FADE_DURATION_MS = 400;

// Total travel time for one item — main arc + two bounces.
function flightMs() {
    const b1 = Math.sqrt(BOUNCE_DECAY);
    const b2 = Math.sqrt(BOUNCE_DECAY * BOUNCE_DECAY);
    return ARC_HALF_MS * 2 * (1 + b1 + b2);
}

// Build the ballistic Y sequence for one item: main arc, then two shrinking
// bounces. Ease.out on each rise (gravity decelerates), Ease.in on each fall
// (gravity accelerates). Peak heights follow BOUNCE_DECAY, periods follow √h.
function buildBounceSequence(yVal: Animated.Value, peak: number, delayMs: number) {
    const b1Peak = peak * BOUNCE_DECAY;
    const b2Peak = b1Peak * BOUNCE_DECAY;
    const b1Ms = ARC_HALF_MS * Math.sqrt(BOUNCE_DECAY);
    const b2Ms = ARC_HALF_MS * Math.sqrt(BOUNCE_DECAY * BOUNCE_DECAY);
    return Animated.sequence([
        Animated.delay(delayMs),
        Animated.timing(yVal, {
            toValue: -peak,
            duration: ARC_HALF_MS,
            easing: Easing.out(Easing.quad),
            useNativeDriver: true,
        }),
        Animated.timing(yVal, {
            toValue: 0,
            duration: ARC_HALF_MS,
            easing: Easing.in(Easing.quad),
            useNativeDriver: true,
        }),
        Animated.timing(yVal, {
            toValue: -b1Peak,
            duration: b1Ms,
            easing: Easing.out(Easing.quad),
            useNativeDriver: true,
        }),
        Animated.timing(yVal, {
            toValue: 0,
            duration: b1Ms,
            easing: Easing.in(Easing.quad),
            useNativeDriver: true,
        }),
        Animated.timing(yVal, {
            toValue: -b2Peak,
            duration: b2Ms,
            easing: Easing.out(Easing.quad),
            useNativeDriver: true,
        }),
        Animated.timing(yVal, {
            toValue: 0,
            duration: b2Ms,
            easing: Easing.in(Easing.quad),
            useNativeDriver: true,
        }),
    ]);
}

// Items launch from the Moonoko's feet with real ballistic motion, bounce
// twice on the ground line, and sit waiting to be collected. Each item is
// tappable for a quick pop-dismiss. Leftovers fade on a global timer.
// Inventory was already credited by the parent's drain call — this overlay
// is the reward flourish, not the source of truth.
const ForagePopOut: React.FC<Props> = ({ items, onComplete }) => {
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

    useEffect(() => {
        if (items.length === 0) {
            finish();
            return;
        }
        const flight = flightMs();
        items.forEach((_, i) => {
            const delayMs = i * STAGGER_MS;
            const peak = 90 + (i % 3) * 18;
            // Horizontal travel decelerates slightly (air drag feel) over the
            // full flight so the item keeps drifting through each bounce.
            Animated.timing(xRefs[i], {
                toValue: 1,
                duration: flight,
                delay: delayMs,
                easing: Easing.out(Easing.quad),
                useNativeDriver: true,
            }).start();
            // Vertical bounce cascade.
            buildBounceSequence(yRefs[i], peak, delayMs).start();
        });

        // Global ground-hold timer: starts when the LAST item has finished
        // bouncing, so every find gets its full shelf life regardless of
        // batch size. Fades whatever is still on the ground and resolves.
        const lastLandingMs = flight + (items.length - 1) * STAGGER_MS;
        const timeout = setTimeout(() => {
            const remaining = items.filter((it) => !dismissed.has(it.id));
            if (remaining.length === 0) {
                finish();
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
            ).start(finish);
        }, lastLandingMs + GROUND_HOLD_MS);

        return () => clearTimeout(timeout);
        // dismissed deliberately omitted — we read it at timer fire, not setup.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [items, finish]);

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
    return (
        <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
            {items.map((item, i) => {
                // Every item arcs to one side — alternating left/right by
                // index, with distance growing each pair. Single items still
                // visibly arc (instead of flying straight up and falling), and
                // batches fan symmetrically from the moonoko's feet.
                const side = i % 2 === 0 ? 1 : -1;
                const distance = 70 + Math.floor(i / 2) * 40;
                const landingX = side * distance;

                const translateX = xRefs[i].interpolate({
                    inputRange: [0, 1],
                    outputRange: [0, landingX],
                });
                const translateY = yRefs[i]; // pixels, driven by the sequence
                const opacity = fadeRefs[i];

                const img = placeholderForId(item.id);
                return (
                    <Animated.View
                        key={item.id}
                        pointerEvents={dismissed.has(item.id) ? 'none' : 'box-none'}
                        style={[
                            styles.popItem,
                            { opacity, transform: [{ translateX }, { translateY }] },
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
    // Origin sits near the Moonoko's feet. characterImage is 250x250 with
    // contain + marginTop:-80, placing the sprite's feet ~65% down the
    // display area.
    popItem: {
        position: 'absolute',
        top: '65%',
        left: '50%',
        marginLeft: -20,
        marginTop: -20,
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
