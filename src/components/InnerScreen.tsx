import React, { useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Image, Animated, Easing } from 'react-native';
import { useChromeConfig } from '../contexts/ChromeContext';
import { Backgrounds } from '../assets';

interface InnerScreenProps {
    children: React.ReactNode;
    onLeftButtonPress?: () => void;
    onCenterButtonPress?: () => void;
    onRightButtonPress?: () => void;
    leftButtonText?: string;
    centerButtonText?: string;
    rightButtonText?: string;
    leftButtonDisabled?: boolean;
    centerButtonDisabled?: boolean;
    rightButtonDisabled?: boolean;
    showStatsBar?: boolean;
    statsBarContent?: React.ReactNode;
    topStatusContent?: React.ReactNode;
    showBackgroundImage?: boolean;
    backgroundImageSource?: any;
    isSelectionPage?: boolean; // New prop for selection page styling
    overlayMode?: boolean; // New prop for modal-like overlay effect
    keyboardVisible?: boolean; // New prop for keyboard state
    showCloseButton?: boolean; // New prop for close button
    onCloseButtonPress?: () => void; // New prop for close button action
    allowOverflow?: boolean; // New prop to allow overflow for menu bars
    isTransitioning?: boolean; // New prop for transition animation
    transitionOpacity?: number; // New prop for transition opacity
    expanded?: boolean; // Bigger screen dimensions for content-heavy pages
    animateIn?: boolean; // Zoom-in mount animation
    exiting?: boolean; // Trigger zoom-out animation (caller should mount until onExitComplete fires)
    onExitComplete?: () => void;
}

const InnerScreen: React.FC<InnerScreenProps> = ({
    children,
    onLeftButtonPress,
    onCenterButtonPress,
    onRightButtonPress,
    leftButtonText = '',
    centerButtonText = '',
    rightButtonText = '',
    leftButtonDisabled = false,
    centerButtonDisabled = false,
    rightButtonDisabled = false,
    showStatsBar = false,
    statsBarContent,
    topStatusContent,
    showBackgroundImage = true,
    backgroundImageSource,
    isSelectionPage = false,
    overlayMode = false,
    keyboardVisible = false,
    showCloseButton = false,
    onCloseButtonPress,
    allowOverflow = false,
    isTransitioning = false,
    transitionOpacity = 0,
    expanded = false,
    animateIn = false,
    exiting = false,
    onExitComplete
}) => {
    const zoomScale = useRef(new Animated.Value(animateIn ? 0.6 : 1)).current;
    const zoomOpacity = useRef(new Animated.Value(animateIn ? 0 : 1)).current;

    useEffect(() => {
        if (!animateIn) return;
        Animated.parallel([
            Animated.spring(zoomScale, {
                toValue: 1,
                tension: 22,
                friction: 5.5,
                useNativeDriver: true,
            }),
            Animated.timing(zoomOpacity, {
                toValue: 1,
                duration: 520,
                easing: Easing.out(Easing.quad),
                useNativeDriver: true,
            }),
        ]).start();
    }, [animateIn]);

    useEffect(() => {
        if (!exiting) return;
        Animated.parallel([
            Animated.timing(zoomScale, {
                toValue: 0.6,
                duration: 560,
                easing: Easing.in(Easing.back(1.8)),
                useNativeDriver: true,
            }),
            Animated.timing(zoomOpacity, {
                toValue: 0,
                duration: 500,
                easing: Easing.in(Easing.quad),
                useNativeDriver: true,
            }),
        ]).start(() => {
            onExitComplete?.();
        });
    }, [exiting]);

    const useLargeLayout = isSelectionPage || expanded;
    const useAnimatedWrapper = animateIn || exiting;
    const ShadowWrapper: any = useAnimatedWrapper ? Animated.View : View;
    const animatedStyle = useAnimatedWrapper
        ? { opacity: zoomOpacity, transform: [{ scale: zoomScale }] }
        : null;

    useChromeConfig({
        leftButtonText,
        centerButtonText,
        rightButtonText,
        leftButtonDisabled,
        centerButtonDisabled,
        rightButtonDisabled,
        onLeftButtonPress,
        onCenterButtonPress,
        onRightButtonPress,
        overlayMode,
    });

    return (
        <View style={styles.tamagotchiScreenContainer} pointerEvents="box-none">
            {/* Top Status Bar */}
            {topStatusContent && (
                <View style={styles.topStatus}>
                    {topStatusContent}
                </View>
            )}

            {/* Shadow container with overflow visible */}
            <ShadowWrapper style={[
                styles.shadowContainer,
                useLargeLayout && styles.shadowContainerLarge,
                animatedStyle
            ]}>
                {/* Inner screen with rounded borders */}
                <View style={[
                    styles.innerScreen,
                    useLargeLayout && styles.innerScreenLarge,
                    overlayMode && styles.overlayInnerScreen,
                    keyboardVisible && styles.innerScreenWithKeyboard,
                    allowOverflow && styles.innerScreenAllowOverflow
                ]}>
                    {/* Screen background */}
                    {showBackgroundImage && (
                        <Image
                            source={backgroundImageSource || Backgrounds.screen}
                            style={styles.innerBackground}
                            resizeMode="cover"
                        />
                    )}

                    {/* Stats Bar */}
                    {showStatsBar && (
                        <View style={styles.statsBar}>
                            {statsBarContent || (
                                <>
                                    <View style={styles.statItem}>
                                        <Text style={styles.statLabel}>Items</Text>
                                        <Text style={styles.starRating}>⭐⭐⭐⭐⭐</Text>
                                    </View>
                                    <View style={styles.statItem}>
                                        <Text style={styles.statLabel}>Moonokos</Text>
                                        <Text style={styles.starRating}>⭐⭐⭐⭐⭐</Text>
                                    </View>
                                    <View style={styles.statItem}>
                                        <Text style={styles.statLabel}>Total</Text>
                                        <Text style={styles.starRating}>⭐⭐⭐⭐⭐</Text>
                                    </View>
                                </>
                            )}
                        </View>
                    )}

                                    {/* Main content area */}
                <View style={styles.mainDisplayArea}>
                    {children}
                </View>
                
                {/* Transition Overlay - only affects InnerScreen content */}
                {isTransitioning && (
                    <View style={[
                        styles.transitionOverlay,
                        { opacity: transitionOpacity }
                    ]} />
                )}

                    {/* Close Button */}
                    {showCloseButton && onCloseButtonPress && (
                        <TouchableOpacity
                            style={styles.closeButton}
                            onPress={onCloseButtonPress}
                        >
                            <Text style={styles.closeButtonText}>✕</Text>
                        </TouchableOpacity>
                    )}

                </View>
            </ShadowWrapper>
        </View>
    );
};

const styles = StyleSheet.create({
    tamagotchiScreenContainer: {
        flex: 1,
        backgroundColor: 'transparent',
        alignItems: 'center',
        justifyContent: 'center',
    },
    mainBackground: {
        position: 'absolute',
        width: '100%',
        height: '100%',
        resizeMode: 'contain',
    },
    topStatus: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        height: 40,
        backgroundColor: 'gray',
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: 1000,
    },
    shadowContainer: {
        position: 'absolute',
        // Slightly bleed under the transparent aperture in the 1200x2670
        // chrome art. Exact-fit values can expose a 1-2px hairline where
        // Android rounds layout percentages against the antialiased lip.
        top: '22.0%',
        left: '10.9%',
        width: '78.3%',
        height: '51.0%',
        overflow: 'visible', // Allow shadows to show outside
    },
    shadowContainerLarge: {
        position: 'absolute',
        top: '16%',
        width: '88%',
        height: '68%',
        overflow: 'visible',
        marginRight: '1%',
        marginBottom: '1.5%',
    },
    innerScreen: {
        width: '100%',
        height: '100%',
        borderRadius: 20,
        overflow: 'hidden',
        position: 'relative',
        borderWidth: 0,
        borderColor: 'rgba(0, 0, 0, 0.35)',
        backgroundColor: '#E8F5E8',
        shadowColor: 'transparent',
        shadowOpacity: 0,
        shadowRadius: 0,
        shadowOffset: { width: 0, height: 0 },
        elevation: 0,
    },
    vignetteTop: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        height: 32,
        zIndex: 50,
    },
    vignetteLeft: {
        position: 'absolute',
        top: 0,
        bottom: 0,
        left: 0,
        width: 22,
        zIndex: 50,
    },
    vignetteRight: {
        position: 'absolute',
        top: 0,
        bottom: 0,
        right: 0,
        width: 18,
        zIndex: 50,
    },
    vignetteBottom: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        height: 22,
        zIndex: 50,
    },
    insetHighlightBottom: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        height: 4,
        zIndex: 50,
    },
    innerScreenLarge: {
        shadowColor: 'transparent',
        shadowOpacity: 0,
        shadowRadius: 0,
        shadowOffset: { width: 0, height: 0 },
        elevation: 0,
    },
    darkenedBackground: {
        opacity: 0.3,
    },
    overlayInnerScreen: {
        zIndex: 1000,
        elevation: 10,
    },
    innerScreenWithKeyboard: {
        height: '72%',
    },
    innerScreenAllowOverflow: {
        overflow: 'visible',
        paddingBottom: 80, // Add padding to accommodate menu bar
    },
    innerBackground: {
        position: 'absolute',
        width: '100%',
        height: '100%',
        zIndex: 1,
    },


    // Dark halos in the gap between screen and casing — simulate
    // ambient shadow pooling in the cavity depth, not an outward glow.
    gradientShadowOuter: {
        position: 'absolute',
        top: -4,
        left: -4,
        right: -4,
        bottom: -4,
        borderRadius: 24,
        backgroundColor: 'rgba(0, 0, 0, 0.28)',
        zIndex: 1,
        pointerEvents: 'none',
    },
    gradientShadowInner: {
        position: 'absolute',
        top: -2,
        left: -2,
        right: -2,
        bottom: -2,
        borderRadius: 22,
        backgroundColor: 'rgba(0, 0, 0, 0.18)',
        zIndex: 2,
        pointerEvents: 'none',
    },
    gradientShadowCorner1: {
        position: 'absolute',
        top: -3,
        left: -3,
        width: 6,
        height: 6,
        borderRadius: 3,
        backgroundColor: 'rgba(255, 140, 0, 0.12)', // Soft orange corner
        zIndex: 3,
        pointerEvents: 'none', // Don't intercept touch events
    },
    gradientShadowCorner2: {
        position: 'absolute',
        top: -3,
        right: -3,
        width: 6,
        height: 6,
        borderRadius: 3,
        backgroundColor: 'rgba(255, 140, 0, 0.12)', // Soft orange corner
        zIndex: 3,
        pointerEvents: 'none', // Don't intercept touch events
    },
    gradientShadowCorner3: {
        position: 'absolute',
        bottom: -3,
        left: -3,
        width: 6,
        height: 6,
        borderRadius: 3,
        backgroundColor: 'rgba(255, 140, 0, 0.12)', // Soft orange corner
        zIndex: 3,
        pointerEvents: 'none', // Don't intercept touch events
    },
    gradientShadowCorner4: {
        position: 'absolute',
        bottom: -3,
        right: -3,
        width: 6,
        height: 6,
        borderRadius: 3,
        backgroundColor: 'rgba(255, 140, 0, 0.12)', // Soft orange corner
        zIndex: 3,
        pointerEvents: 'none', // Don't intercept touch events
    },











    statsBar: {
        flexDirection: 'row',
        justifyContent: 'space-around',
        paddingHorizontal: 6,
        paddingTop: 11,
        paddingBottom: 6,
        backgroundColor: 'transparent',
        zIndex: 2,
    },
    statItem: {
        alignItems: 'center',
        flex: 1,
    },
    statLabel: {
        color: 'white',
        fontSize: 18,
        marginBottom: 2,
        fontFamily: 'Minecraft',
    },
    starRating: {
        color: 'gold',
        fontSize: 14,
    },
    mainDisplayArea: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: 2,
        overflow: 'visible', // Allow Frame shadows to show
    },
    closeButton: {
        position: 'absolute',
        top: 10,
        right: 15,
        zIndex: 10,
        width: 30,
        height: 30,
        borderRadius: 4,
        backgroundColor: '#2E5A3E',
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 2,
        borderColor: '#2E5A3E',
    },
    closeButtonText: {
        fontSize: 18,
        color: '#E8F5E8',
        fontFamily: 'Monaco',
        transform: [{ translateY: -1 }],
    },
    transitionOverlay: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 1.0)',
        zIndex: 10,
    },
});

export default InnerScreen;
