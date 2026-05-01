import React, { useMemo, useState } from 'react';
import {
    View,
    Text,
    TouchableOpacity,
    StyleSheet,
    ImageBackground,
    ScrollView,
    Image,
    useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import ZoomOutOverlay from './ZoomOutOverlay';
import { useGameStateContext } from '../contexts/GameStateContext';
import {
    INGREDIENT_TIER,
    ingredientLabel,
    type IngredientTier,
} from '../services/RecipeCatalog';
import { Backgrounds, getIngredientArt } from '../assets';

const TIER_COLOR: Record<IngredientTier, string> = {
    common: '#cfd8c4',
    uncommon: '#7ecf7a',
    rare: '#6aaaff',
    ultra_rare: '#d6a2ff',
};

const TIER_ORDER: IngredientTier[] = ['ultra_rare', 'rare', 'uncommon', 'common'];

interface Props {
    onBack: () => void;
}

const InventoryPage: React.FC<Props> = ({ onBack }) => {
    const { inventory } = useGameStateContext();
    const insets = useSafeAreaInsets();
    const { height: screenHeight } = useWindowDimensions();
    // Mirrors FeedingPage's banner reserve so the inventory content lands
    // below the painted top scene.
    const bannerReserve = screenHeight * 0.32;

    const [isClosing, setIsClosing] = useState(false);

    // Sort owned ingredients by tier (rarest first) then alphabetically.
    const owned = useMemo(() => {
        return Object.entries(inventory)
            .filter(([, n]) => (n ?? 0) > 0)
            .map(([id, n]) => ({
                id,
                count: n,
                tier: (INGREDIENT_TIER as Record<string, IngredientTier>)[id] ?? 'common',
                label: ingredientLabel(id),
            }))
            .sort((a, b) => {
                const ai = TIER_ORDER.indexOf(a.tier);
                const bi = TIER_ORDER.indexOf(b.tier);
                if (ai !== bi) return ai - bi;
                return a.label.localeCompare(b.label);
            });
    }, [inventory]);

    const totalCount = owned.reduce((s, e) => s + e.count, 0);

    const handleClose = () => {
        if (isClosing) return;
        setIsClosing(true);
    };

    return (
        <ZoomOutOverlay exiting={isClosing} onExitComplete={onBack} backgroundColor="#1a1033">
            <ImageBackground
                source={Backgrounds.cooking}
                style={styles.bg}
                resizeMode="cover"
                testID="inventory-screen"
            >
                <View style={[styles.topBar, { paddingTop: insets.top + 8 }]}>
                    <TouchableOpacity
                        style={styles.backButton}
                        onPress={handleClose}
                        hitSlop={{ top: 12, right: 12, bottom: 12, left: 12 }}
                    >
                        <Text style={styles.backButtonText}>{'<'} Back</Text>
                    </TouchableOpacity>
                </View>

                <View style={[styles.scrollClipper, { marginTop: bannerReserve }]}>
                    <ScrollView
                        contentContainerStyle={[
                            styles.scrollBody,
                            { paddingBottom: insets.bottom + 16 },
                        ]}
                        showsVerticalScrollIndicator={false}
                    >
                        <Text style={styles.sectionHeading}>
                            INGREDIENTS · {totalCount}
                        </Text>

                        {owned.length === 0 ? (
                            <Text style={styles.emptyText}>
                                Pantry's empty. Forage or visit the shop to stock up.
                            </Text>
                        ) : (
                            <View style={styles.grid}>
                                {owned.map(({ id, count, tier, label }) => (
                                    <View
                                        key={id}
                                        style={[
                                            styles.card,
                                            { borderColor: TIER_COLOR[tier] },
                                        ]}
                                    >
                                        <Image
                                            source={getIngredientArt(id)}
                                            style={styles.itemImage}
                                            resizeMode="contain"
                                        />
                                        <Text style={styles.itemName} numberOfLines={2}>
                                            {label}
                                        </Text>
                                        <View
                                            style={[
                                                styles.countPill,
                                                { backgroundColor: TIER_COLOR[tier] },
                                            ]}
                                        >
                                            <Text style={styles.countText}>×{count}</Text>
                                        </View>
                                    </View>
                                ))}
                            </View>
                        )}
                    </ScrollView>
                </View>
            </ImageBackground>
        </ZoomOutOverlay>
    );
};

const styles = StyleSheet.create({
    bg: { flex: 1, width: '100%', height: '100%' },
    topBar: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        paddingHorizontal: 16,
        paddingBottom: 4,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        zIndex: 10,
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
    scrollClipper: {
        flex: 1,
        overflow: 'hidden',
    },
    scrollBody: {
        paddingHorizontal: 16,
        paddingTop: 8,
    },
    sectionHeading: {
        color: '#E8F5E8',
        fontFamily: 'PressStart2P',
        fontSize: 10,
        marginBottom: 10,
    },
    emptyText: {
        color: '#E8F5E8',
        fontSize: 11,
        fontStyle: 'italic',
        textAlign: 'center',
        opacity: 0.85,
        marginVertical: 16,
    },
    grid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        justifyContent: 'space-between',
    },
    card: {
        width: '31%',
        backgroundColor: '#f5eed6',
        borderWidth: 2,
        borderColor: '#3a2a1a',
        borderRadius: 0,
        padding: 8,
        marginBottom: 10,
        alignItems: 'center',
    },
    itemImage: {
        width: 44,
        height: 44,
        marginBottom: 4,
    },
    itemName: {
        color: '#3a2a1a',
        fontFamily: '04b03',
        fontSize: 11,
        textAlign: 'center',
        marginBottom: 4,
    },
    countPill: {
        paddingHorizontal: 6,
        paddingVertical: 2,
        borderWidth: 1,
        borderColor: '#3a2a1a',
    },
    countText: {
        color: '#3a2a1a',
        fontFamily: '04b03',
        fontSize: 12,
    },
});

export default InventoryPage;
