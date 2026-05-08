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
import LinearGradient from 'react-native-linear-gradient';

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
    success: { accent: '#7ce0a4', accentSoft: 'rgba(124, 224, 164, 0.22)', glyph: '+' },
    info:    { accent: '#8be2ff', accentSoft: 'rgba(139, 226, 255, 0.20)', glyph: 'i' },
    warning: { accent: '#ffd27c', accentSoft: 'rgba(255, 210, 124, 0.22)', glyph: '!' },
    error:   { accent: '#ff8a8a', accentSoft: 'rgba(255, 138, 138, 0.22)', glyph: 'x' },
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

export const DeploymentStatusBanner: React.FC<{
    isVisible: boolean;
    status: string;
    onDismiss: () => void;
}> = ({ isVisible, status, onDismiss }) => {
    if (!isVisible) return null;

    const getStatusInfo = (status: string) => {
        if (status.includes('Custom programs deployed')) {
            return {
                type: 'success' as const,
                icon: '🚀',
                title: 'Enhanced Mode Active',
                description: 'Custom Solana programs deployed - All features optimized!',
            };
        } else if (status.includes('enhanced fallback')) {
            return {
                type: 'info' as const,
                icon: '⏳',
                title: 'Enhanced Fallback Mode',
                description: 'All features working perfectly with programmable NFTs',
            };
        } else {
            return {
                type: 'warning' as const,
                icon: '❓',
                title: 'Status Unknown',
                description: 'Game should work normally',
            };
        }
    };

    const statusInfo = getStatusInfo(status);

    return (
        <LinearGradient
            colors={['#9333ea', '#2563eb']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.bannerContainer}
        >
            <View style={styles.bannerRow}>
                <View style={styles.bannerContentRow}>
                    <Text style={styles.bannerIcon}>{statusInfo.icon}</Text>
                    <View>
                        <Text style={styles.bannerTitle}>{statusInfo.title}</Text>
                        <Text style={styles.bannerDescription}>{statusInfo.description}</Text>
                        {statusInfo.type === 'info' && (
                            <Text style={styles.bannerTip}>
                                💡 Custom programs can be deployed later for enhanced features
                            </Text>
                        )}
                    </View>
                </View>
                <TouchableOpacity onPress={onDismiss} style={styles.bannerCloseButton}>
                    <Text style={styles.bannerCloseText}>✕</Text>
                </TouchableOpacity>
            </View>
        </LinearGradient>
    );
};

const styles = StyleSheet.create({
    container: {
        position: 'absolute',
        left: 12,
        right: 12,
        zIndex: 9999,
        backgroundColor: '#101a2c',
        borderWidth: 2,
        borderRadius: 6,
        overflow: 'hidden',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.35,
        shadowRadius: 10,
        elevation: 6,
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
        fontFamily: 'Monaco',
        fontSize: 15,
        lineHeight: 13,
    },
    messageWrap: {
        flex: 1,
    },
    message: {
        color: '#f0f7ff',
        fontFamily: 'Monaco',
        fontSize: 13,
        lineHeight: 14,
    },
    statusText: {
        marginTop: 4,
        color: '#9bb4c7',
        fontFamily: 'Monaco',
        fontSize: 14,
    },
    closeButton: {
        marginLeft: 6,
        paddingHorizontal: 8,
        paddingVertical: 4,
    },
    closeText: {
        color: '#9bb4c7',
        fontSize: 18,
        lineHeight: 18,
        fontFamily: 'Monaco',
    },
    bannerContainer: {
        position: 'absolute',
        bottom: 4,
        left: 4,
        right: 4,
        zIndex: 40,
        borderRadius: 8,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.25,
        shadowRadius: 4,
        elevation: 5,
        padding: 16,
    },
    bannerRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    bannerContentRow: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    bannerIcon: {
        fontSize: 24,
        marginRight: 12,
    },
    bannerTitle: {
        fontSize: 18,
        color: 'white',
        fontFamily: 'Monaco',
    },
    bannerDescription: {
        fontSize: 14,
        color: 'white',
        opacity: 0.9,
    },
    bannerTip: {
        fontSize: 12,
        marginTop: 4,
        color: 'white',
        opacity: 0.75,
    },
    bannerCloseButton: {
        backgroundColor: 'rgba(255,255,255,0.2)',
        borderRadius: 999,
        padding: 8,
    },
    bannerCloseText: {
        color: 'white',
        fontSize: 16,
    },
});

export default Notification;
