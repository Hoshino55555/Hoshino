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

// Hash to a deterministic float in [-1, 1] so each item gets stable jitter
// across rerenders without using random (which would reshuffle on every render).
function jitterForId(id: string, salt: number) {
    let h = salt;
    for (let i = 0; i < id.length; i++) h = (h * 131 + id.charCodeAt(i)) | 0;
    return ((h & 0xffff) / 0xffff) * 2 - 1;
}

interface Props {
    items: ForagedItem[];
    onComplete: () => void;
}

// Snappier pile-at-feet feel:
// - One arc (up + down), no rebounds — items thud and stay put.
// - Items land in a small footprint and stack vertically so successive finds
//   read as a "pile" instead of a horizontal line on the ground line.
const ARC_HALF_MS = 220;
const STAGGER_MS = 55;
const GROUND_HOLD_MS = 10000;
const FADE_DURATION_MS = 400;
// Pile footprint at the moonoko's feet.
const PILE_SPREAD_X = 28; // ±px horizontal jitter around centerline
const PILE_LIFT_PER_ITEM = 5; // px each subsequent item sits higher (stack height)
const PILE_LIFT_CAP = 60; // never lift higher than this — keeps the pile near the ground

const flightMs = () => ARC_HALF_MS * 2;

export const FORAGE_FLIGHT_MS = ARC_HALF_MS * 2;

// Items launch from the Moonoko's feet, arc once, and land in a pile at the
// feet. Each item is tappable for a quick pop-dismiss. Leftovers fade on a
// global timer. Inventory was already credited by the parent's drain call —
// this overlay is the reward flourish, not the source of truth.
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
            const stackOffset = -Math.min(i * PILE_LIFT_PER_ITEM, PILE_LIFT_CAP);
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
                // Small horizontal jitter around the centerline so the pile
                // has natural width without scattering across the screen.
                const landingX = jitterForId(item.id, 11) * PILE_SPREAD_X;

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
