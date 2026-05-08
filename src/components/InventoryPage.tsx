import React, { useEffect, useMemo, useState } from 'react';
import {
    View,
    Text,
    TouchableOpacity,
    StyleSheet,
    ImageBackground,
    ScrollView,
    Image,
    Alert,
    useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../config/firebase';
import { useGameStateContext } from '../contexts/GameStateContext';
import { useFirebaseAuth } from '../contexts/FirebaseAuthContext';
import {
    INGREDIENT_TIER,
    ingredientLabel,
    type IngredientTier,
} from '../services/RecipeCatalog';
import type { BoosterSkuId } from '../services/GameStateService';
import { SHOP_CATALOG } from '../data/shopCatalog';
import { Backgrounds, getIngredientArt } from '../assets';

const BOOSTER_SKU_IDS: BoosterSkuId[] = [
    'booster-mood',
    'booster-sleep',
    'booster-hunger',
];

// Pull catalog metadata once — boosters are static so this is a build-time
// projection. Falls back to a sensible label if the catalog is missing the
// SKU (shouldn't happen, but keeps the UI from crashing on a stale build).
const BOOSTER_META: Record<BoosterSkuId, { name: string; image: any; description: string }> = (() => {
    const out: any = {};
    for (const id of BOOSTER_SKU_IDS) {
        const item = SHOP_CATALOG.find((s) => s.id === id);
        out[id] = {
            name: item?.name ?? id,
            image: item?.image,
            description: item?.description ?? '',
        };
    }
    return out;
})();

const callGetStarFragments = httpsCallable<
    Record<string, never>,
    { boosters?: Record<string, number> }
>(functions, 'getStarFragments');

const newRequestId = (prefix: string) =>
    `${prefix}-${Date.now().toString(36)}-${Math.random()
        .toString(36)
        .slice(2, 10)}`;

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
    const { inventory, consumeBooster } = useGameStateContext();
    const { ready, firebaseUid } = useFirebaseAuth();
    const insets = useSafeAreaInsets();
    const { height: screenHeight } = useWindowDimensions();
    const bannerReserve = screenHeight * 0.27;
    const bottomBarReserve = screenHeight * 0.10;

    const [boosters, setBoosters] = useState<Record<string, number>>({});
    const [consumingId, setConsumingId] = useState<BoosterSkuId | null>(null);

    // Pull booster charges from the wallet on mount. Boosters live in
    // wallet.boosters (server-authoritative); the consumeBooster response
    // returns the updated map, so we only fetch once.
    useEffect(() => {
        if (!ready || !firebaseUid) return;
        let cancelled = false;
        (async () => {
            try {
                const res = await callGetStarFragments({});
                if (cancelled) return;
                setBoosters(res.data.boosters || {});
            } catch {
                // Silent — empty boosters map renders an empty section.
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [ready, firebaseUid]);

    const ownedBoosters = useMemo(
        () =>
            BOOSTER_SKU_IDS.map((id) => ({
                id,
                count: boosters[id] || 0,
                meta: BOOSTER_META[id],
            })).filter((b) => b.count > 0),
        [boosters]
    );

    const handleConsumeBooster = async (skuId: BoosterSkuId) => {
        if (consumingId) return;
        setConsumingId(skuId);
        try {
            const res = await consumeBooster(skuId, newRequestId('consumebooster'));
            setBoosters(res.boosters || {});
        } catch (err: any) {
            Alert.alert('Booster failed', err?.message || 'Could not use booster.');
        } finally {
            setConsumingId(null);
        }
    };

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

    return (
        <View style={{ flex: 1, backgroundColor: '#1a1033' }}>
            <ImageBackground
                source={Backgrounds.cooking}
                style={styles.bg}
                resizeMode="cover"
                testID="inventory-screen"
            >
                <View
                    style={[
                        styles.scrollClipper,
                        {
                            marginTop: bannerReserve + insets.top,
                            marginBottom: bottomBarReserve,
                        },
                    ]}
                >
                    <ScrollView
                        contentContainerStyle={[
                            styles.scrollBody,
                            { paddingBottom: insets.bottom + 16 },
                        ]}
                        showsVerticalScrollIndicator={false}
                    >
                        {ownedBoosters.length > 0 && (
                            <>
                                <Text style={styles.sectionHeading}>BOOSTERS</Text>
                                <View style={styles.grid}>
                                    {ownedBoosters.map(({ id, count, meta }) => {
                                        const busy = consumingId === id;
                                        return (
                                            <TouchableOpacity
                                                key={id}
                                                style={[
                                                    styles.card,
                                                    styles.boosterCard,
                                                    busy && { opacity: 0.6 },
                                                ]}
                                                disabled={!!consumingId}
                                                onPress={() => handleConsumeBooster(id)}
                                                activeOpacity={0.7}
                                            >
                                                {meta.image ? (
                                                    <Image
                                                        source={meta.image}
                                                        style={styles.itemImage}
                                                        resizeMode="contain"
                                                    />
                                                ) : (
                                                    <View style={styles.itemImage} />
                                                )}
                                                <Text style={styles.itemName} numberOfLines={2}>
                                                    {meta.name}
                                                </Text>
                                                <View style={styles.boosterUseRow}>
                                                    <Text style={styles.boosterUseLabel}>
                                                        {busy ? '…' : 'TAP TO USE'}
                                                    </Text>
                                                    <View
                                                        style={[
                                                            styles.countPill,
                                                            { backgroundColor: '#7ecf7a' },
                                                        ]}
                                                    >
                                                        <Text style={styles.countText}>×{count}</Text>
                                                    </View>
                                                </View>
                                            </TouchableOpacity>
                                        );
                                    })}
                                </View>
                            </>
                        )}

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

                <View
                    style={[
                        styles.bottomBar,
                        { height: bottomBarReserve, paddingBottom: insets.bottom },
                    ]}
                    pointerEvents="box-none"
                >
                    <TouchableOpacity
                        style={styles.backButton}
                        onPress={onBack}
                        hitSlop={{ top: 12, right: 12, bottom: 12, left: 12 }}
                    >
                        <Text style={styles.backButtonText}>{'<'} Back</Text>
                    </TouchableOpacity>
                </View>
            </ImageBackground>
        </View>
    );
};

const styles = StyleSheet.create({
    bg: { flex: 1, width: '100%', height: '100%' },
    bottomBar: {
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 0,
        justifyContent: 'center',
        alignItems: 'flex-start',
        paddingHorizontal: 16,
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
        fontSize: 14,
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
        fontFamily: 'Monaco',
        fontSize: 14,
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
        fontFamily: 'Monaco',
        fontSize: 15,
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
        fontFamily: 'Monaco',
        fontSize: 17,
    },
    boosterCard: {
        borderColor: '#7ecf7a',
    },
    boosterUseRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        width: '100%',
        marginTop: 4,
    },
    boosterUseLabel: {
        color: '#3a2a1a',
        fontFamily: 'Monaco',
        fontSize: 11,
    },
});

export default InventoryPage;
