import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Dimensions, Image, Keyboard } from 'react-native';

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
    transitionOpacity = 0
}) => {
    return (
        <View style={styles.tamagotchiScreenContainer}>
            {/* Background casing image */}
            <Image
                source={require('../../assets/images/casing.png')}
                style={[styles.mainBackground, overlayMode && styles.darkenedBackground]}
                resizeMode="cover"
            />

            {/* Top Status Bar */}
            {topStatusContent && (
                <View style={styles.topStatus}>
                    {topStatusContent}
                </View>
            )}

            {/* Shadow container with overflow visible */}
            <View style={[
                styles.shadowContainer,
                isSelectionPage && styles.shadowContainerLarge
            ]}>
                {/* Gradient shadow layers - only for non-selection pages */}
                {!isSelectionPage && (
                    <>
                        <View style={styles.gradientShadowOuter} />
                        <View style={styles.gradientShadowInner} />
                    </>
                )}
                
                {/* Inner screen with rounded borders */}
                <View style={[
                    styles.innerScreen,
                    isSelectionPage && styles.innerScreenLarge,
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
                </View>
            </View>

            {/* Bottom Navigation Buttons */}
            <View style={[styles.bottomButtonContainer, overlayMode && styles.darkenedButtons]}>
                <TouchableOpacity
                    style={[styles.bottomButton, styles.left, leftButtonDisabled && styles.disabled]}
                    onPress={!leftButtonDisabled ? onLeftButtonPress : undefined}
                >
                    <Image source={require('../../assets/images/button.png')} style={styles.buttonImage} />
                    <Text style={[styles.buttonText, leftButtonText === 'YES' && styles.yesButtonText]}>{leftButtonText}</Text>
                </TouchableOpacity>

                <TouchableOpacity
                    style={[styles.bottomButton, styles.center, centerButtonDisabled && styles.disabled]}
                    onPress={!centerButtonDisabled ? onCenterButtonPress : undefined}
                >
                    <Image source={require('../../assets/images/button.png')} style={styles.buttonImage} />
                    <Text style={styles.buttonText}>{centerButtonText}</Text>
                </TouchableOpacity>

                <TouchableOpacity
                    style={[styles.bottomButton, styles.right, rightButtonDisabled && styles.disabled]}
                    onPress={!rightButtonDisabled ? onRightButtonPress : undefined}
                >
                    <Image source={require('../../assets/images/button.png')} style={styles.buttonImage} />
                    <Text style={[styles.buttonText, rightButtonText === 'NO' && styles.noButtonText]}>{rightButtonText}</Text>
                </TouchableOpacity>
            </View>

            {/* Physical Device Buttons - overlaid on background image */}
            <TouchableOpacity
                style={[styles.deviceButton, styles.leftPhysical]}
                onPress={!leftButtonDisabled ? onLeftButtonPress : undefined}
            />
            <TouchableOpacity
                style={[styles.deviceButton, styles.centerPhysical]}
                onPress={!centerButtonDisabled ? onCenterButtonPress : undefined}
            />
            <TouchableOpacity
                style={[styles.deviceButton, styles.rightPhysical]}
                onPress={!rightButtonDisabled ? onRightButtonPress : undefined}
            />
        </View>
    );
};

const styles = StyleSheet.create({
    tamagotchiScreenContainer: {
        flex: 1,
        backgroundColor: 'black',
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
        borderRadius: 20, // More rounded corners
        overflow: 'hidden', // Clip background image to rounded corners
        position: 'relative',
        borderWidth: 4, // Thick border like the reference image
        borderColor: 'rgba(0, 0, 0, 0.3)', // Black border with opacity
        backgroundColor: '#E8F5E8', // Light green background matching dialog box
        // Add shadow for depth effect
        shadowColor: '#000',
        shadowOffset: {
            width: 0,
            height: 4,
        },
        shadowOpacity: 0.3,
        shadowRadius: 8,
        elevation: 8, // Android shadow
    },
    innerScreenLarge: {
        // Remove direct width/height since they're handled by shadowContainer
        // Keep only the margin adjustment
        marginTop: isTablet ? -10 : -20,
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


    // Gradient shadow system for depth effect - softer orange tint
    gradientShadowOuter: {
        position: 'absolute',
        top: -5,
        left: -5,
        right: -5,
        bottom: -5,
        borderRadius: 25, // Match inner screen radius + 5px
        backgroundColor: 'rgba(255, 140, 0, 0.15)', // Soft orange tint
        zIndex: 1,
        pointerEvents: 'none', // Don't intercept touch events
    },
    gradientShadowInner: {
        position: 'absolute',
        top: -2,
        left: -2,
        right: -2,
        bottom: -2,
        borderRadius: 22, // Match inner screen radius + 2px
        backgroundColor: 'rgba(255, 140, 0, 0.1)', // Softer orange tint
        zIndex: 2,
        pointerEvents: 'none', // Don't intercept touch events
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