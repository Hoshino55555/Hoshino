import React, { useEffect, useRef, useState } from 'react';
import {
    View,
    Text,
    Image,
    Modal,
    StyleSheet,
    TouchableOpacity,
    Animated,
    Easing,
    ScrollView,
    useWindowDimensions,
} from 'react-native';
import { getCharacterSleep, Backgrounds, getIngredientArt } from '../../assets';
import type { ForagedItem } from '../../services/GameStateService';
import { colors } from '../../styles/tokens';

export interface MorningRecapDeltas {
    energyGained: number;
    moodGained: number;
    xpGained: number;
    totalSleeps: number;
}

interface Props {
    visible: boolean;
    characterId: string | null | undefined;
    // Omitted on the cold-launch path where we don't have a pre-sleep snapshot
    // to diff against — the modal then renders only the greeting + items.
    deltas?: MorningRecapDeltas;
    overnightItems: ForagedItem[];
    playerName?: string;
    onDismiss: () => void;
}

const ROW_STAGGER_MS = 350;
const COUNT_UP_MS = 600;

interface TallyRowProps {
    label: string;
    target: number;
    prefix?: string;
    delay: number;
}

const TallyRow: React.FC<TallyRowProps> = ({ label, target, prefix = '+', delay }) => {
    const [shown, setShown] = useState(0);
    const opacity = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        const fade = setTimeout(() => {
            Animated.timing(opacity, {
                toValue: 1,
                duration: 180,
                useNativeDriver: true,
            }).start();
        }, delay);

        if (target <= 0) {
            return () => clearTimeout(fade);
        }

        // Linear count-up driven by setInterval — small target counts (≤25),
        // so a JS-driver tween would be overkill. ~20ms/step keeps it readable.
        const start = Date.now() + delay;
        const tick = setInterval(() => {
            const elapsed = Date.now() - start;
            if (elapsed < 0) return;
            const t = Math.min(1, elapsed / COUNT_UP_MS);
            const v = Math.round(target * t);
            setShown(v);
            if (t >= 1) clearInterval(tick);
        }, 20);

        return () => {
            clearTimeout(fade);
            clearInterval(tick);
        };
    }, [target, delay]);

    return (
        <Animated.View style={[styles.tallyRow, { opacity }]}>
            <Text style={styles.tallyLabel}>{label}</Text>
            <Text style={styles.tallyValue}>
                {target > 0 ? `${prefix}${shown}` : '—'}
            </Text>
        </Animated.View>
    );
};

const aggregate = (items: ForagedItem[]): { ingredient: string; count: number }[] => {
    const counts = new Map<string, number>();
    for (const it of items) {
        counts.set(it.ingredient, (counts.get(it.ingredient) || 0) + 1);
    }
    return Array.from(counts.entries())
        .map(([ingredient, count]) => ({ ingredient, count }))
        .sort((a, b) => b.count - a.count);
};

const MorningRecapModal: React.FC<Props> = ({
    visible,
    characterId,
    deltas,
    overnightItems,
    playerName,
    onDismiss,
}) => {
    const { width } = useWindowDimensions();
    const panelWidth = width * 0.85;
    const fadeAnim = useRef(new Animated.Value(0)).current;
    const bobAnim = useRef(new Animated.Value(0)).current;
    const [itemsVisible, setItemsVisible] = useState(false);

    useEffect(() => {
        if (!visible) {
            fadeAnim.setValue(0);
            setItemsVisible(false);
            return;
        }
        Animated.timing(fadeAnim, {
            toValue: 1,
            duration: 280,
            useNativeDriver: true,
        }).start();

        // Cold-launch path skips the tally so the items reveal can fire as soon
        // as the modal fades in.
        const tallyTotalMs = deltas ? ROW_STAGGER_MS * 4 + COUNT_UP_MS : 280;
        const itemsTimer = setTimeout(() => setItemsVisible(true), tallyTotalMs);

        const loop = Animated.loop(
            Animated.sequence([
                Animated.timing(bobAnim, {
                    toValue: 1,
                    duration: 1400,
                    easing: Easing.inOut(Easing.sin),
                    useNativeDriver: true,
                }),
                Animated.timing(bobAnim, {
                    toValue: 0,
                    duration: 1400,
                    easing: Easing.inOut(Easing.sin),
                    useNativeDriver: true,
                }),
            ])
        );
        loop.start();
        return () => {
            clearTimeout(itemsTimer);
            loop.stop();
        };
    }, [visible, deltas]);

    if (!visible) return null;

    const aggregated = aggregate(overnightItems);
    const bob = bobAnim.interpolate({ inputRange: [0, 1], outputRange: [0, -6] });

    return (
        <Modal transparent visible={visible} animationType="none" onRequestClose={onDismiss}>
            <Animated.View style={[styles.overlay, { opacity: fadeAnim }]}>
                <ScrollView
                    contentContainerStyle={styles.scrollContent}
                    showsVerticalScrollIndicator={false}
                >
                    <View style={[styles.heroPanel, { width: panelWidth }]}>
                        <Image
                            source={Backgrounds.sleep}
                            style={styles.heroBg}
                            resizeMode="cover"
                        />
                        <Animated.View style={{ transform: [{ translateY: bob }] }}>
                            <Image
                                source={getCharacterSleep(characterId)}
                                style={styles.heroChar}
                                resizeMode="contain"
                            />
                        </Animated.View>
                        <Text style={styles.heroTitle}>
                            {playerName && playerName.trim().length > 0
                                ? `GOOD MORNING, ${playerName.trim().toUpperCase()}`
                                : 'GOOD MORNING'}
                        </Text>
                    </View>

                    {deltas && (
                        <View style={[styles.window, { width: panelWidth }]}>
                            <View style={styles.windowHeader}>
                                <Text style={styles.windowHeaderText}>Sleep Recap</Text>
                            </View>
                            <View style={styles.windowBody}>
                                <TallyRow
                                    label="Energy"
                                    target={deltas.energyGained}
                                    delay={0}
                                />
                                <TallyRow
                                    label="Mood"
                                    target={deltas.moodGained}
                                    delay={ROW_STAGGER_MS}
                                />
                                <TallyRow
                                    label="XP"
                                    target={deltas.xpGained}
                                    delay={ROW_STAGGER_MS * 2}
                                />
                                <TallyRow
                                    label="Total Sleeps"
                                    target={deltas.totalSleeps}
                                    prefix=""
                                    delay={ROW_STAGGER_MS * 3}
                                />
                            </View>
                        </View>
                    )}

                    {itemsVisible && aggregated.length > 0 && (
                        <View style={[styles.window, { width: panelWidth }]}>
                            <View style={styles.windowHeader}>
                                <Text style={styles.windowHeaderText}>While You Slept</Text>
                            </View>
                            <View style={[styles.windowBody, styles.itemsBody]}>
                                {aggregated.map(({ ingredient, count }) => (
                                    <View key={ingredient} style={styles.itemRow}>
                                        <Image
                                            source={getIngredientArt(ingredient)}
                                            style={styles.itemSprite}
                                            resizeMode="contain"
                                        />
                                        <Text style={styles.itemLabel}>
                                            {ingredient}
                                        </Text>
                                        <Text style={styles.itemCount}>×{count}</Text>
                                    </View>
                                ))}
                            </View>
                        </View>
                    )}

                    <TouchableOpacity
                        style={styles.dismissButton}
                        onPress={onDismiss}
                        activeOpacity={0.85}
                    >
                        <Text style={styles.dismissText}>Good morning</Text>
                    </TouchableOpacity>
                </ScrollView>
            </Animated.View>
        </Modal>
    );
};

const PIXEL_SHADOW = {
    shadowColor: colors.black,
    shadowOffset: { width: 3, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 0,
    elevation: 8,
} as const;

const styles = StyleSheet.create({
    overlay: {
        flex: 1,
        backgroundColor: 'rgba(10, 5, 35, 0.92)',
    },
    scrollContent: {
        flexGrow: 1,
        paddingTop: 60,
        paddingBottom: 40,
        paddingHorizontal: 20,
        alignItems: 'center',
    },
    heroPanel: {
        height: 220,
        borderWidth: 3,
        borderColor: colors.black,
        borderRadius: 4,
        overflow: 'hidden',
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 20,
        ...PIXEL_SHADOW,
    },
    heroBg: {
        ...StyleSheet.absoluteFillObject,
    },
    heroChar: {
        width: 140,
        height: 140,
    },
    heroTitle: {
        position: 'absolute',
        top: 12,
        fontFamily: 'PressStart2P',
        fontSize: 14,
        color: colors.white,
        letterSpacing: 1,
        textShadowColor: colors.black,
        textShadowOffset: { width: 1, height: 1 },
        textShadowRadius: 0,
    },
    window: {
        backgroundColor: '#e5dcf5',
        borderWidth: 3,
        borderColor: colors.black,
        borderRadius: 4,
        marginBottom: 16,
        ...PIXEL_SHADOW,
    },
    windowHeader: {
        backgroundColor: '#c6d6f2',
        borderBottomWidth: 2,
        borderBottomColor: colors.black,
        paddingVertical: 10,
        alignItems: 'center',
    },
    windowHeaderText: {
        fontFamily: 'PressStart2P',
        fontSize: 11,
        color: colors.purpleText,
        letterSpacing: 1,
    },
    windowBody: {
        padding: 16,
    },
    tallyRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingVertical: 8,
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(45, 27, 105, 0.15)',
    },
    tallyLabel: {
        fontFamily: 'PressStart2P',
        fontSize: 11,
        color: colors.purpleText,
        letterSpacing: 0.5,
    },
    tallyValue: {
        fontFamily: 'PressStart2P',
        fontSize: 13,
        color: colors.purpleText,
        letterSpacing: 0.5,
    },
    itemsBody: {
        paddingVertical: 12,
    },
    itemRow: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 6,
    },
    itemSprite: {
        width: 28,
        height: 28,
        marginRight: 12,
    },
    itemLabel: {
        flex: 1,
        fontFamily: 'PressStart2P',
        fontSize: 10,
        color: colors.purpleText,
        textTransform: 'capitalize',
    },
    itemCount: {
        fontFamily: 'PressStart2P',
        fontSize: 12,
        color: colors.purpleText,
    },
    dismissButton: {
        marginTop: 8,
        paddingVertical: 14,
        paddingHorizontal: 32,
        backgroundColor: '#8ee2d9',
        borderWidth: 2,
        borderColor: colors.black,
        borderRadius: 3,
        ...PIXEL_SHADOW,
    },
    dismissText: {
        fontFamily: 'PressStart2P',
        fontSize: 12,
        color: colors.purpleText,
        letterSpacing: 1,
    },
});

export default MorningRecapModal;
