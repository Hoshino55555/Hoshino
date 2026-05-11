import React, { useCallback, useEffect, useMemo, useState } from 'react';
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
import { functions } from '../../config/firebase';
import { useGameStateContext } from '../../contexts/GameStateContext';
import { useFirebaseAuth } from '../../contexts/FirebaseAuthContext';
import {
    INGREDIENT_TIER,
    ingredientLabel,
    type IngredientTier,
} from '../../services/RecipeCatalog';
import FooterBackBar from '../chrome/FooterBackBar';
import PageArtShell from '../chrome/PageArtShell';
import type { BoosterSkuId } from '../../services/GameStateService';
import { SHOP_CATALOG } from '../../data/shopCatalog';
import type { ActiveCamp } from '../../services/StarFragmentService';
import { newRequestId } from '../../services/requestId';
import { Backgrounds, getIngredientArt, ShopItems, Frames } from '../../assets';
import { colors } from '../../styles/tokens';

type InventoryTab = 'ingredients' | 'consumables' | 'accessories';

const INVENTORY_TABS: { id: InventoryTab; label: string }[] = [
    { id: 'ingredients', label: 'Ingredients' },
    { id: 'consumables', label: 'Consumables' },
    { id: 'accessories', label: 'Accessories' },
];

const CAMP_META: Record<string, { name: string; image: any; description: string }> = {
    'sleeping-camp': {
        name: 'Sleeping Camp',
        image: ShopItems.snoozeSeed,
        description: 'Forage 20% faster · carry 50% more',
    },
};

const formatRemaining = (ms: number): string => {
    if (ms <= 0) return 'expired';
    const totalMin = Math.floor(ms / 60000);
    const days = Math.floor(totalMin / (60 * 24));
    const hours = Math.floor((totalMin % (60 * 24)) / 60);
    const mins = totalMin % 60;
    if (days > 0) return `${days}d ${hours}h left`;
    if (hours > 0) return `${hours}h ${mins}m left`;
    return `${mins}m left`;
};

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
    { boosters?: Record<string, number>; activeCamp?: ActiveCamp | null }
>(functions, 'getStarFragments');

const TIER_ORDER: IngredientTier[] = ['ultra_rare', 'rare', 'uncommon', 'common'];

interface Props {
    onBack: () => void;
}

const InventoryPage: React.FC<Props> = ({ onBack }) => {
    const { inventory, consumeBooster } = useGameStateContext();
    const { ready, firebaseUid } = useFirebaseAuth();
    const insets = useSafeAreaInsets();
    const { width: screenWidth } = useWindowDimensions();
    // Reserves match the painted strip art aspect ratios at 1200 wide:
    // inventory-bg-top.png is 1200×790, inventory-bg-bottom.png is 1200×278.
    const bannerReserve = screenWidth * (790 / 1200);
    const bottomBarReserve = screenWidth * (278 / 1200);
    const contentTopPadding = bannerReserve * 0.955 + insets.top;
    const contentBottomPadding =
        bottomBarReserve * 1.17 + insets.bottom;

    const [boosters, setBoosters] = useState<Record<string, number>>({});
    const [activeCamp, setActiveCamp] = useState<ActiveCamp | null>(null);
    const [consumingId, setConsumingId] = useState<BoosterSkuId | null>(null);
    const [activeTab, setActiveTab] = useState<InventoryTab>('ingredients');

    // Pull booster charges + active camp from the wallet on mount.
    // Both live server-authoritative on getStarFragments; the
    // consumeBooster response returns the updated boosters map so we
    // only fetch once on entry.
    useEffect(() => {
        if (!ready || !firebaseUid) return;
        let cancelled = false;
        (async () => {
            try {
                const res = await callGetStarFragments({});
                if (cancelled) return;
                setBoosters(res.data.boosters || {});
                setActiveCamp(res.data.activeCamp || null);
            } catch {
                // Silent — empty maps render the empty-state copy.
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

    const handleConsumeBooster = useCallback(async (skuId: BoosterSkuId) => {
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
    }, [consumingId, consumeBooster]);

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

    const totalCount = useMemo(
        () => owned.reduce((s, e) => s + e.count, 0),
        [owned],
    );

    // PageArtShell + ScrollView are both memoized — passing fresh array
    // references each render busts both memos. Keyed on the dims they
    // depend on (which only change with screenWidth/insets).
    const shellOverlays = useMemo(
        () => [
            { key: 'bottom', source: Backgrounds.inventoryBottom, edge: 'bottom' as const, height: bottomBarReserve },
            { key: 'banner', source: Backgrounds.inventoryBanner, edge: 'top' as const, height: bannerReserve },
        ],
        [bottomBarReserve, bannerReserve],
    );
    const scrollContentStyle = useMemo(
        () => [styles.scrollBody, { paddingTop: contentTopPadding, paddingBottom: contentBottomPadding }],
        [contentTopPadding, contentBottomPadding],
    );

    return (
        <PageArtShell
            background={Backgrounds.inventory}
            backgroundColor={colors.purpleBg}
            testID="inventory-screen"
            overlays={shellOverlays}
        >
                <View style={styles.scrollClipper}>
                    <ScrollView
                        contentContainerStyle={scrollContentStyle}
                        showsVerticalScrollIndicator={false}
                    >
                        <View style={styles.tabNavigation}>
                            {INVENTORY_TABS.map((tab) => (
                                <TouchableOpacity
                                    key={tab.id}
                                    style={[
                                        styles.tabButton,
                                        activeTab === tab.id && styles.activeTab,
                                    ]}
                                    onPress={() => setActiveTab(tab.id)}
                                >
                                    <Text style={styles.tabButtonText}>{tab.label}</Text>
                                </TouchableOpacity>
                            ))}
                        </View>

                        {activeTab === 'ingredients' && (
                            <>
                                <Text style={styles.sectionHeading}>
                                    INGREDIENTS · {totalCount}
                                </Text>
                                {owned.length === 0 ? (
                                    <Text style={styles.emptyText}>
                                        Pantry's empty. Forage or visit the shop to stock up.
                                    </Text>
                                ) : (
                                    <View style={styles.grid}>
                                        {owned.map(({ id, count, label }) => (
                                            <ImageBackground
                                                key={id}
                                                source={Frames.inventorySlot}
                                                style={styles.card}
                                                imageStyle={styles.cardTile}
                                                resizeMode="cover"
                                            >
                                                <Image
                                                    source={getIngredientArt(id)}
                                                    style={styles.itemImage}
                                                    resizeMode="cover"
                                                />
                                                <Text style={styles.itemName} numberOfLines={2}>
                                                    {label}
                                                </Text>
                                                <Text style={styles.countText}>
                                                    ×{count}
                                                </Text>
                                            </ImageBackground>
                                        ))}
                                    </View>
                                )}
                            </>
                        )}

                        {activeTab === 'consumables' && (
                            <>
                                <Text style={styles.sectionHeading}>BOOSTERS</Text>
                                {ownedBoosters.length === 0 ? (
                                    <Text style={styles.emptyText}>
                                        No boosters yet. Buy one in the shop.
                                    </Text>
                                ) : (
                                    <View style={styles.grid}>
                                        {ownedBoosters.map(({ id, count, meta }) => {
                                            const busy = consumingId === id;
                                            return (
                                                <TouchableOpacity
                                                    key={id}
                                                    style={[busy && { opacity: 0.6 }]}
                                                    disabled={!!consumingId}
                                                    onPress={() => handleConsumeBooster(id)}
                                                    activeOpacity={0.7}
                                                >
                                                    <ImageBackground
                                                        source={Frames.inventorySlot}
                                                        style={styles.card}
                                                        imageStyle={styles.cardTile}
                                                        resizeMode="cover"
                                                    >
                                                        {meta.image ? (
                                                            <Image
                                                                source={meta.image}
                                                                style={styles.itemImage}
                                                                resizeMode="cover"
                                                            />
                                                        ) : (
                                                            <View style={styles.itemImage} />
                                                        )}
                                                        <Text style={styles.itemName} numberOfLines={2}>
                                                            {meta.name}
                                                        </Text>
                                                        <Text style={styles.countText}>
                                                            {busy ? '…' : `×${count}`}
                                                        </Text>
                                                    </ImageBackground>
                                                </TouchableOpacity>
                                            );
                                        })}
                                    </View>
                                )}
                            </>
                        )}

                        {activeTab === 'accessories' && (
                            <>
                                <Text style={styles.sectionHeading}>ACTIVE</Text>
                                {!activeCamp ? (
                                    <Text style={styles.emptyText}>
                                        No accessories active. Camps and upgrades unlock here.
                                    </Text>
                                ) : (
                                    <View style={styles.grid}>
                                        {(() => {
                                            const meta = CAMP_META[activeCamp.id] ?? {
                                                name: activeCamp.id,
                                                image: null,
                                                description: '',
                                            };
                                            return (
                                                <ImageBackground
                                                    key={activeCamp.id}
                                                    source={Frames.inventorySlot}
                                                    style={styles.card}
                                                    imageStyle={styles.cardTile}
                                                    resizeMode="cover"
                                                >
                                                    {meta.image ? (
                                                        <Image source={meta.image} style={styles.itemImage} resizeMode="cover" />
                                                    ) : (
                                                        <View style={styles.itemImage} />
                                                    )}
                                                    <Text style={styles.itemName} numberOfLines={2}>{meta.name}</Text>
                                                    <Text style={styles.countText} numberOfLines={1}>
                                                        {formatRemaining(activeCamp.expiresAtMs - Date.now())}
                                                    </Text>
                                                </ImageBackground>
                                            );
                                        })()}
                                    </View>
                                )}
                            </>
                        )}
                    </ScrollView>
                </View>

                <FooterBackBar
                    onBack={onBack}
                    height={bottomBarReserve}
                    bottomInset={insets.bottom}
                />
        </PageArtShell>
    );
};

const styles = StyleSheet.create({
    scrollClipper: {
        position: 'absolute',
        top: 0,
        bottom: 0,
        left: 0,
        right: 0,
        overflow: 'hidden',
    },
    scrollBody: {
        paddingHorizontal: 16,
    },
    tabNavigation: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: 10,
    },
    tabButton: {
        flex: 1,
        marginHorizontal: 2,
        backgroundColor: '#dbf3db',
        borderColor: '#003300',
        borderWidth: 2,
        paddingVertical: 8,
        alignItems: 'center',
        borderTopColor: '#006600',
        borderLeftColor: '#006600',
        borderRightColor: '#001100',
        borderBottomColor: '#001100',
    },
    activeTab: {
        backgroundColor: '#b8e6b8',
        borderTopColor: '#001100',
        borderLeftColor: '#001100',
        borderRightColor: '#006600',
        borderBottomColor: '#006600',
    },
    tabButtonText: {
        fontFamily: 'Monaco',
        fontSize: 21,
        color: '#003300',
    },
    sectionHeading: {
        color: colors.mintPale,
        fontFamily: 'Monaco',
        fontSize: 21,
        marginBottom: 10,
    },
    emptyText: {
        color: colors.mintPale,
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
        aspectRatio: 320 / 360,
        minHeight: 130,
        paddingTop: 8,
        paddingBottom: 8,
        paddingLeft: 2,
        paddingRight: 14,
        marginBottom: 10,
        alignItems: 'center',
        justifyContent: 'flex-start',
    },
    cardTile: {
        // ImageBackground stretches the asset to the card box; the source art
        // already paints the bg + border + count panel, so the View underneath
        // stays bare.
        width: '100%',
        height: '100%',
    },
    itemImage: {
        width: 44,
        height: 44,
        marginTop: 2,
        marginBottom: 2,
    },
    itemName: {
        color: '#3a2a1a',
        fontFamily: 'Monaco',
        fontSize: 18,
        textAlign: 'center',
    },
    // The slot art has transparent padding around the painted shape; the
    // mint count panel sits at ~22% from the View's bottom edge, so pin the
    // count text there absolutely instead of pushing to the View's bottom.
    // `right: 12` mirrors the card's asymmetric padding (paddingLeft 2,
    // paddingRight 14) so the count centers over the painted slot rather
    // than the geometric card box.
    countText: {
        position: 'absolute',
        left: 0,
        right: 12,
        bottom: '28%',
        color: '#3a2a1a',
        fontFamily: 'Monaco',
        fontSize: 22,
        textAlign: 'center',
    },
});

export default InventoryPage;
