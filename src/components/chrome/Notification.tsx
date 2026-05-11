import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
    View,
    Text,
    TouchableOpacity,
    StyleSheet,
    Animated,
    Easing,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Z } from '../../styles/zLayers';
import { colors, fonts } from '../../styles/tokens';

// File-local palette — toast tones (success/info/warning/error) plus the
// shared deep-navy panel & ice-text the toasts use. These are notification
// specific and don't recur elsewhere, so they stay grouped here.
const PALETTE = {
    successAccent: '#7ce0a4',
    successSoft: 'rgba(124, 224, 164, 0.22)',
    infoAccent: '#8be2ff',
    infoSoft: 'rgba(139, 226, 255, 0.20)',
    warningAccent: '#ffd27c',
    warningSoft: 'rgba(255, 210, 124, 0.22)',
    errorAccent: '#ff8a8a',
    errorSoft: 'rgba(255, 138, 138, 0.22)',
    panelBg: '#101a2c',
    bodyText: '#f0f7ff',
    metaText: '#9bb4c7',
} as const;

interface NotificationProps {
    message: string;
    type: 'success' | 'warning' | 'info' | 'error';
    onClose: () => void;
    autoClose?: boolean;
    deploymentStatus?: string;
    /** Stacking index — each notification offsets vertically by this * (height + gap). */
    index?: number;
}

// Vertical buffer below the safe-area top to clear the in-game header (username
// + crescent moon currently sit there). Tuned by eye against /tmp/hoshino_main
// screenshots — anything less and the toast clipped the username row.
const TOP_OFFSET = 80;
const STACK_GAP = 8;
const APPROX_ROW_HEIGHT = 56;
const SLIDE_DISTANCE = 140;

type ToneStyle = {
    accent: string;
    accentSoft: string;
    glyph: string;
};

const TONES: Record<NotificationProps['type'], ToneStyle> = {
    success: { accent: PALETTE.successAccent, accentSoft: PALETTE.successSoft, glyph: '+' },
    info:    { accent: PALETTE.infoAccent,    accentSoft: PALETTE.infoSoft,    glyph: 'i' },
    warning: { accent: PALETTE.warningAccent, accentSoft: PALETTE.warningSoft, glyph: '!' },
    error:   { accent: PALETTE.errorAccent,   accentSoft: PALETTE.errorSoft,   glyph: 'x' },
};

const Notification: React.FC<NotificationProps> = ({
    message,
    type,
    onClose,
    autoClose = true,
    deploymentStatus,
    index = 0,
}) => {
    const insets = useSafeAreaInsets();
    const translateY = useRef(new Animated.Value(-SLIDE_DISTANCE)).current;
    const opacity = useRef(new Animated.Value(0)).current;
    const closingRef = useRef(false);

    const tone = TONES[type] ?? TONES.info;

    const slideOut = useCallback(() => {
        if (closingRef.current) return;
        closingRef.current = true;
        Animated.parallel([
            Animated.timing(translateY, {
                toValue: -SLIDE_DISTANCE,
                duration: 220,
                easing: Easing.in(Easing.cubic),
                useNativeDriver: true,
            }),
            Animated.timing(opacity, {
                toValue: 0,
                duration: 200,
                easing: Easing.in(Easing.cubic),
                useNativeDriver: true,
            }),
        ]).start(() => onClose());
    }, [onClose, opacity, translateY]);

    useEffect(() => {
        Animated.parallel([
            Animated.timing(translateY, {
                toValue: 0,
                duration: 280,
                easing: Easing.out(Easing.cubic),
                useNativeDriver: true,
            }),
            Animated.timing(opacity, {
                toValue: 1,
                duration: 260,
                easing: Easing.out(Easing.cubic),
                useNativeDriver: true,
            }),
        ]).start();
    }, [opacity, translateY]);

    useEffect(() => {
        if (!autoClose) return;
        const timer = setTimeout(slideOut, 2500);
        return () => clearTimeout(timer);
    }, [autoClose, slideOut]);

    const top = insets.top + TOP_OFFSET + index * (APPROX_ROW_HEIGHT + STACK_GAP);

    return (
        <Animated.View
            style={[
                styles.container,
                { top, transform: [{ translateY }], opacity, borderColor: tone.accent },
            ]}
            pointerEvents="box-none"
        >
            <View style={[styles.accentStripe, { backgroundColor: tone.accent }]} />
            <View style={styles.body}>
                <View style={[styles.glyphBadge, { backgroundColor: tone.accentSoft, borderColor: tone.accent }]}>
                    <Text style={[styles.glyphText, { color: tone.accent }]}>{tone.glyph}</Text>
                </View>
                <View style={styles.messageWrap}>
                    <Text style={styles.message} numberOfLines={3}>
                        {message}
                    </Text>
                    {deploymentStatus ? (
                        <Text style={styles.statusText} numberOfLines={2}>
                            {deploymentStatus}
                        </Text>
                    ) : null}
                </View>
                <TouchableOpacity
                    onPress={slideOut}
                    hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
                    style={styles.closeButton}
                >
                    <Text style={styles.closeText}>×</Text>
                </TouchableOpacity>
            </View>
        </Animated.View>
    );
};

const styles = StyleSheet.create({
    container: {
        position: 'absolute',
        left: 12,
        right: 12,
        zIndex: Z.notification,
        elevation: Z.notification,
        backgroundColor: PALETTE.panelBg,
        borderWidth: 2,
        borderRadius: 6,
        overflow: 'hidden',
        shadowColor: colors.black,
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.35,
        shadowRadius: 10,
    },
    accentStripe: {
        position: 'absolute',
        left: 0,
        top: 0,
        bottom: 0,
        width: 4,
    },
    body: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 10,
        paddingLeft: 14,
        paddingRight: 8,
    },
    glyphBadge: {
        width: 28,
        height: 28,
        borderRadius: 4,
        borderWidth: 1.5,
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 10,
    },
    glyphText: {
        fontFamily: fonts.body,
        fontSize: 24,
        lineHeight: 13,
    },
    messageWrap: {
        flex: 1,
    },
    message: {
        color: PALETTE.bodyText,
        fontFamily: fonts.body,
        fontSize: 20,
        lineHeight: 14,
    },
    statusText: {
        marginTop: 4,
        color: PALETTE.metaText,
        fontFamily: fonts.body,
        fontSize: 21,
    },
    closeButton: {
        marginLeft: 6,
        paddingHorizontal: 8,
        paddingVertical: 4,
    },
    closeText: {
        color: PALETTE.metaText,
        fontSize: 24,
        lineHeight: 18,
        fontFamily: fonts.body,
    },
});

export default Notification;
