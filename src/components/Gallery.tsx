import React, { useEffect, useRef, useState } from 'react';
import { View, StyleSheet, Animated, Easing, TouchableOpacity, Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useChromeConfig } from '../contexts/ChromeContext';
import Room from './Room';

interface Props {
    onBack: () => void;
    onCloseStart?: () => void;
}

// "Gallery" is the legacy file/route name; the page itself is the Room — a
// decoratable space the user fills with cosmetics. Filename kept so all the
// menu/navigation wiring stays put; rename in a polish pass once locked in.
//
// Rendered fullscreen (not inside InnerScreen) because the room artwork is
// authored with its own portrait frame at the device aspect ratio. Fitting
// it into the in-cavity 88x65% window cropped the painted wall and stretched
// proportions; edge-to-edge lets the artwork breathe and matches the mockup.
const Gallery: React.FC<Props> = ({ onBack, onCloseStart }) => {
    const insets = useSafeAreaInsets();
    const [isClosing, setIsClosing] = useState(false);
    const scale = useRef(new Animated.Value(0.6)).current;
    const opacity = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        Animated.parallel([
            Animated.spring(scale, {
                toValue: 1,
                tension: 22,
                friction: 5.5,
                useNativeDriver: true,
            }),
            Animated.timing(opacity, {
                toValue: 1,
                duration: 520,
                easing: Easing.out(Easing.quad),
                useNativeDriver: true,
            }),
        ]).start();
    }, [opacity, scale]);

    const handleClose = () => {
        if (isClosing) return;
        setIsClosing(true);
        onCloseStart?.();
        Animated.parallel([
            Animated.timing(scale, {
                toValue: 0.6,
                duration: 560,
                easing: Easing.in(Easing.back(1.8)),
                useNativeDriver: true,
            }),
            Animated.timing(opacity, {
                toValue: 0,
                duration: 500,
                easing: Easing.in(Easing.quad),
                useNativeDriver: true,
            }),
        ]).start(() => onBack());
    };

    // Standard back affordance for expanded views: the chrome's left
    // device button (the physical-looking one painted on the casing) wired
    // to close, no visible in-screen label. Matches Shop/Settings/Collection
    // — the X-in-corner was a one-off and broke that consistency.
    useChromeConfig({
        leftButtonText: '',
        centerButtonText: '',
        rightButtonText: '',
        leftButtonDisabled: false,
        centerButtonDisabled: false,
        rightButtonDisabled: false,
        onLeftButtonPress: handleClose,
        onCenterButtonPress: undefined,
        onRightButtonPress: undefined,
        overlayMode: false,
    });

    return (
        <Animated.View
            style={[
                StyleSheet.absoluteFill,
                styles.fullscreen,
                { opacity, transform: [{ scale }] },
            ]}
        >
            <View style={StyleSheet.absoluteFill}>
                <Room />
            </View>
            <View style={[styles.topBar, { paddingTop: insets.top + 8 }]} pointerEvents="box-none">
                <TouchableOpacity
                    style={styles.backButton}
                    onPress={handleClose}
                    hitSlop={{ top: 12, right: 12, bottom: 12, left: 12 }}
                >
                    <Text style={styles.backButtonText}>{'<'} Back</Text>
                </TouchableOpacity>
            </View>
        </Animated.View>
    );
};

const styles = StyleSheet.create({
    fullscreen: {
        backgroundColor: '#000',
    },
    topBar: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        paddingHorizontal: 16,
        paddingBottom: 4,
        flexDirection: 'row',
        alignItems: 'center',
    },
    backButton: {
        paddingVertical: 6,
        paddingHorizontal: 10,
        backgroundColor: 'rgba(46, 90, 62, 0.85)',
        borderRadius: 6,
        borderWidth: 1,
        borderColor: '#E8F5E8',
    },
    backButtonText: {
        color: '#E8F5E8',
        fontFamily: 'PressStart2P',
        fontSize: 10,
    },
});

export default Gallery;
