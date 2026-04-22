import React, { useEffect, useRef } from 'react';
import { Animated, Dimensions, Easing, StyleSheet, View } from 'react-native';

// Keep these in sync with InnerScreen's `shadowContainerLarge` style — this is
// the rect the full-bleed page should appear to emerge from, so the transition
// reads as "zooming into" the tomagotchi cavity.
const { width: screenWidth, height: screenHeight } = Dimensions.get('window');
const isTablet = screenWidth > 768;
const CAVITY_TOP_PCT = isTablet ? 0.15 : 0.17;
const CAVITY_WIDTH_PCT = isTablet ? 0.85 : 0.88;
const CAVITY_HEIGHT_PCT = isTablet ? 0.75 : 0.65;

const cavityWidth = screenWidth * CAVITY_WIDTH_PCT;
const cavityHeight = screenHeight * CAVITY_HEIGHT_PCT;
const cavityLeft = (screenWidth - cavityWidth) / 2;
const cavityTop = screenHeight * CAVITY_TOP_PCT;

const startScaleX = cavityWidth / screenWidth;
const startScaleY = cavityHeight / screenHeight;
const startTranslateX = cavityLeft + cavityWidth / 2 - screenWidth / 2;
const startTranslateY = cavityTop + cavityHeight / 2 - screenHeight / 2;

interface Props {
    children: React.ReactNode;
    exiting?: boolean;
    onExitComplete?: () => void;
    backgroundColor?: string;
}

const ZoomOutOverlay: React.FC<Props> = ({
    children,
    exiting = false,
    onExitComplete,
    backgroundColor = '#E8F5E8',
}) => {
    const progress = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        Animated.timing(progress, {
            toValue: 1,
            duration: 420,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
        }).start();
    }, [progress]);

    useEffect(() => {
        if (!exiting) return;
        Animated.timing(progress, {
            toValue: 0,
            duration: 340,
            easing: Easing.in(Easing.cubic),
            useNativeDriver: true,
        }).start(() => {
            onExitComplete?.();
        });
    }, [exiting, progress, onExitComplete]);

    const scaleX = progress.interpolate({
        inputRange: [0, 1],
        outputRange: [startScaleX, 1],
    });
    const scaleY = progress.interpolate({
        inputRange: [0, 1],
        outputRange: [startScaleY, 1],
    });
    const translateX = progress.interpolate({
        inputRange: [0, 1],
        outputRange: [startTranslateX, 0],
    });
    const translateY = progress.interpolate({
        inputRange: [0, 1],
        outputRange: [startTranslateY, 0],
    });
    const opacity = progress.interpolate({
        inputRange: [0, 0.25, 1],
        outputRange: [0, 1, 1],
    });

    return (
        <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
            <Animated.View
                style={[
                    styles.page,
                    { backgroundColor, opacity, transform: [{ translateX }, { translateY }, { scaleX }, { scaleY }] },
                ]}
            >
                {children}
            </Animated.View>
        </View>
    );
};

const styles = StyleSheet.create({
    page: {
        ...StyleSheet.absoluteFillObject,
    },
});

export default ZoomOutOverlay;
