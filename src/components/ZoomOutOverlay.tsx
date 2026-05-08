import React, { useEffect } from 'react';
import { Dimensions, StyleSheet, View } from 'react-native';
import Animated, {
    Easing,
    runOnJS,
    useAnimatedProps,
    useSharedValue,
    withTiming,
} from 'react-native-reanimated';
import Svg, { G, Path } from 'react-native-svg';

import { HOSHINO_STAR_PATH } from './hoshinoStarPath';

// IRIS_BUILD_TAG bumps every time we change this file so we can verify the
// device is actually running the latest JS bundle (not a cached one).
// Look for "iris build" in `adb logcat` after a transition fires.
const IRIS_BUILD_TAG = '2026-05-08-subpixel-pinhole';
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

const { width: screenWidth, height: screenHeight } = Dimensions.get('window');
const irisCenterX = screenWidth / 2;
const irisCenterY = screenHeight / 2;

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
//   doesn't render) and grow the rect half-extent 10× to compensate (still
//   covers any phone screen at the new scale). The iris is now genuinely
//   opaque when "closed" and no auxiliary cover layer is needed.
const HUGE_RECT_PATH = 'M-50000000,-50000000 H50000000 V50000000 H-50000000 Z ';
const COMPOUND_PATH = HUGE_RECT_PATH + HOSHINO_STAR_PATH;

const STAR_RADIUS = 1024;
export const IRIS_FINAL_SCALE = (Math.max(screenWidth, screenHeight) * 2) / STAR_RADIUS;
// 0.0001 × 1024-unit star radius → 0.1px pinhole at "closed" — sub-pixel,
// no visible hole. 0.0001 × 50_000_000 rect half-extent → 5_000px rect
// coverage, still far bigger than any phone screen.
export const IRIS_INITIAL_SCALE = 0.0001;
export const IRIS_DURATION_MS = 1400;

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
    const scale = useSharedValue(initialOpen ? IRIS_FINAL_SCALE : IRIS_INITIAL_SCALE);

    useEffect(() => {
        // Symmetric ease-in on both directions. We tried ease-out on close
        // to make the closing motion more visible, but front-loading the
        // motion left a long static-black window before the swap during
        // which any micro-flicker (screen A unmounting, screen B mounting,
        // cover panel hand-off) became visible. Ease-in on close keeps the
        // eye tracking motion right up to the swap, masking the seam.
        scale.value = withTiming(
            exiting ? IRIS_INITIAL_SCALE : IRIS_FINAL_SCALE,
            {
                duration: IRIS_DURATION_MS,
                easing: Easing.in(Easing.cubic),
            },
            (finished) => {
                'worklet';
                if (!finished) return;
                if (exiting && onExitComplete) {
                    runOnJS(onExitComplete)();
                } else if (!exiting && onOpenComplete) {
                    runOnJS(onOpenComplete)();
                }
            },
        );
    }, [exiting, scale, onExitComplete, onOpenComplete]);

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
                style={[StyleSheet.absoluteFill, { zIndex: 999, elevation: 999 }]}
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
        </View>
    );
};

export default ZoomOutOverlay;
