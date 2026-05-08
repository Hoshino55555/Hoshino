import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
    Animated,
    Easing,
    Image,
    Modal,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import { getIngredientArt } from '../assets';
import {
    INGREDIENT_TIER,
    ingredientLabel,
    type IngredientTier,
} from '../services/RecipeCatalog';

const TIER_BORDER_COLOR: Record<IngredientTier, string> = {
    common: '#8B8B8B',
    uncommon: '#4CAF50',
    rare: '#2196F3',
    ultra_rare: '#9C27B0',
};

export type BoxReveal = {
    itemName: string;
    image: any;
    granted: Record<string, number>;
};

interface Props {
    boxes: BoxReveal[];
    onClose: () => void;
}

// Pop-in animation for a single ingredient card. Each card owns its own
// Animated.Value so we can stagger them slightly via the `index` prop —
// keeps the reveal feeling like a dealt hand instead of one synchronized
// flash. Native driver everywhere; transform/opacity only.
const RevealCard: React.FC<{
    id: string;
    count: number;
    revealed: boolean;
    index: number;
}> = ({ id, count, revealed, index }) => {
    const scale = useRef(new Animated.Value(0.4)).current;
    const opacity = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        if (!revealed) {
            scale.setValue(0.4);
            opacity.setValue(0);
            return;
        }
        Animated.parallel([
            Animated.spring(scale, {
                toValue: 1,
                friction: 5,
                tension: 80,
                delay: index * 40,
                useNativeDriver: true,
            }),
            Animated.timing(opacity, {
                toValue: 1,
                duration: 220,
                delay: index * 40,
                easing: Easing.out(Easing.quad),
                useNativeDriver: true,
            }),
        ]).start();
    }, [revealed, scale, opacity, index]);

    const tier: IngredientTier = INGREDIENT_TIER[id] ?? 'common';
    const borderColor = revealed ? TIER_BORDER_COLOR[tier] : '#3A3A3A';

    return (
        <Animated.View
            style={[
                styles.ingredientCard,
                { borderColor },
                !revealed && styles.cardHidden,
                { transform: [{ scale }], opacity: revealed ? opacity : 1 },
            ]}
        >
            {revealed ? (
                <>
                    <Image
                        source={getIngredientArt(id)}
                        style={styles.cardImage}
                        resizeMode="contain"
                    />
                    <Text style={styles.cardName} numberOfLines={1}>
                        {ingredientLabel(id)}
                    </Text>
                    <Text style={styles.cardCount}>×{count}</Text>
                </>
            ) : (
                <Text style={styles.cardBack}>?</Text>
            )}
        </Animated.View>
    );
};

const BoxRevealModal: React.FC<Props> = ({ boxes, onClose }) => {
    const [boxIdx, setBoxIdx] = useState(0);
    const [revealedCount, setRevealedCount] = useState(0);
    const [packOpened, setPackOpened] = useState(false);

    const currentBox = boxes[boxIdx];
    const ingredients = useMemo(
        () =>
            currentBox
                ? Object.entries(currentBox.granted).map(([id, count]) => ({ id, count }))
                : [],
        [currentBox]
    );

    const packScale = useRef(new Animated.Value(1)).current;
    const packOpacity = useRef(new Animated.Value(1)).current;
    const packShimmer = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        // Reset whenever we advance to a new box. Pack starts visible at full
        // size; ingredient cards reset to face-down via revealedCount=0.
        setRevealedCount(0);
        setPackOpened(false);
        packScale.setValue(1);
        packOpacity.setValue(1);
        packShimmer.setValue(0);
        Animated.loop(
            Animated.sequence([
                Animated.timing(packShimmer, {
                    toValue: 1,
                    duration: 1200,
                    easing: Easing.inOut(Easing.sin),
                    useNativeDriver: true,
                }),
                Animated.timing(packShimmer, {
                    toValue: 0,
                    duration: 1200,
                    easing: Easing.inOut(Easing.sin),
                    useNativeDriver: true,
                }),
            ])
        ).start();
    }, [boxIdx, packScale, packOpacity, packShimmer]);

    const openPack = () => {
        if (packOpened) return;
        setPackOpened(true);
        packShimmer.stopAnimation();
        Animated.parallel([
            Animated.timing(packScale, {
                toValue: 1.45,
                duration: 360,
                easing: Easing.out(Easing.quad),
                useNativeDriver: true,
            }),
            Animated.timing(packOpacity, {
                toValue: 0,
                duration: 360,
                easing: Easing.out(Easing.quad),
                useNativeDriver: true,
            }),
        ]).start(() => {
            // Auto-reveal first card so the player sees something the moment
            // the pack disappears.
            setRevealedCount(1);
        });
    };

    const advance = () => {
        if (!packOpened) return;
        if (revealedCount < ingredients.length) {
            setRevealedCount((c) => c + 1);
            return;
        }
        if (boxIdx < boxes.length - 1) {
            setBoxIdx((i) => i + 1);
        } else {
            onClose();
        }
    };

    // Skip = open the current pack instantly + flash all remaining cards.
    // Tapping again after a Skip on the last pack closes the modal.
    const skipAll = () => {
        if (!packOpened) {
            setPackOpened(true);
            packOpacity.setValue(0);
            packShimmer.stopAnimation();
            setRevealedCount(ingredients.length);
            return;
        }
        if (revealedCount < ingredients.length) {
            setRevealedCount(ingredients.length);
            return;
        }
        if (boxIdx < boxes.length - 1) {
            setBoxIdx((i) => i + 1);
        } else {
            onClose();
        }
    };

    if (!currentBox) return null;

    const isLastBox = boxIdx === boxes.length - 1;
    const allRevealed = revealedCount >= ingredients.length;
    const canSkipAll = !packOpened || !allRevealed;

    const shimmerScale = packShimmer.interpolate({
        inputRange: [0, 1],
        outputRange: [1, 1.04],
    });

    return (
        <Modal transparent visible animationType="fade" onRequestClose={onClose}>
            <View style={styles.backdrop}>
                <View style={styles.card}>
                    <View style={styles.header}>
                        <Text style={styles.title} numberOfLines={1}>
                            {currentBox.itemName}
                        </Text>
                        {boxes.length > 1 && (
                            <Text style={styles.counter}>
                                {boxIdx + 1} / {boxes.length}
                            </Text>
                        )}
                    </View>

                    {!packOpened ? (
                        <TouchableOpacity
                            onPress={openPack}
                            style={styles.packArea}
                            activeOpacity={0.85}
                        >
                            <Animated.View
                                style={[
                                    styles.packWrapper,
                                    {
                                        transform: [
                                            { scale: Animated.multiply(packScale, shimmerScale) },
                                        ],
                                        opacity: packOpacity,
                                    },
                                ]}
                            >
                                <Image
                                    source={currentBox.image}
                                    style={styles.packImage}
                                    resizeMode="contain"
                                />
                            </Animated.View>
                            <Text style={styles.tapHint}>Tap to open</Text>
                        </TouchableOpacity>
                    ) : (
                        <TouchableOpacity
                            onPress={advance}
                            style={styles.revealArea}
                            activeOpacity={0.95}
                        >
                            <View style={styles.ingredientGrid}>
                                {ingredients.map((ing, i) => (
                                    <RevealCard
                                        key={`${boxIdx}-${ing.id}`}
                                        id={ing.id}
                                        count={ing.count}
                                        revealed={i < revealedCount}
                                        index={i}
                                    />
                                ))}
                            </View>
                            <Text style={styles.tapHint}>
                                {allRevealed
                                    ? isLastBox
                                        ? 'Tap to close'
                                        : 'Tap for next pack'
                                    : 'Tap to reveal'}
                            </Text>
                        </TouchableOpacity>
                    )}

                    <View style={styles.footer}>
                        {canSkipAll ? (
                            <TouchableOpacity onPress={skipAll} style={styles.skipBtn}>
                                <Text style={styles.skipText}>Skip</Text>
                            </TouchableOpacity>
                        ) : (
                            <View style={{ width: 1 }} />
                        )}
                    </View>
                </View>
            </View>
        </Modal>
    );
};

const styles = StyleSheet.create({
    backdrop: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.85)',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 16,
    },
    card: {
        backgroundColor: '#0F2A1E',
        borderRadius: 12,
        padding: 16,
        width: '100%',
        maxWidth: 380,
        borderWidth: 2,
        borderColor: '#E8B84A',
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 12,
    },
    title: {
        color: '#E8B84A',
        fontFamily: 'Monaco',
        fontSize: 17,
        flexShrink: 1,
    },
    counter: {
        color: '#E8F5E8',
        fontFamily: 'Monaco',
        fontSize: 12,
        opacity: 0.7,
        marginLeft: 8,
    },
    packArea: {
        alignItems: 'center',
        paddingVertical: 24,
    },
    packWrapper: {
        width: 200,
        height: 200,
        alignItems: 'center',
        justifyContent: 'center',
    },
    packImage: {
        width: '100%',
        height: '100%',
    },
    tapHint: {
        color: '#E8F5E8',
        fontFamily: 'Monaco',
        fontSize: 13,
        marginTop: 14,
        textAlign: 'center',
        opacity: 0.8,
    },
    revealArea: {
        alignItems: 'center',
        paddingVertical: 8,
    },
    ingredientGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        justifyContent: 'center',
        gap: 10,
    },
    ingredientCard: {
        width: 96,
        minHeight: 110,
        backgroundColor: 'rgba(46, 90, 62, 0.85)',
        borderRadius: 6,
        borderWidth: 2,
        padding: 8,
        alignItems: 'center',
        justifyContent: 'center',
    },
    cardHidden: {
        backgroundColor: 'rgba(20,30,25,0.6)',
    },
    cardBack: {
        color: '#666',
        fontFamily: 'Monaco',
        fontSize: 36,
    },
    cardImage: {
        width: 56,
        height: 56,
    },
    cardName: {
        color: '#E8F5E8',
        fontFamily: 'Monaco',
        fontSize: 11,
        marginTop: 4,
        textAlign: 'center',
    },
    cardCount: {
        color: '#FFD700',
        fontFamily: 'Monaco',
        fontSize: 13,
        marginTop: 2,
    },
    footer: {
        flexDirection: 'row',
        justifyContent: 'flex-end',
        marginTop: 14,
    },
    skipBtn: {
        paddingVertical: 6,
        paddingHorizontal: 12,
        backgroundColor: 'rgba(46, 90, 62, 0.85)',
        borderRadius: 6,
        borderWidth: 1,
        borderColor: '#E8F5E8',
    },
    skipText: {
        color: '#E8F5E8',
        fontFamily: 'Monaco',
        fontSize: 12,
    },
});

export default BoxRevealModal;
