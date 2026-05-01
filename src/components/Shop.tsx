import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
    View,
    Text,
    TouchableOpacity,
    StyleSheet,
    ScrollView,
    Image,
    ImageBackground,
    Dimensions,
    Animated,
    Easing,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Modal } from 'react-native';
import { MarketplaceItem, ItemRarity } from '../services/MarketplaceService';
import StarFragmentService, { type DailySpinReward } from '../services/StarFragmentService';
import { ingredientLabel } from '../services/RecipeCatalog';
import { getIngredientArt } from '../assets';
import { useWallet } from '../contexts/WalletContext';
import { Connection } from '@solana/web3.js';
import ZoomOutOverlay from './ZoomOutOverlay';
import { Backgrounds, Stars } from '../assets';
import {
    SHOP_TABS,
    type ShopTab,
    type ShopItem,
    itemsForTab,
    groupBySubcategory,
} from '../data/shopCatalog';
import { INGREDIENT_TIER } from '../services/RecipeCatalog';
import { useGameStateContext } from '../contexts/GameStateContext';

interface ShopProps {
    connection: Connection;
    onNotification?: (message: string, type: 'success' | 'error' | 'info' | 'warning') => void;
    onClose: () => void;
    onCloseStart?: () => void;
    onItemsPurchased?: (items: MarketplaceItem[]) => void;
}

// Wallet address fed to StarFragmentService when the user isn't connected.
// Matches the placeholder used elsewhere (GameContainer's IngredientSelection)
// so balances persist across the same local profile pre-Privy.
const FALLBACK_WALLET = 'demo-wallet';

// Layered star-fragment "pile" sprites for the Deals tab SF packs. Bigger
// pack = more fragments stacked. Positions are within a 44×44 image area;
// arrays go back-to-front so closer/lower fragments paint over farther ones.
type PileStar = { x: number; y: number; size: number };
const FRAGMENT_PILES: Record<string, PileStar[]> = {
    'star-fragments-small': [
        { x: 2,  y: 12, size: 18 },
        { x: 22, y: 12, size: 18 },
        { x: 12, y: 20, size: 22 },
    ],
    'star-fragments-medium': [
        { x: 2,  y: 4,  size: 14 },
        { x: 14, y: 2,  size: 14 },
        { x: 26, y: 4,  size: 14 },
        { x: 4,  y: 16, size: 18 },
        { x: 22, y: 16, size: 18 },
        { x: 12, y: 24, size: 18 },
    ],
    'star-fragments-large': [
        { x: 0,  y: 2,  size: 12 },
        { x: 10, y: 0,  size: 12 },
        { x: 22, y: 0,  size: 12 },
        { x: 32, y: 2,  size: 12 },
        { x: 2,  y: 12, size: 14 },
        { x: 14, y: 10, size: 16 },
        { x: 26, y: 12, size: 14 },
        { x: 4,  y: 22, size: 16 },
        { x: 24, y: 22, size: 16 },
        { x: 14, y: 28, size: 16 },
    ],
};

// Daily-spin reel preview pool. Mirrors backend SPIN_POOL — every distinct
// reward type is shown so the player knows what's possible. Tier color
// follows ingredient tier accents (matches Inventory + Feeding pages).
type ReelTile =
    | { kind: 'starFragments'; amount: number; color: string }
    | { kind: 'ingredient'; id: string; tier: 'common' | 'uncommon' | 'rare' | 'ultra_rare'; color: string };

const TIER_TILE_COLOR = {
    common: '#8B8B8B',
    uncommon: '#4CAF50',
    rare: '#2196F3',
    ultra_rare: '#9C27B0',
} as const;

const REEL_TILES: ReelTile[] = [
    { kind: 'ingredient', id: 'egg',        tier: 'common',     color: TIER_TILE_COLOR.common },
    { kind: 'starFragments', amount: 10,    color: '#2e5a3e' },
    { kind: 'ingredient', id: 'lettuce',    tier: 'common',     color: TIER_TILE_COLOR.common },
    { kind: 'ingredient', id: 'strawberry', tier: 'uncommon',   color: TIER_TILE_COLOR.uncommon },
    { kind: 'starFragments', amount: 50,    color: '#2e5a3e' },
    { kind: 'ingredient', id: 'tomato',     tier: 'uncommon',   color: TIER_TILE_COLOR.uncommon },
    { kind: 'ingredient', id: 'bacon',      tier: 'rare',       color: TIER_TILE_COLOR.rare },
    { kind: 'ingredient', id: 'milk',       tier: 'rare',       color: TIER_TILE_COLOR.rare },
    { kind: 'starFragments', amount: 250,   color: '#FF9800' },
    { kind: 'ingredient', id: 'star_dust',  tier: 'ultra_rare', color: TIER_TILE_COLOR.ultra_rare },
];

const REEL_TILE_SIZE = 84;
const REEL_TILE_GAP = 8;
const REEL_STEP = REEL_TILE_SIZE + REEL_TILE_GAP;

const Shop: React.FC<ShopProps> = ({ connection, onNotification, onClose, onCloseStart, onItemsPurchased }) => {
    const insets = useSafeAreaInsets();
    const { publicKey } = useWallet();
    const screenHeight = Dimensions.get('window').height;
    const bannerReserve = screenHeight * 0.25;

    const walletKey = publicKey ?? FALLBACK_WALLET;
    const starFragmentService = useMemo(() => new StarFragmentService(connection), [connection]);
    const { refreshPantry } = useGameStateContext();

    const [selectedTab, setSelectedTab] = useState<ShopTab>('consumables');
    const [balance, setBalance] = useState<number>(0);
    const [cart, setCart] = useState<{ item: ShopItem; quantity: number }[]>([]);
    const [flashingItem, setFlashingItem] = useState<string | null>(null);
    const [isClosing, setIsClosing] = useState(false);
    const [spinAvailable, setSpinAvailable] = useState(false);
    const [spinNextAtMs, setSpinNextAtMs] = useState(0);
    const [spinning, setSpinning] = useState(false);
    const [spinReward, setSpinReward] = useState<DailySpinReward | null>(null);
    type SpinPhase = 'idle' | 'spinning' | 'revealed';
    const [spinPhase, setSpinPhase] = useState<SpinPhase>('idle');
    const reelTranslateX = useRef(new Animated.Value(0)).current;
    const reelLoopRef = useRef<Animated.CompositeAnimation | null>(null);
    const revealScale = useRef(new Animated.Value(0.4)).current;
    const revealGlow = useRef(new Animated.Value(0)).current;
    const [purchasing, setPurchasing] = useState(false);
    // 1s tick for spin cooldown countdown — only when locked + visible.
    const [, setNowTick] = useState(0);
    useEffect(() => {
        if (spinAvailable || spinNextAtMs <= Date.now()) return;
        const t = setInterval(() => setNowTick((n) => n + 1), 1000);
        return () => clearInterval(t);
    }, [spinAvailable, spinNextAtMs]);

    const refreshBalance = useCallback(async () => {
        try {
            const status = await starFragmentService.getWalletStatus();
            setBalance(status.balance);
            setSpinAvailable(status.dailySpin.available);
            setSpinNextAtMs(status.dailySpin.nextEligibleAtMs);
        } catch (err) {
            console.warn('Shop: failed to load star fragment balance', err);
        }
    }, [starFragmentService]);

    const startReelAnimation = useCallback(() => {
        reelTranslateX.setValue(0);
        const loop = Animated.loop(
            Animated.timing(reelTranslateX, {
                toValue: -REEL_STEP * REEL_TILES.length,
                duration: 1100,
                easing: Easing.linear,
                useNativeDriver: true,
            })
        );
        reelLoopRef.current = loop;
        loop.start();
    }, [reelTranslateX]);

    const stopReelAndReveal = useCallback(() => {
        if (reelLoopRef.current) {
            reelLoopRef.current.stop();
            reelLoopRef.current = null;
        }
        // Deceleration: one last partial sweep with ease-out so the reel
        // glides to a stop before the reveal pops, instead of cutting hard.
        const decel = Animated.timing(reelTranslateX, {
            toValue: -REEL_STEP * REEL_TILES.length * 1.4,
            duration: 1400,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
        });
        decel.start(({ finished }) => {
            if (!finished) return;
            revealScale.setValue(0.4);
            revealGlow.setValue(0);
            setSpinPhase('revealed');
            Animated.parallel([
                Animated.spring(revealScale, {
                    toValue: 1,
                    friction: 4,
                    tension: 80,
                    useNativeDriver: true,
                }),
                Animated.sequence([
                    Animated.timing(revealGlow, {
                        toValue: 1,
                        duration: 220,
                        useNativeDriver: true,
                    }),
                    Animated.timing(revealGlow, {
                        toValue: 0.6,
                        duration: 400,
                        useNativeDriver: true,
                    }),
                ]),
            ]).start();
        });
    }, [reelTranslateX, revealScale, revealGlow]);

    const handleDailySpin = useCallback(async () => {
        if (spinning || !spinAvailable) return;
        setSpinning(true);
        setSpinReward(null);
        setSpinPhase('spinning');
        startReelAnimation();
        const minSpinDelay = new Promise<void>((res) => setTimeout(res, 3500));
        try {
            const [res] = await Promise.all([
                starFragmentService.claimDailySpin(),
                minSpinDelay,
            ]);
            setSpinReward(res.reward);
            setBalance(res.newBalance);
            setSpinAvailable(false);
            setSpinNextAtMs(res.nextEligibleAtMs);
            if (res.reward.kind === 'ingredient') {
                await refreshPantry();
            }
            stopReelAndReveal();
        } catch (err: any) {
            if (reelLoopRef.current) {
                reelLoopRef.current.stop();
                reelLoopRef.current = null;
            }
            setSpinPhase('idle');
            onNotification?.(err?.message || 'Daily spin failed', 'error');
        } finally {
            setSpinning(false);
        }
    }, [
        spinning,
        spinAvailable,
        starFragmentService,
        refreshPantry,
        onNotification,
        startReelAnimation,
        stopReelAndReveal,
    ]);

    const closeSpinModal = useCallback(() => {
        setSpinPhase('idle');
        setSpinReward(null);
    }, []);

    const [claimingHackathon, setClaimingHackathon] = useState(false);
    const handleHackathonSpecial = useCallback(async () => {
        if (claimingHackathon) return;
        setClaimingHackathon(true);
        try {
            const res = await starFragmentService.claimHackathonSpecial();
            setBalance(res.newBalance);
            onNotification?.(
                `Hackathon Special claimed — +${res.granted.toLocaleString()} Star Fragments!`,
                'success'
            );
        } catch (err: any) {
            onNotification?.(err?.message || 'Hackathon claim failed', 'error');
        } finally {
            setClaimingHackathon(false);
        }
    }, [claimingHackathon, starFragmentService, onNotification]);

    const formatCooldown = (ms: number) => {
        if (ms <= 0) return 'Ready';
        const h = Math.floor(ms / 3_600_000);
        const m = Math.floor((ms % 3_600_000) / 60_000);
        const s = Math.floor((ms % 60_000) / 1000);
        if (h > 0) return `${h}h ${m}m`;
        if (m > 0) return `${m}m ${s}s`;
        return `${s}s`;
    };

    useEffect(() => {
        refreshBalance();
    }, [refreshBalance]);

    const handleClose = () => {
        if (isClosing) return;
        setIsClosing(true);
        onCloseStart?.();
    };

    const cartTotal = useMemo(
        () => cart.reduce((sum, c) => sum + c.item.priceStarFragments * c.quantity, 0),
        [cart]
    );
    const remainingBalance = balance - cartTotal;

    const sections = useMemo(
        () => groupBySubcategory(itemsForTab(selectedTab)),
        [selectedTab]
    );

    const getRarityBorderColor = (rarity: ItemRarity): string => {
        switch (rarity) {
            case ItemRarity.COMMON: return '#8B8B8B';
            case ItemRarity.UNCOMMON: return '#4CAF50';
            case ItemRarity.RARE: return '#2196F3';
            case ItemRarity.EPIC: return '#9C27B0';
            case ItemRarity.LEGENDARY: return '#FF9800';
            default: return '#003300';
        }
    };

    const addToCart = (item: ShopItem) => {
        if (item.status === 'iap-pending') {
            onNotification?.('Coming soon — in-app purchases land in a future update.', 'info');
            return;
        }
        if (item.status === 'effect-pending') {
            onNotification?.('Coming soon — this item\'s effect is being wired up.', 'info');
            return;
        }
        if (item.currency !== 'starFragments') {
            onNotification?.('This item is not available yet.', 'info');
            return;
        }
        const projected = cartTotal + item.priceStarFragments;
        if (projected > balance) {
            onNotification?.(
                `Not enough Star Fragments — need ${projected}, have ${balance}.`,
                'error'
            );
            return;
        }

        setCart((prev) => {
            const existing = prev.find((c) => c.item.id === item.id);
            if (existing) {
                return prev.map((c) =>
                    c.item.id === item.id ? { ...c, quantity: c.quantity + 1 } : c
                );
            }
            return [...prev, { item, quantity: 1 }];
        });

        setFlashingItem(item.id);
        setTimeout(() => setFlashingItem(null), 300);
    };

    const removeFromCart = (itemId: string) => {
        setCart((prev) => prev.filter((c) => c.item.id !== itemId));
    };

    const clearCart = () => {
        if (cart.length === 0) return;
        setCart([]);
        onNotification?.('Cart cleared.', 'info');
    };

    const handleCheckout = async () => {
        if (purchasing) return;
        if (cart.length === 0) {
            onNotification?.('Your cart is empty!', 'warning');
            return;
        }
        // Currently the only purchasable items are ingredients (effect-pending
        // items are blocked at addToCart). The atomic purchase callable
        // deducts SF + grants ingredients in one server transaction.
        const ingredientCounts: Record<string, number> = {};
        for (const c of cart) {
            if (c.item.id in INGREDIENT_TIER) {
                ingredientCounts[c.item.id] =
                    (ingredientCounts[c.item.id] || 0) + c.quantity;
            }
        }
        if (Object.keys(ingredientCounts).length === 0) {
            onNotification?.('Nothing purchasable in cart yet.', 'warning');
            return;
        }
        if (cartTotal > balance) {
            onNotification?.('Insufficient Star Fragments.', 'error');
            return;
        }

        setPurchasing(true);
        try {
            const result = await starFragmentService.purchaseIngredients(ingredientCounts);
            setBalance(result.newBalance);
            await refreshPantry();

            const purchased: MarketplaceItem[] = cart.flatMap((c) =>
                Array.from({ length: c.quantity }, () => ({
                    id: c.item.id,
                    name: c.item.name,
                    description: c.item.description,
                    imageUrl: c.item.imageUrl,
                    category: c.item.category,
                    rarity: c.item.rarity,
                    priceSOL: c.item.priceSOL,
                    priceStarFragments: c.item.priceStarFragments,
                    inStock: c.item.inStock,
                }))
            );
            onItemsPurchased?.(purchased);
            setCart([]);
            onNotification?.(`Purchase complete — ${purchased.length} item${purchased.length === 1 ? '' : 's'} added.`, 'success');
        } catch (err: any) {
            onNotification?.(err?.message || 'Purchase failed.', 'error');
            await refreshBalance();
        } finally {
            setPurchasing(false);
        }
    };

    const renderDailySpinCard = (item: ShopItem) => {
        const remainingMs = Math.max(0, spinNextAtMs - Date.now());
        const ready = spinAvailable || remainingMs === 0;
        return (
            <View
                key={item.id}
                style={[styles.itemCard, { borderColor: getRarityBorderColor(item.rarity) }]}
            >
                <TouchableOpacity
                    style={[styles.itemClickArea, !ready && styles.disabledItem]}
                    onPress={handleDailySpin}
                    disabled={!ready || spinning}
                >
                    <Image source={Stars.fragment} style={styles.itemImage} resizeMode="contain" />
                    <Text style={styles.itemName} numberOfLines={2}>
                        {item.name}
                    </Text>
                    <Text style={styles.itemSummary} numberOfLines={2}>
                        {ready ? 'Tap to spin!' : `Next: ${formatCooldown(remainingMs)}`}
                    </Text>
                    <View style={styles.priceContainer}>
                        <Text style={[styles.itemPrice, { color: ready ? '#2e5a3e' : '#888' }]}>
                            {ready ? 'FREE' : 'COOLDOWN'}
                        </Text>
                    </View>
                </TouchableOpacity>
            </View>
        );
    };

    const renderHackathonCard = (item: ShopItem) => (
        <View
            key={item.id}
            style={[styles.itemCard, { borderColor: getRarityBorderColor(item.rarity) }]}
        >
            <TouchableOpacity
                style={[styles.itemClickArea, claimingHackathon && styles.disabledItem]}
                onPress={handleHackathonSpecial}
                disabled={claimingHackathon}
            >
                <Image source={Stars.fragment} style={styles.itemImage} resizeMode="contain" />
                <Text style={styles.itemName} numberOfLines={2}>
                    {item.name}
                </Text>
                <Text style={styles.itemSummary} numberOfLines={2}>
                    {item.summary}
                </Text>
                <View style={styles.priceContainer}>
                    <Text style={[styles.itemPrice, { color: '#2e5a3e' }]}>
                        {claimingHackathon ? 'CLAIMING…' : 'FREE'}
                    </Text>
                </View>
            </TouchableOpacity>
        </View>
    );

    const renderItemCard = (item: ShopItem) => {
        if (item.id === 'daily-spin') return renderDailySpinCard(item);
        if (item.id === 'hackathon-special') return renderHackathonCard(item);
        const pile = FRAGMENT_PILES[item.id];
        const locked = item.status === 'iap-pending' || item.status === 'effect-pending';
        const projected = cartTotal + item.priceStarFragments;
        const insufficient =
            !locked && item.currency === 'starFragments' && projected > balance;
        const disabled = locked || insufficient;

        return (
            <View
                key={item.id}
                style={[
                    styles.itemCard,
                    { borderColor: getRarityBorderColor(item.rarity) },
                    flashingItem === item.id && styles.flashingCard,
                ]}
            >
                <TouchableOpacity
                    style={[styles.itemClickArea, disabled && styles.disabledItem]}
                    onPress={() => addToCart(item)}
                    disabled={insufficient && !locked}
                >
                    {pile ? (
                        <View style={styles.pile}>
                            {pile.map((p, i) => (
                                <Image
                                    key={i}
                                    source={Stars.fragment}
                                    style={[
                                        styles.pileStar,
                                        { left: p.x, top: p.y, width: p.size, height: p.size },
                                    ]}
                                    resizeMode="contain"
                                />
                            ))}
                        </View>
                    ) : (
                        <Image source={item.image} style={styles.itemImage} resizeMode="contain" />
                    )}
                    <Text style={[styles.itemName, disabled && styles.disabledText]} numberOfLines={2}>
                        {item.name}
                    </Text>
                    {item.durationLabel ? (
                        <Text style={styles.itemDuration}>{item.durationLabel}</Text>
                    ) : null}
                    {item.summary ? (
                        <Text style={styles.itemSummary} numberOfLines={2}>{item.summary}</Text>
                    ) : null}

                    {locked ? (
                        <View style={styles.priceContainer}>
                            <Text style={styles.itemPrice}>
                                {item.priceUsd != null ? `$${item.priceUsd.toFixed(2)}` : 'IAP'}
                            </Text>
                        </View>
                    ) : (
                        <View style={styles.priceContainer}>
                            <Image source={Stars.fragment} style={styles.priceIcon} resizeMode="contain" />
                            <Text style={[styles.itemPrice, insufficient && styles.disabledText]}>
                                {item.priceStarFragments}
                            </Text>
                        </View>
                    )}

                    {locked && (
                        <View style={styles.comingSoonBadge}>
                            <Text style={styles.comingSoonText}>COMING SOON</Text>
                        </View>
                    )}
                    {insufficient && (
                        <Text style={styles.insufficientText}>INSUFFICIENT</Text>
                    )}
                </TouchableOpacity>
            </View>
        );
    };

    return (
        <ZoomOutOverlay exiting={isClosing} onExitComplete={onClose} backgroundColor="#1a1033">
            <ImageBackground source={Backgrounds.shop} style={styles.bg} resizeMode="cover">
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
                    <View style={styles.balanceRow}>
                        <Image source={Stars.fragment} style={styles.balanceIcon} resizeMode="contain" />
                        <View style={styles.dustTextContainer}>
                            <Text style={styles.walletLabel}>WALLET</Text>
                            <Text style={styles.dustAmount}>{remainingBalance} Star Fragments</Text>
                            {cartTotal > 0 ? (
                                <Text style={styles.walletSubLabel}>(−{cartTotal} in cart)</Text>
                            ) : null}
                        </View>
                    </View>

                    <View style={styles.tabNavigation}>
                        {SHOP_TABS.map((tab) => (
                            <TouchableOpacity
                                key={tab.id}
                                style={[styles.tabButton, selectedTab === tab.id && styles.activeTab]}
                                onPress={() => setSelectedTab(tab.id)}
                            >
                                <Text style={styles.tabButtonText}>{tab.label}</Text>
                            </TouchableOpacity>
                        ))}
                    </View>

                    <View style={styles.itemsContainer}>
                        {sections.map((section) => (
                            <View key={section.subcategory} style={styles.section}>
                                <Text style={styles.sectionHeader}>{section.subcategory}</Text>
                                <View style={styles.sectionGrid}>
                                    {section.items.map(renderItemCard)}
                                </View>
                            </View>
                        ))}
                    </View>

                    <View style={styles.cartContainer}>
                        <View style={styles.cartHeader}>
                            <Text style={styles.cartTitle}>CART ({cart.length})</Text>
                            <View style={styles.cartHeaderRight}>
                                <View style={styles.cartTotal}>
                                    <Image source={Stars.fragment} style={styles.cartTotalIcon} resizeMode="contain" />
                                    <Text style={styles.cartTotalText}>{cartTotal}</Text>
                                </View>
                                {cart.length > 0 && (
                                    <TouchableOpacity style={styles.clearCartButton} onPress={clearCart}>
                                        <Text style={styles.clearCartText}>CLEAR</Text>
                                    </TouchableOpacity>
                                )}
                            </View>
                        </View>

                        {cart.length > 0 ? (
                            <View style={styles.cartItems}>
                                <View style={styles.cartItemsRow}>
                                    {cart.map((cartItem) => (
                                        <View key={cartItem.item.id} style={styles.cartItem}>
                                            <TouchableOpacity
                                                style={styles.removeButton}
                                                onPress={() => removeFromCart(cartItem.item.id)}
                                            >
                                                <Text style={styles.removeButtonText}>×</Text>
                                            </TouchableOpacity>
                                            <Image
                                                source={cartItem.item.image}
                                                style={styles.cartItemImage}
                                                resizeMode="contain"
                                            />
                                            <Text style={styles.cartItemQuantity}>x{cartItem.quantity}</Text>
                                        </View>
                                    ))}
                                </View>
                                <TouchableOpacity
                                    style={[styles.checkoutButton, purchasing && styles.disabledItem]}
                                    onPress={handleCheckout}
                                    disabled={purchasing}
                                >
                                    <Text style={styles.checkoutButtonText}>
                                        {purchasing ? 'PROCESSING…' : 'CHECKOUT'}
                                    </Text>
                                </TouchableOpacity>
                            </View>
                        ) : (
                            <View style={styles.emptyCart}>
                                <Text style={styles.emptyCartText}>Cart is empty</Text>
                            </View>
                        )}
                    </View>
                </ScrollView>
                </View>
            </ImageBackground>
            <Modal
                transparent
                visible={spinPhase !== 'idle'}
                animationType="fade"
                onRequestClose={closeSpinModal}
            >
                <View style={styles.spinBackdrop}>
                    <View style={styles.spinCard}>
                        <Text style={styles.spinTitle}>
                            {spinPhase === 'revealed' ? 'You won!' : 'Daily Spin'}
                        </Text>

                        <Text style={styles.spinPoolLabel}>Possible rewards</Text>
                        <View style={styles.spinPoolGrid}>
                            {REEL_TILES.map((t, i) => (
                                <View
                                    key={`pool-${i}`}
                                    style={[styles.spinPoolTile, { borderColor: t.color }]}
                                >
                                    {t.kind === 'starFragments' ? (
                                        <>
                                            <Image
                                                source={Stars.fragment}
                                                style={styles.spinPoolIcon}
                                                resizeMode="contain"
                                            />
                                            <Text style={styles.spinPoolText}>×{t.amount}</Text>
                                        </>
                                    ) : (
                                        <Image
                                            source={getIngredientArt(t.id)}
                                            style={styles.spinPoolIcon}
                                            resizeMode="contain"
                                        />
                                    )}
                                </View>
                            ))}
                        </View>

                        {spinPhase === 'spinning' && (
                            <>
                                <View style={styles.reelViewport}>
                                    <View style={styles.reelPointer} />
                                    <Animated.View
                                        style={[
                                            styles.reelTrack,
                                            { transform: [{ translateX: reelTranslateX }] },
                                        ]}
                                    >
                                        {[...REEL_TILES, ...REEL_TILES, ...REEL_TILES].map((t, i) => (
                                            <View
                                                key={`reel-${i}`}
                                                style={[styles.reelTile, { borderColor: t.color }]}
                                            >
                                                {t.kind === 'starFragments' ? (
                                                    <>
                                                        <Image
                                                            source={Stars.fragment}
                                                            style={styles.reelTileIcon}
                                                            resizeMode="contain"
                                                        />
                                                        <Text style={styles.reelTileText}>×{t.amount}</Text>
                                                    </>
                                                ) : (
                                                    <Image
                                                        source={getIngredientArt(t.id)}
                                                        style={styles.reelTileIcon}
                                                        resizeMode="contain"
                                                    />
                                                )}
                                            </View>
                                        ))}
                                    </Animated.View>
                                </View>
                                <Text style={styles.spinStatus}>Spinning…</Text>
                            </>
                        )}

                        {spinPhase === 'revealed' && spinReward && (
                            <>
                                <Animated.View
                                    style={[
                                        styles.revealTile,
                                        {
                                            transform: [{ scale: revealScale }],
                                            shadowOpacity: revealGlow,
                                            borderColor:
                                                spinReward.kind === 'ingredient'
                                                    ? TIER_TILE_COLOR[spinReward.tier]
                                                    : '#FF9800',
                                        },
                                    ]}
                                >
                                    {spinReward.kind === 'starFragments' ? (
                                        <>
                                            <Image
                                                source={Stars.fragment}
                                                style={styles.revealIcon}
                                                resizeMode="contain"
                                            />
                                            <Text style={styles.revealText}>
                                                +{spinReward.amount} Star Fragments
                                            </Text>
                                        </>
                                    ) : (
                                        <>
                                            <Image
                                                source={getIngredientArt(spinReward.id)}
                                                style={styles.revealIcon}
                                                resizeMode="contain"
                                            />
                                            <Text style={styles.revealText}>
                                                {ingredientLabel(spinReward.id)} ×{spinReward.qty}
                                            </Text>
                                        </>
                                    )}
                                </Animated.View>
                                <TouchableOpacity
                                    style={styles.spinCloseButton}
                                    onPress={closeSpinModal}
                                >
                                    <Text style={styles.spinCloseText}>NICE</Text>
                                </TouchableOpacity>
                            </>
                        )}
                    </View>
                </View>
            </Modal>
        </ZoomOutOverlay>
    );
};

const styles = StyleSheet.create({
    bg: { flex: 1, width: '100%', height: '100%' },
    topBar: {
        paddingHorizontal: 16,
        paddingTop: 8,
        paddingBottom: 4,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    spinBackdrop: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.6)',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
    },
    spinCard: {
        backgroundColor: '#f5eed6',
        borderWidth: 3,
        borderColor: '#3a2a1a',
        padding: 20,
        alignItems: 'center',
        minWidth: 320,
        maxWidth: 380,
    },
    spinTitle: {
        fontFamily: 'PressStart2P',
        fontSize: 14,
        color: '#3a2a1a',
        marginBottom: 12,
    },
    spinPoolLabel: {
        fontFamily: '04b03',
        fontSize: 12,
        color: '#5a4a3a',
        marginBottom: 6,
    },
    spinPoolGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        justifyContent: 'center',
        marginBottom: 14,
        maxWidth: 340,
    },
    spinPoolTile: {
        width: 44,
        height: 44,
        borderWidth: 2,
        backgroundColor: '#fdfaee',
        margin: 3,
        alignItems: 'center',
        justifyContent: 'center',
    },
    spinPoolIcon: {
        width: 28,
        height: 28,
    },
    spinPoolText: {
        fontFamily: '04b03',
        fontSize: 9,
        color: '#3a2a1a',
        marginTop: -2,
    },
    reelViewport: {
        height: REEL_TILE_SIZE + 16,
        width: REEL_TILE_SIZE * 3 + REEL_TILE_GAP * 2 + 8,
        overflow: 'hidden',
        borderWidth: 2,
        borderColor: '#3a2a1a',
        backgroundColor: '#fdfaee',
        marginBottom: 10,
        justifyContent: 'center',
    },
    reelPointer: {
        position: 'absolute',
        top: 0,
        bottom: 0,
        left: '50%',
        marginLeft: -1,
        width: 2,
        backgroundColor: '#FF9800',
        zIndex: 2,
    },
    reelTrack: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: REEL_TILE_GAP / 2,
    },
    reelTile: {
        width: REEL_TILE_SIZE,
        height: REEL_TILE_SIZE,
        borderWidth: 2,
        backgroundColor: '#f5eed6',
        marginHorizontal: REEL_TILE_GAP / 2,
        alignItems: 'center',
        justifyContent: 'center',
    },
    reelTileIcon: {
        width: 48,
        height: 48,
    },
    reelTileText: {
        fontFamily: '04b03',
        fontSize: 12,
        color: '#3a2a1a',
        marginTop: 2,
    },
    spinStatus: {
        fontFamily: 'PressStart2P',
        fontSize: 11,
        color: '#3a2a1a',
        marginBottom: 10,
    },
    revealTile: {
        width: 140,
        height: 140,
        borderWidth: 4,
        backgroundColor: '#fdfaee',
        alignItems: 'center',
        justifyContent: 'center',
        marginVertical: 10,
        shadowColor: '#FF9800',
        shadowOffset: { width: 0, height: 0 },
        shadowRadius: 18,
        elevation: 8,
    },
    revealIcon: {
        width: 72,
        height: 72,
    },
    revealText: {
        fontFamily: '04b03',
        fontSize: 13,
        color: '#3a2a1a',
        marginTop: 6,
        textAlign: 'center',
        paddingHorizontal: 4,
    },
    spinRewardRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 18,
    },
    spinRewardIcon: {
        width: 48,
        height: 48,
        marginRight: 10,
    },
    spinRewardText: {
        fontFamily: '04b03',
        fontSize: 16,
        color: '#3a2a1a',
    },
    spinCloseButton: {
        backgroundColor: '#9ed5c5',
        borderWidth: 2,
        borderColor: '#3a2a1a',
        paddingHorizontal: 18,
        paddingVertical: 8,
        marginTop: 6,
    },
    spinCloseText: {
        fontFamily: 'PressStart2P',
        fontSize: 11,
        color: '#3a2a1a',
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
    },
    balanceRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 8,
        backgroundColor: 'rgba(255, 255, 255, 0.9)',
        borderWidth: 2,
        borderColor: '#003300',
        padding: 10,
        borderTopColor: '#006600',
        borderLeftColor: '#006600',
        borderRightColor: '#001100',
        borderBottomColor: '#001100',
    },
    balanceIcon: {
        width: 32,
        height: 32,
    },
    dustTextContainer: {
        alignItems: 'flex-end',
    },
    dustAmount: {
        fontSize: 16,
        fontWeight: 'bold',
        color: '#003300',
        textAlign: 'right',
    },
    walletLabel: {
        fontSize: 12,
        color: '#666',
        textAlign: 'right',
        marginBottom: 2,
    },
    walletSubLabel: {
        fontSize: 10,
        color: '#a85d00',
        textAlign: 'right',
        marginTop: 2,
    },
    tabNavigation: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: 8,
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
        fontSize: 12,
        fontWeight: 'bold',
        color: '#003300',
    },
    itemsContainer: {
        borderWidth: 3,
        borderColor: '#003300',
        backgroundColor: '#f6fff6',
        padding: 8,
        borderTopColor: '#001100',
        borderLeftColor: '#001100',
        borderRightColor: '#006600',
        borderBottomColor: '#006600',
    },
    section: {
        marginBottom: 12,
    },
    sectionHeader: {
        fontSize: 12,
        fontWeight: 'bold',
        color: '#003300',
        marginBottom: 6,
        paddingBottom: 2,
        borderBottomWidth: 1,
        borderBottomColor: '#003300',
    },
    sectionGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        justifyContent: 'flex-start',
    },
    itemCard: {
        width: '31%',
        marginRight: '2.33%',
        height: 140,
        borderWidth: 3,
        borderColor: '#003300',
        backgroundColor: '#f0fff0',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 6,
        marginBottom: 8,
    },
    itemClickArea: {
        flex: 1,
        width: '100%',
        alignItems: 'center',
        justifyContent: 'center',
    },
    itemImage: {
        width: 44,
        height: 44,
        marginBottom: 4,
    },
    pile: {
        width: 44,
        height: 44,
        marginBottom: 4,
        position: 'relative',
    },
    pileStar: {
        position: 'absolute',
    },
    itemName: {
        fontSize: 10,
        fontWeight: 'bold',
        marginBottom: 2,
        textAlign: 'center',
        color: '#003300',
    },
    itemDuration: {
        fontSize: 8,
        color: '#7a3b00',
        marginBottom: 2,
    },
    itemSummary: {
        fontSize: 8,
        color: '#406040',
        textAlign: 'center',
        marginBottom: 4,
    },
    disabledItem: {
        opacity: 0.55,
    },
    disabledText: {
        color: '#999999',
    },
    insufficientText: {
        fontSize: 7,
        fontWeight: 'bold',
        color: '#ff6b6b',
        marginTop: 2,
        textAlign: 'center',
    },
    priceContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(0, 51, 0, 0.1)',
        borderWidth: 1,
        borderColor: '#003300',
        paddingHorizontal: 6,
        paddingVertical: 3,
    },
    priceIcon: {
        width: 12,
        height: 12,
        marginRight: 4,
    },
    cartTotalIcon: {
        width: 14,
        height: 14,
        marginRight: 4,
    },
    itemPrice: {
        fontSize: 10,
        fontWeight: 'bold',
        color: '#003300',
    },
    comingSoonBadge: {
        position: 'absolute',
        top: -4,
        right: -4,
        backgroundColor: '#a85d00',
        paddingHorizontal: 4,
        paddingVertical: 2,
        borderWidth: 1,
        borderColor: '#5a2f00',
    },
    comingSoonText: {
        color: 'white',
        fontSize: 7,
        fontWeight: 'bold',
    },
    flashingCard: {
        backgroundColor: '#e6ffe6',
        shadowColor: '#00ff00',
        shadowOpacity: 0.8,
        shadowRadius: 4,
        elevation: 8,
    },
    cartContainer: {
        marginTop: 8,
        borderWidth: 3,
        borderColor: '#003300',
        backgroundColor: '#f6fff6',
        marginBottom: 8,
        borderTopColor: '#001100',
        borderLeftColor: '#001100',
        borderRightColor: '#006600',
        borderBottomColor: '#006600',
    },
    cartHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: 8,
        borderBottomWidth: 2,
        borderBottomColor: '#003300',
        backgroundColor: '#e9f5e9',
    },
    cartHeaderRight: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    cartTitle: {
        fontSize: 12,
        fontWeight: 'bold',
        color: '#003300',
    },
    cartTotal: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    cartTotalText: {
        fontSize: 12,
        fontWeight: 'bold',
        color: '#003300',
    },
    clearCartButton: {
        backgroundColor: '#ff6b6b',
        borderWidth: 2,
        borderColor: '#cc0000',
        paddingHorizontal: 8,
        paddingVertical: 3,
    },
    clearCartText: {
        fontSize: 10,
        fontWeight: 'bold',
        color: 'white',
    },
    cartItems: {
        padding: 8,
    },
    cartItemsRow: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        alignItems: 'center',
        marginBottom: 8,
    },
    cartItem: {
        alignItems: 'center',
        marginRight: 12,
        marginBottom: 8,
        position: 'relative',
    },
    cartItemImage: {
        width: 40,
        height: 40,
        borderWidth: 2,
        borderColor: '#003300',
        backgroundColor: '#f0fff0',
    },
    cartItemQuantity: {
        fontSize: 10,
        fontWeight: 'bold',
        color: '#003300',
        marginTop: 2,
        textAlign: 'center',
    },
    removeButton: {
        position: 'absolute',
        top: -6,
        right: -6,
        backgroundColor: '#ff6b6b',
        borderRadius: 10,
        width: 16,
        height: 16,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
        borderColor: '#cc0000',
        zIndex: 1,
    },
    removeButtonText: {
        color: 'white',
        fontWeight: 'bold',
        fontSize: 12,
        lineHeight: 10,
    },
    emptyCart: {
        padding: 20,
        alignItems: 'center',
    },
    emptyCartText: {
        fontSize: 12,
        color: '#666',
    },
    checkoutButton: {
        marginTop: 8,
        backgroundColor: '#006600',
        padding: 10,
        alignItems: 'center',
        borderWidth: 2,
        borderColor: '#003300',
        borderTopColor: '#00aa00',
        borderLeftColor: '#00aa00',
        borderRightColor: '#004400',
        borderBottomColor: '#002200',
    },
    checkoutButtonText: {
        color: 'white',
        fontWeight: 'bold',
        fontSize: 12,
    },
});

export default Shop;
