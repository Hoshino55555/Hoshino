import React, { useCallback, useEffect, useRef } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import Animated, {
    cancelAnimation,
    Easing,
    runOnJS,
    useAnimatedProps,
    useAnimatedStyle,
    useSharedValue,
    withDelay,
    withTiming,
} from 'react-native-reanimated';
import Svg, { G, Path } from 'react-native-svg';

import { HOSHINO_STAR_PATH } from './hoshinoStarPath';
import { Z } from '../../styles/zLayers';

// IRIS_BUILD_TAG bumps every time we change this file so we can verify the
// device is actually running the latest JS bundle (not a cached one).
// Look for "iris build" in `adb logcat` after a transition fires.
const IRIS_BUILD_TAG = '2026-05-10-ui-thread-hard-mask';
console.log('[iris build]', IRIS_BUILD_TAG);

// Iris-out reveal: a Hoshino-star-shaped hole opens from the center of the
// screen and grows past the edges; on exit it shrinks back to a dot.
//
// Architecture: a SINGLE <Path> with fillRule="evenodd" combines a giant
// outer rectangle and the auto-traced star silhouette. Even-odd fill paints
// the rectangle interior black and "punches" the star out as transparent —
// no <Mask>, no offscreen alpha buffer. The path is pre-baked into y-down
// centered coordinates (see hoshinoStarPath.ts), so the runtime transform
// is just a clean matrix(s 0 0 s cx cy) — no negative scales, no inner
// flip, no transform-stack ambiguity.

// Path is in centered coords spanning roughly ±1000 (after baking, viewBox
// 2048). Two competing constraints on INITIAL_SCALE:
//   1. Outer rect must remain bigger than the screen at all scales (so the
//      iris always covers the screen no matter how small the star hole is).
//   2. The star hole at INITIAL_SCALE must be SUB-PIXEL — i.e., star radius
//      × INITIAL_SCALE < 1 — otherwise the "closed" iris has a visible
//      pinhole at center that leaks the screen swap through during the
//      close→cover→open seam (you can see the menus changing behind the
//      curtain through that pinhole). The previous values (INITIAL_SCALE
//      0.001, rect half-extent 5_000_000) gave a 1.024px pinhole that was
//      visible for several frames at the seam, requiring a separate
//      solid-black cover layer to plug it — and that cover had its own
//      mount/unmount seams.
//   Solution: shrink INITIAL_SCALE 10× (star pinhole → 0.1px, sub-pixel,
//   doesn't render) and grow the rect half-extent 10× to compensate. The
//   hard mask below now only protects the route-swap/opening handoff from
//   renderer timing, not a visible hole in the iris path itself.
const HUGE_RECT_PATH = 'M-50000000,-50000000 H50000000 V50000000 H-50000000 Z ';
const COMPOUND_PATH = HUGE_RECT_PATH + HOSHINO_STAR_PATH;

const STAR_RADIUS = 1024;
// 0.0001 × 1024-unit star radius → 0.1px pinhole at "closed" — sub-pixel,
// no visible hole. 0.0001 × 50_000_000 rect half-extent → 5_000px rect
// coverage, still far bigger than any phone screen.
const IRIS_INITIAL_SCALE = 0.0001;
const IRIS_OPEN_DURATION_MS = 1400;
const IRIS_CLOSE_DURATION_MS = 1850;

const IRIS_OPEN_EASING = Easing.in(Easing.cubic);
const IRIS_CLOSE_EASING = Easing.inOut(Easing.quad);
const IRIS_LAYER_Z = Z.iris;
const HARD_MASK_LAYER_Z = Z.hardMask;
// Hard mask timing lives with the iris because it protects the visual seam
// between the JS route swap and Reanimated's first committed open frame.
const HARD_MASK_ARM_BEFORE_CLOSE_MS = 180;
const HARD_MASK_RELEASE_AFTER_OPEN_MS = 560;
const HARD_MASK_PRE_SWAP_SETTLE_MS = 120;

interface Props {
    children: React.ReactNode;
    exiting?: boolean;
    onExitComplete?: () => void;
    onOpenComplete?: () => void;
    // When true, mount with the iris already open (FINAL_SCALE) so the
    // first frame doesn't animate from a closed dot. The global App-level
    // iris wants this so app start doesn't begin with a 2s reveal.
    initialOpen?: boolean;
}

const AnimatedG = Animated.createAnimatedComponent(G);

const ZoomOutOverlay: React.FC<Props> = ({
    children,
    exiting = false,
    onExitComplete,
    onOpenComplete,
    initialOpen = false,
}) => {
    const { width: screenWidth, height: screenHeight } = useWindowDimensions();
    const irisCenterX = screenWidth / 2;
    const irisCenterY = screenHeight / 2;
    const irisFinalScale = (Math.max(screenWidth, screenHeight) * 2) / STAR_RADIUS;
    const scale = useSharedValue(initialOpen ? irisFinalScale : IRIS_INITIAL_SCALE);
    const hardMaskOpacity = useSharedValue(initialOpen ? 0 : 1);
    const exitCompleteTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const notifyExitCompleteAfterMaskSettles = useCallback(() => {
        if (exitCompleteTimerRef.current != null) {
            clearTimeout(exitCompleteTimerRef.current);
            exitCompleteTimerRef.current = null;
        }
        exitCompleteTimerRef.current = setTimeout(() => {
            exitCompleteTimerRef.current = null;
            onExitComplete?.();
        }, HARD_MASK_PRE_SWAP_SETTLE_MS);
    }, [onExitComplete]);

    useEffect(() => {
        return () => {
            if (exitCompleteTimerRef.current != null) {
                clearTimeout(exitCompleteTimerRef.current);
                exitCompleteTimerRef.current = null;
            }
        };
    }, []);

    useEffect(() => {
        cancelAnimation(hardMaskOpacity);
        if (exitCompleteTimerRef.current != null) {
            clearTimeout(exitCompleteTimerRef.current);
            exitCompleteTimerRef.current = null;
        }

        if (exiting) {
            hardMaskOpacity.value = withDelay(
                Math.max(0, IRIS_CLOSE_DURATION_MS - HARD_MASK_ARM_BEFORE_CLOSE_MS),
                withTiming(1, { duration: 0 }),
            );
        } else {
            hardMaskOpacity.value = withDelay(
                HARD_MASK_RELEASE_AFTER_OPEN_MS,
                withTiming(0, { duration: 0 }),
            );
        }

        // Opening keeps the original timing/curve; its slow-start reveal is
        // the part that already feels right. Closing gets its own longer
        // in-out curve so the star aperture visibly collapses instead of
        // snapping shut in the final stretch.
        scale.value = withTiming(
            exiting ? IRIS_INITIAL_SCALE : irisFinalScale,
            {
                duration: exiting ? IRIS_CLOSE_DURATION_MS : IRIS_OPEN_DURATION_MS,
                easing: exiting ? IRIS_CLOSE_EASING : IRIS_OPEN_EASING,
            },
            (finished) => {
                'worklet';
                if (!finished) return;
                if (exiting && onExitComplete) {
                    hardMaskOpacity.value = 1;
                    runOnJS(notifyExitCompleteAfterMaskSettles)();
                } else if (!exiting && onOpenComplete) {
                    hardMaskOpacity.value = 0;
                    runOnJS(onOpenComplete)();
                }
            },
        );
    }, [
        exiting,
        hardMaskOpacity,
        irisFinalScale,
        notifyExitCompleteAfterMaskSettles,
        onExitComplete,
        onOpenComplete,
        scale,
    ]);

    // RN-style transform array instead of SVG transform string. Reanimated 4 +
    // react-native-svg's string-transform animator only reliably applies the
    // first numeric pair of `translate(...)` and silently drops the y component
    // (or fuses it with x), which made `irisCenterY` appear to do nothing.
    // Array form decomposes into translateX/translateY/scale that Reanimated
    // pipes through correctly.
    const animatedStarProps = useAnimatedProps(() => {
        'worklet';
        const s = scale.value;
        return {
            transform: [
                { translateX: irisCenterX },
                { translateY: irisCenterY },
                { scale: s },
            ],
        } as any;
    });

    const hardMaskStyle = useAnimatedStyle(() => ({
        opacity: hardMaskOpacity.value,
    }));

    return (
        <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
            {children}
            {/* Wrap the SVG in a View with very high elevation so the iris
                renders above siblings that set their own Android elevation
                (DeviceButtons' bottomButtonContainer at elevation:20, etc.).
                Without this the SVG draws behind elevated chrome and the
                iris fails to cover them on Android even though render order
                says it should be on top. */}
            <View
                pointerEvents="none"
                style={[
                    StyleSheet.absoluteFill,
                    { zIndex: IRIS_LAYER_Z, elevation: IRIS_LAYER_Z },
                ]}
            >
                <Svg
                    pointerEvents="none"
                    style={StyleSheet.absoluteFill}
                    width={screenWidth}
                    height={screenHeight}
                >
                    <AnimatedG animatedProps={animatedStarProps}>
                        <Path d={COMPOUND_PATH} fill="#000" fillRule="evenodd" />
                    </AnimatedG>
                </Svg>
            </View>
            <Animated.View
                pointerEvents="none"
                style={[StyleSheet.absoluteFill, styles.hardMask, hardMaskStyle]}
            />
        </View>
    );
};

const styles = StyleSheet.create({
    hardMask: {
        backgroundColor: 'black',
        zIndex: HARD_MASK_LAYER_Z,
        elevation: HARD_MASK_LAYER_Z,
    },
});

export default ZoomOutOverlay;
