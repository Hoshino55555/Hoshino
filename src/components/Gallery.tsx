import React, { useEffect, useRef, useState } from 'react';
import { View, StyleSheet, Animated, Easing, TouchableOpacity, Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useChromeConfig } from '../contexts/ChromeContext';
import Room from './Room';
import RoomEditor from './RoomEditor';
import { type RoomLayout, STARTER_ROOM_LAYOUT } from '../services/RoomLayout';

// Single shared room for the local-only MVP. Switch to per-character keying
// (`room:layout:${characterId}`) when the editor moves to a per-moonoko home.
const ROOM_LAYOUT_STORAGE_KEY = 'room:layout:default';

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
    // Editable room layout. Hydrate from AsyncStorage; fall back to the
    // hand-tuned starter mockup so first-time users see a furnished room.
    // `hydrated` gates the persistence effect — saving the placeholder layout
    // before the load resolves would clobber a real saved room.
    const [layout, setLayout] = useState<RoomLayout>(STARTER_ROOM_LAYOUT);
    const hydratedRef = useRef(false);

    useEffect(() => {
        AsyncStorage.getItem(ROOM_LAYOUT_STORAGE_KEY)
            .then((raw) => {
                if (raw) {
                    try {
                        const parsed = JSON.parse(raw);
                        if (Array.isArray(parsed)) setLayout(parsed);
                    } catch {
                        // Corrupt JSON falls through to STARTER_ROOM_LAYOUT.
                    }
                }
            })
            .finally(() => {
                hydratedRef.current = true;
            });
    }, []);

    useEffect(() => {
        if (!hydratedRef.current) return;
        AsyncStorage.setItem(ROOM_LAYOUT_STORAGE_KEY, JSON.stringify(layout)).catch((e) =>
            console.warn('room layout save failed', e),
        );
    }, [layout]);

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
            testID="gallery-screen"
        >
            <View style={StyleSheet.absoluteFill}>
                <Room layout={layout} />
            </View>
            {/* Editor overlay — its grid + palette only paint in edit mode,
                but the Edit/Done chip lives inside it always. Sit it above
                the back button so the chip can't slip behind the safe-area
                top bar on tall devices. */}
            <RoomEditor
                layout={layout}
                onChange={(next) => setLayout(next)}
                bottomInset={insets.bottom}
            />
            <View style={[styles.bottomBar, { paddingBottom: insets.bottom + 8 }]} pointerEvents="box-none">
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
    bottomBar: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        paddingHorizontal: 16,
        paddingTop: 4,
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
        fontFamily: 'Monaco',
        fontSize: 21,
    },
});

export default Gallery;
