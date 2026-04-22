import React, { useRef, useEffect, useMemo, useState } from 'react';
import {
    View,
    Text,
    StyleSheet,
    Animated,
    TouchableWithoutFeedback,
    TouchableOpacity,
    Dimensions,
} from 'react-native';

// import StarfieldBackground from './StarfieldBackground';

const { width, height } = Dimensions.get('window');

interface Props {
    visible: boolean;
    onDismiss?: () => void;
    remainingMs?: number;
}

const formatRemaining = (ms: number) => {
    if (ms <= 0) return 'READY';
    const totalSec = Math.ceil(ms / 1000);
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = totalSec % 60;
    return `${h.toString().padStart(2, '0')}:${m
        .toString()
        .padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
};

const SleepOverlay: React.FC<Props> = ({ visible, onDismiss, remainingMs = 0 }) => {
    const fadeAnim = useRef(new Animated.Value(0)).current;
    const starTwinkleAnim = useRef(new Animated.Value(0)).current;
    const bubbleFloatAnim = useRef(new Animated.Value(0)).current;
    const clockAnim = useRef(new Animated.Value(0)).current;
    const pixelMoonAnim = useRef(new Animated.Value(0)).current;
    const zzzAnim = useRef(new Animated.Value(0)).current;

    const [buttonScale] = useState(new Animated.Value(1));
    const [dismissing, setDismissing] = useState(false);

    // Generate random pixel stars - more of them!
    const pixelStars = useMemo(
        () =>
            [...Array(40)].map((_, i) => ({
                left: Math.random() * (width - 20),
                top: Math.random() * (height * 0.8),
                size: Math.random() > 0.7 ? 'large' : 'small',
                shape: Math.random() > 0.5 ? 'square' : 'plus',
                animationDelay: i * 200,
            })),
        []
    );

    // Generate floating bubbles/orbs
    const floatingBubbles = useMemo(
        () =>
            [...Array(8)].map((_, i) => ({
                left: Math.random() * (width - 40),
                top: height * 0.3 + Math.random() * (height * 0.4),
                size: Math.random() * 15 + 20,
                delay: i * 800,
            })),
        []
    );

    useEffect(() => {
        if (visible) {
            setDismissing(false);
            // Main fade in
            Animated.timing(fadeAnim, {
                toValue: 1,
                duration: 1000,
                useNativeDriver: true,
            }).start();

            // Star twinkling with staggered timing
            Animated.loop(
                Animated.sequence([
                    Animated.timing(starTwinkleAnim, {
                        toValue: 1,
                        duration: 1500,
                        useNativeDriver: true,
                    }),
                    Animated.timing(starTwinkleAnim, {
                        toValue: 0,
                        duration: 1500,
                        useNativeDriver: true,
                    }),
                ])
            ).start();

            // Bubble floating animation
            Animated.loop(
                Animated.sequence([
                    Animated.timing(bubbleFloatAnim, {
                        toValue: 1,
                        duration: 4000,
                        useNativeDriver: true,
                    }),
                    Animated.timing(bubbleFloatAnim, {
                        toValue: 0,
                        duration: 4000,
                        useNativeDriver: true,
                    }),
                ])
            ).start();

            // Clock pulse
            Animated.loop(
                Animated.sequence([
                    Animated.timing(clockAnim, {
                        toValue: 1,
                        duration: 2000,
                        useNativeDriver: true,
                    }),
                    Animated.timing(clockAnim, {
                        toValue: 0,
                        duration: 2000,
                        useNativeDriver: true,
                    }),
                ])
            ).start();

            // Pixel moon gentle sway
            Animated.loop(
                Animated.sequence([
                    Animated.timing(pixelMoonAnim, {
                        toValue: 1,
                        duration: 3500,
                        useNativeDriver: true,
                    }),
                    Animated.timing(pixelMoonAnim, {
                        toValue: 0,
                        duration: 3500,
                        useNativeDriver: true,
                    }),
                ])
            ).start();

            // ZZZ floating animation
            Animated.loop(
                Animated.sequence([
                    Animated.timing(zzzAnim, {
                        toValue: 1,
                        duration: 2500,
                        useNativeDriver: true,
                    }),
                    Animated.timing(zzzAnim, {
                        toValue: 0,
                        duration: 2500,
                        useNativeDriver: true,
                    }),
                ])
            ).start();
        } else {
            setDismissing(false);
            Animated.timing(fadeAnim, {
                toValue: 0,
                duration: 600,
                useNativeDriver: true,
            }).start();
        }
    }, [visible]);

    const handleDismiss = () => {
        if (dismissing) return;
        setDismissing(true);
        Animated.timing(fadeAnim, {
            toValue: 0,
            duration: 600,
            useNativeDriver: true,
        }).start();
        onDismiss?.();
    };

    const handleButtonPress = () => {
        Animated.sequence([
            Animated.timing(buttonScale, {
                toValue: 0.95,
                duration: 100,
                useNativeDriver: true,
            }),
            Animated.timing(buttonScale, {
                toValue: 1,
                duration: 100,
                useNativeDriver: true,
            }),
        ]).start();
        handleDismiss();
    };

    const getCurrentTime = () => {
        const now = new Date();
        return now.toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit',
            hour12: true
        });
    };

    if (!visible || dismissing) {
        return null;
    }

    return (
        <Animated.View
            pointerEvents={dismissing ? 'none' : 'auto'}
            style={[
                styles.overlay,
                {
                    opacity: fadeAnim,
                },
            ]}
        >
            <TouchableWithoutFeedback onPress={handleDismiss}>
                <View style={styles.container}>
                    {/* Animated Starfield Background */}
                    {/* <StarfieldBackground intensity="medium" animate={true} /> */}

                    {/* Semi-transparent black overlay for night mode */}
                    <Animated.View
                        style={[
                            styles.blackOverlay,
                            {
                                opacity: fadeAnim.interpolate({
                                    inputRange: [0, 1],
                                    outputRange: [0, 0.7],
                                }),
                            },
                        ]}
                    />

                    {/* Pixel stars */}
                    {pixelStars.map((star, index) => (
                        <Animated.View
                            key={`star-${index}`}
                            style={[
                                styles.pixelStar,
                                star.size === 'large' ? styles.pixelStarLarge : styles.pixelStarSmall,
                                {
                                    left: star.left,
                                    top: star.top,
                                    opacity: starTwinkleAnim.interpolate({
                                        inputRange: [0, 0.5, 1],
                                        outputRange: [0.5, 1, 0.5],
                                    }),
                                },
                            ]}
                        />
                    ))}

                    {/* Floating dreamy bubbles */}
                    {floatingBubbles.map((bubble, index) => (
                        <Animated.View
                            key={`bubble-${index}`}
                            style={[
                                styles.dreamBubble,
                                {
                                    left: bubble.left,
                                    top: bubble.top,
                                    width: bubble.size,
                                    height: bubble.size,
                                    opacity: bubbleFloatAnim.interpolate({
                                        inputRange: [0, 0.5, 1],
                                        outputRange: [0.1, 0.3, 0.1],
                                    }),
                                    transform: [
                                        {
                                            translateY: bubbleFloatAnim.interpolate({
                                                inputRange: [0, 1],
                                                outputRange: [0, -30],
                                            }),
                                        },
                                    ],
                                },
                            ]}
                        />
                    ))}

                    {/* Pixel crescent moon */}
                    <Animated.View
                        style={[
                            styles.pixelMoon,
                            {
                                transform: [
                                    {
                                        rotate: pixelMoonAnim.interpolate({
                                            inputRange: [0, 1],
                                            outputRange: ['0deg', '3deg'],
                                        }),
                                    },
                                ],
                            },
                        ]}
                    >
                        <View style={styles.moonCrescent}>
                            <View style={styles.moonOuter} />
                            <View style={styles.moonInner} />
                        </View>
                    </Animated.View>

                    {/* Game Boy Style Header */}
                    <View style={styles.gameHeaderContainer}>
                        <View style={styles.gameHeader}>
                            <Text style={styles.gameTitle}>DiuJ..SsWE</Text>
                        </View>
                    </View>

                    {/* Main sleep UI container */}
                    <View style={styles.sleepUIContainer}>
                        {/* Time display with pixel styling */}
                        <Animated.View
                            style={[
                                styles.timeDisplay,
                                {
                                    transform: [
                                        {
                                            scale: clockAnim.interpolate({
                                                inputRange: [0, 1],
                                                outputRange: [1, 1.01],
                                            }),
                                        },
                                    ],
                                },
                            ]}
                        >
                            <Text style={styles.timeText}>{getCurrentTime()}</Text>
                            <View style={styles.pixelUnderline} />
                            <Text style={styles.trackingText}>
                                {remainingMs > 0
                                    ? `RESTING • ${formatRemaining(remainingMs)} TO FULL`
                                    : '• • • FULLY RESTED • • •'}
                            </Text>
                        </Animated.View>

                        {/* Pixel Art Sleep Box */}
                        <View style={styles.sleepBoxContainer}>
                            {/* Outer pixel border */}
                            <View style={styles.pixelBorderOuter}>
                                {/* Inner content area */}
                                <View style={styles.sleepBoxInner}>
                                    {/* ZZZ Label */}
                                    <Animated.Text
                                        style={[
                                            styles.zzzLabel,
                                            {
                                                opacity: zzzAnim.interpolate({
                                                    inputRange: [0, 0.5, 1],
                                                    outputRange: [0.7, 1, 0.7],
                                                }),
                                                transform: [
                                                    {
                                                        translateY: zzzAnim.interpolate({
                                                            inputRange: [0, 1],
                                                            outputRange: [0, -3],
                                                        }),
                                                    },
                                                ],
                                            },
                                        ]}
                                    >
                                        Zzz
                                    </Animated.Text>

                                    {/* Emoji display area */}
                                    <View style={styles.emojiContainer}>
                                        <View style={styles.emojiInnerBorder}>
                                            <Animated.Text
                                                style={[
                                                    styles.sleepingEmoji,
                                                    {
                                                        transform: [
                                                            {
                                                                scale: clockAnim.interpolate({
                                                                    inputRange: [0, 0.5, 1],
                                                                    outputRange: [1, 1.05, 1],
                                                                }),
                                                            },
                                                        ],
                                                    },
                                                ]}
                                            >
                                                😴
                                            </Animated.Text>
                                        </View>
                                    </View>
                                </View>
                            </View>
                        </View>

                        {/* Pixel Art End Sleep Button */}
                        <Animated.View
                            style={[
                                {
                                    opacity: fadeAnim.interpolate({
                                        inputRange: [0, 0.7, 1],
                                        outputRange: [0, 0, 1],
                                    }),
                                    transform: [{ scale: buttonScale }],
                                },
                            ]}
                        >
                            <TouchableOpacity
                                style={styles.pixelButton}
                                onPress={handleButtonPress}
                                activeOpacity={0.8}
                            >
                                <View style={styles.pixelButtonInner}>
                                    <Text style={styles.pixelButtonText}>Wake{'\n'}Up</Text>
                                </View>
                            </TouchableOpacity>
                        </Animated.View>
                    </View>
                </View>
            </TouchableWithoutFeedback>
        </Animated.View>
    );
};

const styles = StyleSheet.create({
    overlay: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 1000,
    },
    container: {
        flex: 1,
        position: 'relative',
        backgroundColor: '#4c1d95', // Deep purple background
    },
    blackOverlay: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(15, 23, 42, 0.8)', // Dark navy overlay
    },
    pixelStar: {
        position: 'absolute',
        backgroundColor: '#fbbf24',
        borderRadius: 0, // Sharp pixel edges
    },
    pixelStarLarge: {
        width: 6,
        height: 6,
    },
    pixelStarSmall: {
        width: 3,
        height: 3,
    },
    dreamBubble: {
        position: 'absolute',
        backgroundColor: 'rgba(124, 58, 237, 0.1)',
        borderRadius: 0, // Make it square for pixel effect
        borderWidth: 1,
        borderColor: 'rgba(124, 58, 237, 0.2)',
    },
    pixelMoon: {
        position: 'absolute',
        top: height * 0.08,
        right: width * 0.08,
        width: 40,
        height: 40,
        backgroundColor: 'transparent',
        borderRadius: 0,
    },
    moonCrescent: {
        position: 'relative',
        width: 40,
        height: 40,
    },
    moonOuter: {
        width: 40,
        height: 40,
        backgroundColor: '#fbbf24',
        borderRadius: 0,
    },
    moonInner: {
        position: 'absolute',
        top: 6,
        left: 12,
        width: 26,
        height: 26,
        backgroundColor: '#4c1d95', // Same as background to "cut out" the crescent
        borderRadius: 0,
    },
    // Game Boy style header
    gameHeaderContainer: {
        position: 'absolute',
        top: 40,
        right: 20,
        zIndex: 10,
    },
    gameHeader: {
        backgroundColor: '#a1a1aa',
        borderRadius: 0,
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderWidth: 2,
        borderTopColor: '#e4e4e7',
        borderLeftColor: '#e4e4e7',
        borderBottomColor: '#71717a',
        borderRightColor: '#71717a',
    },
    gameTitle: {
        fontSize: 10,
        fontFamily: 'PressStart2P',
        fontWeight: 'bold',
        color: '#1f2937',
        letterSpacing: 1,
    },
    sleepUIContainer: {
        flex: 1,
        paddingHorizontal: 20,
        paddingVertical: 60,
        alignItems: 'center',
        justifyContent: 'space-around',
    },
    timeDisplay: {
        alignItems: 'center',
        marginTop: 20,
    },
    timeText: {
        fontSize: 28,
        fontFamily: 'PressStart2P', // Use pixel font here - you'd replace with 'PressStart2P' or similar
        fontWeight: 'bold',
        color: '#ffffff',
        letterSpacing: 3,
        textShadowColor: '#000000',
        textShadowOffset: { width: 2, height: 2 },
        textShadowRadius: 0, // Sharp pixel shadow
    },
    pixelUnderline: {
        width: 180,
        height: 2,
        backgroundColor: '#ffffff',
        marginVertical: 8,
        borderRadius: 0,
    },
    trackingText: {
        fontSize: 12,
        color: '#fbbf24',
        fontFamily: 'PressStart2P',
        fontWeight: 'bold',
        letterSpacing: 2,
        textShadowColor: '#000000',
        textShadowOffset: { width: 1, height: 1 },
        textShadowRadius: 0,
    },
    // Pixel Art Sleep Box
    sleepBoxContainer: {
        alignItems: 'center',
        justifyContent: 'center',
    },
    pixelBorderOuter: {
        width: 200,
        height: 160,
        backgroundColor: 'transparent',
        borderWidth: 3,
        borderTopColor: '#e4e4e7',
        borderLeftColor: '#e4e4e7',
        borderBottomColor: '#71717a',
        borderRightColor: '#71717a',
        borderRadius: 0,
        padding: 3,
    },
    sleepBoxInner: {
        flex: 1,
        backgroundColor: 'transparent',
        alignItems: 'center',
        justifyContent: 'center',
        position: 'relative',
    },
    zzzLabel: {
        position: 'absolute',
        top: 8,
        right: 15,
        fontSize: 14,
        fontFamily: 'PressStart2P',
        fontWeight: 'bold',
        color: '#fbbf24',
        letterSpacing: 1,
        textShadowColor: '#000000',
        textShadowOffset: { width: 1, height: 1 },
        textShadowRadius: 0,
    },
    emojiContainer: {
        width: 120,
        height: 80,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#312e81',
        borderRadius: 0,
    },
    emojiInnerBorder: {
        width: 110,
        height: 70,
        backgroundColor: '#1e1b4b',
        borderRadius: 0,
        borderWidth: 2,
        borderTopColor: '#1e1b4b',
        borderLeftColor: '#1e1b4b',
        borderBottomColor: '#4c1d95',
        borderRightColor: '#4c1d95',
        alignItems: 'center',
        justifyContent: 'center',
    },
    sleepingEmoji: {
        fontSize: 32,
    },
    // Pixel Art Button
    pixelButton: {
        backgroundColor: 'transparent',
        alignItems: 'center',
        justifyContent: 'center',
    },
    pixelButtonInner: {
        backgroundColor: '#4338ca',
        borderWidth: 3,
        borderTopColor: '#a5b4fc',
        borderLeftColor: '#a5b4fc',
        borderBottomColor: '#312e81',
        borderRightColor: '#312e81',
        borderRadius: 0,
        paddingVertical: 16,
        paddingHorizontal: 32,
        alignItems: 'center',
        justifyContent: 'center',
        // Add inner shadow effect
        shadowColor: '#000',
        shadowOffset: { width: 2, height: 2 },
        shadowOpacity: 0.8,
        shadowRadius: 0,
        elevation: 0,
    },
    pixelButtonText: {
        fontSize: 14,
        fontFamily: 'PressStart2P',
        fontWeight: 'bold',
        color: '#ffffff',
        textAlign: 'center',
        lineHeight: 18,
        letterSpacing: 1,
        textShadowColor: '#000000',
        textShadowOffset: { width: 1, height: 1 },
        textShadowRadius: 0,
    },
});

export default SleepOverlay;