import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Dimensions, Image, Keyboard, Animated, Easing } from 'react-native';
import { useChromeConfig } from '../contexts/ChromeContext';

// Get screen dimensions for responsive sizing
const { width: screenWidth, height: screenHeight } = Dimensions.get('window');
const isTablet = screenWidth > 768; // Common tablet breakpoint

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
                            source={backgroundImageSource || require('../../assets/images/screen bg.png')}
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

                    {/* Inset shadow overlays — casing lip casts shadow into
                        the cavity along the top and left edges. Stepped for
                        a pixel-art feel and to avoid native gradient deps. */}
                    <View pointerEvents="none" style={[styles.insetShadowTop, { top: 0, height: 5, backgroundColor: 'rgba(0,0,0,0.38)' }]} />
                    <View pointerEvents="none" style={[styles.insetShadowTop, { top: 5, height: 6, backgroundColor: 'rgba(0,0,0,0.22)' }]} />
                    <View pointerEvents="none" style={[styles.insetShadowTop, { top: 11, height: 8, backgroundColor: 'rgba(0,0,0,0.10)' }]} />
                    <View pointerEvents="none" style={[styles.insetShadowLeft, { left: 0, width: 4, backgroundColor: 'rgba(0,0,0,0.30)' }]} />
                    <View pointerEvents="none" style={[styles.insetShadowLeft, { left: 4, width: 5, backgroundColor: 'rgba(0,0,0,0.16)' }]} />
                    <View pointerEvents="none" style={[styles.insetShadowLeft, { left: 9, width: 6, backgroundColor: 'rgba(0,0,0,0.07)' }]} />
                    {/* Subtle light catches the far edge. */}
                    <View pointerEvents="none" style={[styles.insetHighlightBottom, { backgroundColor: 'rgba(255,255,255,0.14)' }]} />
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
        top: isTablet ? '20%' : '22%',
        width: isTablet ? '75%' : '78%',
        height: isTablet ? '65%' : '51%',
        overflow: 'visible', // Allow shadows to show outside
        marginRight: isTablet ? 11 : 0, // Reduced by 5px to move right
        marginBottom: isTablet ? 16 : 12,
    },
    shadowContainerLarge: {
        position: 'absolute',
        top: isTablet ? '15%' : '17%',
        width: isTablet ? '85%' : '88%',
        height: isTablet ? '75%' : '65%',
        overflow: 'visible',
        marginRight: isTablet ? 11 : 0,
        marginBottom: isTablet ? 16 : 12,
    },
    innerScreen: {
        width: '100%',
        height: '100%',
        borderRadius: 20,
        overflow: 'hidden',
        position: 'relative',
        borderWidth: 1,
        borderColor: 'rgba(0, 0, 0, 0.35)',
        backgroundColor: '#E8F5E8',
        shadowColor: 'transparent',
        shadowOpacity: 0,
        shadowRadius: 0,
        shadowOffset: { width: 0, height: 0 },
        elevation: 0,
    },
    insetShadowTop: {
        position: 'absolute',
        left: 0,
        right: 0,
        zIndex: 50,
    },
    insetShadowLeft: {
        position: 'absolute',
        top: 0,
        bottom: 0,
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
        // Remove direct width/height since they're handled by shadowContainer
        // Keep only the margin adjustment
        marginTop: isTablet ? -10 : -20,
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
        height: isTablet ? '60%' : '80%',
    },
    innerScreenAllowOverflow: {
        overflow: 'visible',
        paddingBottom: 80, // Add padding to accommodate menu bar
    },
    darkenedButtons: {
        opacity: 0.3,
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
        padding: 10,
        backgroundColor: 'darkgray',
        zIndex: 2,
        borderBottomWidth: 2,
        borderBottomColor: 'rgba(0, 0, 0, 0.55)',
    },
    statItem: {
        alignItems: 'center',
        flex: 1,
    },
    statLabel: {
        color: 'white',
        fontSize: 12,
        fontWeight: 'bold',
        marginBottom: 2,
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
    bottomButtonContainer: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        width: '100%',
        paddingHorizontal: isTablet ? 40 : 55,
        position: 'absolute',
        bottom: isTablet ? 20 : 100,
    },
    bottomButton: {
        width: isTablet ? 80 : 75,
        height: isTablet ? 80 : 75,
        justifyContent: 'center',
        alignItems: 'center',
        borderRadius: isTablet ? 40 : 30,
        overflow: 'hidden',
        position: 'relative',
    },
    left: {
        marginRight: 'auto',
    },
    center: {
        marginTop: isTablet ? 10 : 30, // 10px lower
    },
    right: {
        marginLeft: 'auto',
    },
    disabled: {
        opacity: 0.3,
        backgroundColor: 'rgba(0, 0, 0, 0.3)',
    },
    buttonText: {
        color: '#2E5A3E', // Dark green for better contrast
        fontSize: 16,
        fontWeight: 'bold',
    },
    buttonImage: {
        position: 'absolute',
        width: '100%',
        height: '100%',
        borderRadius: isTablet ? 40 : 30,
    },
    deviceButton: {
        position: 'absolute',
        width: 50,
        height: 50,
        backgroundColor: 'transparent',
        borderRadius: 25,
        justifyContent: 'center',
        alignItems: 'center',
    },
    leftPhysical: {
        bottom: 20,
        left: 20,
    },
    centerPhysical: {
        bottom: 20,
        left: '50%',
        transform: [{ translateX: -25 }],
    },
    rightPhysical: {
        bottom: 20,
        right: 20,
    },
    yesButtonText: {
        color: '#4CAF50', // Softer green
    },
    noButtonText: {
        color: '#F44336', // Softer red
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
        fontFamily: 'PressStart2P',
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