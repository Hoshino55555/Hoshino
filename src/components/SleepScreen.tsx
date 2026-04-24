import React, { useEffect, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Animated, Easing } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import ZoomOutOverlay from './ZoomOutOverlay';

interface Props {
    onWake: () => void;
}

const SleepScreen: React.FC<Props> = ({ onWake }) => {
    const insets = useSafeAreaInsets();
    const [isClosing, setIsClosing] = useState(false);
    const zzzAnim = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        const loop = Animated.loop(
            Animated.sequence([
                Animated.timing(zzzAnim, {
                    toValue: 1,
                    duration: 1400,
                    easing: Easing.inOut(Easing.sin),
                    useNativeDriver: true,
                }),
                Animated.timing(zzzAnim, {
                    toValue: 0,
                    duration: 1400,
                    easing: Easing.inOut(Easing.sin),
                    useNativeDriver: true,
                }),
            ])
        );
        loop.start();
        return () => loop.stop();
    }, [zzzAnim]);

    const handleWake = () => {
        if (isClosing) return;
        setIsClosing(true);
    };

    const zzzOpacity = zzzAnim.interpolate({
        inputRange: [0, 1],
        outputRange: [0.35, 1],
    });
    const zzzTranslateY = zzzAnim.interpolate({
        inputRange: [0, 1],
        outputRange: [10, -6],
    });

    return (
        <ZoomOutOverlay
            exiting={isClosing}
            onExitComplete={onWake}
            backgroundColor="#0a0e1f"
        >
            <View style={[styles.topBar, { paddingTop: insets.top + 8 }]}>
                <TouchableOpacity
                    style={styles.topButton}
                    onPress={handleWake}
                    hitSlop={{ top: 12, right: 12, bottom: 12, left: 12 }}
                >
                    <Text style={styles.topButtonText}>{'<'} Wake</Text>
                </TouchableOpacity>
            </View>

            <View style={[styles.content, { paddingBottom: insets.bottom + 16 }]}>
                <Animated.Text
                    style={[
                        styles.zzz,
                        { opacity: zzzOpacity, transform: [{ translateY: zzzTranslateY }] },
                    ]}
                >
                    Zzz
                </Animated.Text>
                <Text style={styles.sleepingLabel}>Sleeping...</Text>

                <TouchableOpacity
                    style={styles.wakeButton}
                    onPress={handleWake}
                    hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
                >
                    <Text style={styles.wakeButtonText}>Wake Up</Text>
                </TouchableOpacity>
            </View>
        </ZoomOutOverlay>
    );
};

const styles = StyleSheet.create({
    topBar: {
        paddingHorizontal: 16,
        paddingBottom: 4,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'flex-start',
    },
    topButton: {
        paddingVertical: 6,
        paddingHorizontal: 10,
        backgroundColor: 'rgba(46, 90, 62, 0.85)',
        borderRadius: 6,
        borderWidth: 1,
        borderColor: '#E8F5E8',
    },
    topButtonText: {
        color: '#E8F5E8',
        fontFamily: 'PressStart2P',
        fontSize: 10,
    },
    content: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 10,
        paddingHorizontal: 8,
    },
    zzz: {
        fontSize: 72,
        color: '#b8c6ff',
        fontFamily: 'PressStart2P',
        marginBottom: 24,
    },
    sleepingLabel: {
        fontSize: 14,
        color: '#b8c6ff',
        fontFamily: 'PressStart2P',
        marginBottom: 48,
    },
    wakeButton: {
        paddingVertical: 14,
        paddingHorizontal: 32,
        backgroundColor: '#2E5A3E',
        borderRadius: 8,
        borderWidth: 2,
        borderColor: '#E8F5E8',
        alignSelf: 'center',
    },
    wakeButtonText: {
        color: '#E8F5E8',
        fontFamily: 'PressStart2P',
        fontSize: 14,
        textAlign: 'center',
    },
});

export default SleepScreen;
