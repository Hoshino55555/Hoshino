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
import StarFragmentService, {
    type DailySpinReward,
    type ServerCaps,
    type ServerCapLimits,
    type ActiveCamp,
    type CampId,
    type CartLine,
    type IngredientBoxId,
} from '../services/StarFragmentService';
import { ingredientLabel } from '../services/RecipeCatalog';
import { getIngredientArt } from '../assets';
import { useWallet } from '../contexts/WalletContext';
import { Connection } from '@solana/web3.js';
import IAPService, {
    type IAPPaymentToken,
    type IAPSkuId,
} from '../services/IAPService';
import { useFundSolanaWallet } from '@privy-io/expo/ui';
import { Backgrounds, Stars, Frames } from '../assets';
import {
    SHOP_TABS,
    type ShopTab,
    type ShopItem,
    itemsForTab,
    groupBySubcategory,
} from '../data/shopCatalog';
import { INGREDIENT_TIER } from '../services/RecipeCatalog';
import { useGameStateContext } from '../contexts/GameStateContext';
import type { BoosterSkuId } from '../services/GameStateService';
import BoxRevealModal, { type BoxReveal } from './BoxRevealModal';

// Per-line dispatch result. Drives the post-checkout reveal queue:
// boxes open via BoxRevealModal (TCG pack-style), spin replays the reel
// animation, instants accumulate into a single summary toast.
type LineResult =
    | { kind: 'spin' }
    | { kind: 'box'; reveal: BoxReveal }
    | { kind: 'instant'; line: string };

// Per-tap idempotency token. Server validates `[A-Za-z0-9_-]{1,128}` and
// dedups inside a Firestore tx so retries / double-taps don't double-spend.
const newRequestId = (prefix: string) =>
    `${prefix}-${Date.now().toString(36)}-${Math.random()
        .toString(36)
        .slice(2, 10)}`;

const BOOSTER_SKU_IDS = new Set<BoosterSkuId>([
    'booster-mood',
    'booster-sleep',
    'booster-hunger',
]);
// Cart qty rule. Stackable SKUs go through a single qty-aware callable
// (boosters, ingredients) or loop a per-unit callable (ingredient boxes).
// SF packs and IAP bundles become qty>=N in Phase 3 (cart-shaped IAP intents).
const isStackableSku = (item: ShopItem): boolean => {
    if (item.id.startsWith('box-ingredients-')) return true;
    if (item.id in INGREDIENT_TIER) return true;
    if (BOOSTER_SKU_IDS.has(item.id as BoosterSkuId)) return true;
    return false;
};

// Catalog ShopItem → onItemsPurchased payload shape. The legacy
// MarketplaceItem fields are a strict subset of ShopItem, so this is a
// straight projection — pulled out as a helper because the cart dispatcher
// and the IAP completion path both need to push into the same `purchased`
// list, one element per cart-line quantity.
const toMarketplace = (item: ShopItem): MarketplaceItem => ({
    id: item.id,
    name: item.name,
    description: item.description,
    imageUrl: item.imageUrl,
    category: item.category,
    rarity: item.rarity,
    priceSOL: item.priceSOL,
    priceStarFragments: item.priceStarFragments,
    inStock: item.inStock,
});

interface ShopProps {
    connection: Connection;
    onNotification?: (message: string, type: 'success' | 'error' | 'info' | 'warning') => void;
    onClose: () => void;
    onItemsPurchased?: (items: MarketplaceItem[]) => void;
}

// Wallet address fed to StarFragmentService when the user isn't connected.
// Matches the placeholder used elsewhere (GameContainer's IngredientSelection)
// so balances persist across the same local profile pre-Privy.
const FALLBACK_WALLET = 'demo-wallet';

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

const Shop: React.FC<ShopProps> = ({ connection, onNotification, onClose, onItemsPurchased }) => {
    const insets = useSafeAreaInsets();
    const { publicKey, walletSource, signer } = useWallet();
    const screenWidth = Dimensions.get('window').width;
    // Banner is 1200×773 (transparent shadow stripped); size to native aspect.
    const bannerReserve = screenWidth * (773 / 1200);
    // Shadow PNG is 1200×790; sits BEHIND the banner so its bottom 17px peaks
    // out below as a soft transparent fade over scroll content.
    const bannerShadowReserve = screenWidth * (790 / 1200);
    // Bottom strip is 1200×284 with the shadow built into its top edge.
    const bottomBarReserve = screenWidth * (284 / 1200);

    const walletKey = publicKey ?? FALLBACK_WALLET;
    const starFragmentService = useMemo(() => new StarFragmentService(connection), [connection]);
    const { refreshPantry } = useGameStateContext();

    const [selectedTab, setSelectedTab] = useState<ShopTab>('consumables');
    const [balance, setBalance] = useState<number>(0);
    const [cart, setCart] = useState<{ item: ShopItem; quantity: number }[]>([]);
    const [flashingItem, setFlashingItem] = useState<string | null>(null);
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
    const [caps, setCaps] = useState<ServerCaps | null>(null);
    const [capLimits, setCapLimits] = useState<ServerCapLimits | null>(null);
    const [activeCamp, setActiveCamp] = useState<ActiveCamp | null>(null);
    // IAP modal state — opened when checkout reaches an iap-pending line
    // (SF packs, season pass, bundles). One modal per item; iapQueue holds
    // the pending ones so we walk them sequentially once SF dispatch is done.
    const [iapItem, setIapItem] = useState<ShopItem | null>(null);
    const [iapQueue, setIapQueue] = useState<ShopItem[]>([]);
    // Reveal queue — populated at the end of dispatch, walked one stage at
    // a time. Each stage's "close" callback flushes the next stage so the
    // player sees spin → boxes → instant summary → IAP modal in order
    // instead of stacked overlays.
    const [revealBoxes, setRevealBoxes] = useState<BoxReveal[]>([]);
    const pendingRevealsRef = useRef<{
        spin: boolean;
        boxes: BoxReveal[];
        instants: string[];
        iapItems: ShopItem[];
        purchased: MarketplaceItem[];
    } | null>(null);
    const [iapToken, setIapToken] = useState<IAPPaymentToken>('USDC');
    const [iapPurchasing, setIapPurchasing] = useState(false);
    const { fundWallet } = useFundSolanaWallet();
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
            if (status.caps) setCaps(status.caps);
            if (status.capLimits) setCapLimits(status.capLimits);
            setActiveCamp(status.activeCamp ?? null);
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

    // Re-throws on failure so the cart dispatcher can leave the line in
    // cart for retry. Each error path also surfaces a toast directly so the
    // user sees the cause regardless of who's awaiting.
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
            throw err;
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

    // Walks the post-checkout reveal queue one stage at a time. Called from
    // each stage's close handler so overlays don't stack; populated by
    // handleCheckout via pendingRevealsRef. Stages: spin → box reveals →
    // instant summary toast → IAP modal walker. The ref lives outside React
    // state so close handlers don't need to be in the render closure.
    const runNextReveal = useCallback(() => {
        const queue = pendingRevealsRef.current;
        if (!queue) return;
        if (queue.spin) {
            queue.spin = false;
            // On success the user taps Continue → closeSpinModal flushes the
            // rest of the queue. On failure handleDailySpin re-throws after
            // toasting, so we flush from the catch side too — otherwise box
            // reveals after a failed spin would never run.
            handleDailySpin().catch(() => runNextReveal());
            return;
        }
        if (queue.boxes.length > 0) {
            const boxes = queue.boxes;
            queue.boxes = [];
            setRevealBoxes(boxes);
            return;
        }
        if (queue.instants.length > 0) {
            const summary = queue.instants.join(' · ');
            queue.instants = [];
            onNotification?.(summary, 'success');
        }
        // SF items report to the parent before IAP starts — IAP items are
        // announced individually by handleIAPPurchase as the modal walks.
        if (queue.purchased.length > 0) {
            onItemsPurchased?.(queue.purchased);
            queue.purchased = [];
        }
        if (queue.iapItems.length > 0) {
            const [first, ...rest] = queue.iapItems;
            queue.iapItems = [];
            setIapQueue(rest);
            setIapItem(first);
            return;
        }
        pendingRevealsRef.current = null;
    }, [handleDailySpin, onNotification, onItemsPurchased]);

    const closeSpinModal = useCallback(() => {
        setSpinPhase('idle');
        setSpinReward(null);
        runNextReveal();
    }, [runNextReveal]);

    const closeBoxReveal = useCallback(() => {
        setRevealBoxes([]);
        runNextReveal();
    }, [runNextReveal]);

    // Default rail: external wallets (MWA/Phantom/Backpack) lean on SKR/SOL,
    // embedded (Privy) defaults to USDC since fiat onramp lands as USDC.
    useEffect(() => {
        if (!iapItem) return;
        setIapToken(walletSource === 'mwa' ? 'SOL' : 'USDC');
    }, [iapItem, walletSource]);

    const handleFiatTopUp = useCallback(async () => {
        if (!publicKey) {
            onNotification?.('Connect a wallet first to top up.', 'warning');
            return;
        }
        try {
            // Onramp cluster must match the cluster the IAP backend is
            // settling on, otherwise USDC lands on the wrong network.
            // EXPO_PUBLIC_IAP_NETWORK should mirror functions IAP_NETWORK.
            const net = process.env.EXPO_PUBLIC_IAP_NETWORK === 'mainnet-beta'
                ? 'mainnet-beta' as const
                : 'devnet' as const;
            await fundWallet({
                address: publicKey,
                asset: 'USDC',
                cluster: { name: net },
            });
        } catch (err: any) {
            onNotification?.(err?.message || 'Top up flow failed', 'error');
        }
    }, [fundWallet, publicKey, onNotification]);

    const handleIAPPurchase = useCallback(async () => {
        if (!iapItem || iapPurchasing) return;
        if (!signer) {
            onNotification?.('Connect a wallet first to make a purchase.', 'warning');
            return;
        }
        setIapPurchasing(true);
        try {
            const res = await IAPService.purchaseSku(
                iapItem.id as IAPSkuId,
                iapToken,
                signer
            );
            if (res.granted?.kind === 'starFragments') {
                setBalance(res.granted.newBalance);
                onNotification?.(
                    `+${res.granted.amount.toLocaleString()} Shards — purchase complete!`,
                    'success'
                );
            } else if (res.granted?.kind === 'seasonPass') {
                onNotification?.('Season Pass active — enjoy!', 'success');
            } else if (res.granted?.kind === 'bundle') {
                onNotification?.(`Bundle unlocked — contents pending grant.`, 'success');
            } else {
                onNotification?.('Purchase complete.', 'success');
            }
            // Drop the carted line + advance to the next IAP item, if any.
            const justPurchasedId = iapItem.id;
            setCart((prev) => prev.filter((c) => c.item.id !== justPurchasedId));
            setIapQueue((prev) => {
                const [next, ...rest] = prev;
                setIapItem(next ?? null);
                return rest;
            });
            await refreshBalance();
        } catch (err: any) {
            onNotification?.(err?.message || 'Purchase failed', 'error');
        } finally {
            setIapPurchasing(false);
        }
    }, [iapItem, iapToken, iapPurchasing, signer, onNotification, refreshBalance]);

    // Cancel the IAP modal — drops the queue so the user can retry from the
    // cart. Cancelled IAP lines stay in cart for retry.
    const handleIAPCancel = useCallback(() => {
        if (iapPurchasing) return;
        setIapItem(null);
        setIapQueue([]);
    }, [iapPurchasing]);

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
        onClose();
    };

    const cartTotal = useMemo(
        () => cart.reduce((sum, c) => sum + c.item.priceStarFragments * c.quantity, 0),
        [cart]
    );
    const cartUsdTotal = useMemo(
        () => cart.reduce((sum, c) => sum + (c.item.priceUsd ?? 0) * c.quantity, 0),
        [cart]
    );
    const remainingBalance = balance - cartTotal;

    const sections = useMemo(
        () => groupBySubcategory(itemsForTab(selectedTab)),
        [selectedTab]
    );

    const getRarityCasing = (rarity: ItemRarity) => {
        switch (rarity) {
            case ItemRarity.COMMON: return Frames.casingCommon;
            case ItemRarity.UNCOMMON: return Frames.casingUncommon;
            case ItemRarity.RARE: return Frames.casingRare;
            case ItemRarity.EPIC: return Frames.casingEpic;
            case ItemRarity.LEGENDARY: return Frames.casingLegendary;
            default: return Frames.casingCommon;
        }
    };

    const rarityLabel = (rarity: ItemRarity): string => {
        switch (rarity) {
            case ItemRarity.COMMON: return 'Common';
            case ItemRarity.UNCOMMON: return 'Uncommon';
            case ItemRarity.RARE: return 'Rare';
            case ItemRarity.EPIC: return 'Epic';
            case ItemRarity.LEGENDARY: return 'Legendary';
            default: return '';
        }
    };

    const renderCardShell = (params: {
        item: ShopItem;
        title: string;
        description?: string | null;
        priceNode: React.ReactNode;
        onPress?: () => void;
        disabled?: boolean;
        imageStyle?: any;
        overlay?: React.ReactNode;
        flashing?: boolean;
        testID?: string;
    }) => {
        const {
            item,
            title,
            description,
            priceNode,
            onPress,
            disabled,
            imageStyle,
            overlay,
            flashing,
            testID,
        } = params;
        return (
            <TouchableOpacity
                key={item.id}
                style={[styles.itemCard, flashing && styles.flashingCard]}
                onPress={onPress}
                disabled={!onPress || disabled}
                activeOpacity={0.85}
                testID={testID}
            >
                <ImageBackground
                    source={getRarityCasing(item.rarity)}
                    style={styles.cardCasing}
                    imageStyle={styles.cardCasingImage}
                    resizeMode="stretch"
                >
                    <View style={[styles.cardInner, disabled && styles.disabledItem]}>
                        <View style={styles.cardHeader}>
                            {title ? (
                                <Text style={styles.itemName} numberOfLines={1}>{title}</Text>
                            ) : null}
                            <Text style={styles.itemRank} numberOfLines={1}>
                                {rarityLabel(item.rarity)}
                            </Text>
                        </View>
                        <View style={styles.cardMiddle}>
                            <Image
                                source={item.image}
                                style={imageStyle ?? styles.itemImage}
                                resizeMode="contain"
                            />
                            {description ? (
                                <Text style={styles.itemSummary} numberOfLines={2}>
                                    {description}
                                </Text>
                            ) : null}
                        </View>
                        <View style={styles.cardFooter}>{priceNode}</View>
                    </View>
                    {overlay}
                </ImageBackground>
            </TouchableOpacity>
        );
    };

    const addToCart = (item: ShopItem) => {
        if (item.status === 'effect-pending') {
            onNotification?.("Coming soon — this item's effect is being wired up.", 'info');
            return;
        }
        // Per-SKU "already-active / cooldown" guards. Server is source of
        // truth, but surfacing here stops the cart from queueing an
        // obviously-failing line.
        if (
            item.id === 'sleeping-camp' &&
            activeCamp &&
            activeCamp.expiresAtMs > Date.now()
        ) {
            onNotification?.('A camp is already active.', 'info');
            return;
        }
        if (item.id === 'daily-spin' && !spinAvailable) {
            onNotification?.('Daily spin is on cooldown.', 'info');
            return;
        }
        if (
            (item.id === 'upgrade-carry' || item.id === 'upgrade-inventory') &&
            caps && capLimits
        ) {
            const cur = item.id === 'upgrade-carry' ? caps.carryCap : caps.inventoryCap;
            const max =
                item.id === 'upgrade-carry'
                    ? capLimits.carryCapMax
                    : capLimits.inventoryCapMax;
            if (cur >= max) {
                onNotification?.('Already at max.', 'info');
                return;
            }
        }

        const stackable = isStackableSku(item);
        const existing = cart.find((c) => c.item.id === item.id);
        if (existing && !stackable) {
            onNotification?.('Already in cart.', 'info');
            return;
        }

        // Balance check applies only to SF-priced items. IAP items are
        // paid in USD at checkout, so they don't reserve SF balance.
        if (item.currency === 'starFragments') {
            const projected = cartTotal + item.priceStarFragments;
            if (projected > balance) {
                onNotification?.(
                    `Not enough Shards — need ${projected}, have ${balance}.`,
                    'error'
                );
                return;
            }
        }

        setCart((prev) => {
            const found = prev.find((c) => c.item.id === item.id);
            if (found) {
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

    // Project the SF cart into the server's CartLine shape. Loose
    // ingredients collapse into a single 'ingredients' line; everything else
    // maps 1:1 onto a typed line kind. Unknown SKUs throw so a stale catalog
    // entry surfaces immediately instead of silently dropping a line the
    // user paid for.
    const buildCheckoutLines = (
        cartItems: { item: ShopItem; quantity: number }[]
    ): CartLine[] => {
        const ingredientCounts: Record<string, number> = {};
        const lines: CartLine[] = [];
        for (const c of cartItems) {
            const id = c.item.id;
            if (id in INGREDIENT_TIER) {
                ingredientCounts[id] = (ingredientCounts[id] || 0) + c.quantity;
            } else if (id.startsWith('box-ingredients-')) {
                lines.push({
                    kind: 'box',
                    boxId: id as IngredientBoxId,
                    qty: c.quantity,
                });
            } else if (id === 'upgrade-carry') {
                lines.push({ kind: 'upgrade-carry' });
            } else if (id === 'upgrade-inventory') {
                lines.push({ kind: 'upgrade-inventory' });
            } else if (id === 'sleeping-camp') {
                lines.push({ kind: 'camp', campId: 'sleeping-camp' });
            } else if (id === 'hackathon-special') {
                lines.push({ kind: 'hackathon' });
            } else if (BOOSTER_SKU_IDS.has(id as BoosterSkuId)) {
                lines.push({ kind: 'booster', skuId: id, qty: c.quantity });
            } else {
                throw new Error(`Unknown SF SKU: ${id}`);
            }
        }
        if (Object.keys(ingredientCounts).length > 0) {
            lines.push({ kind: 'ingredients', counts: ingredientCounts });
        }
        return lines;
    };

    const handleCheckout = async () => {
        if (purchasing) return;
        if (cart.length === 0) {
            onNotification?.('Your cart is empty!', 'warning');
            return;
        }

        // Split the cart by rail. Daily-spin keeps its dedicated callable
        // because the reel animation owns its UX; everything else runs
        // through the atomic checkoutStarFragments resolver. IAP lines walk
        // through the funding modal one at a time post-checkout.
        const sfCart = cart.filter((c) => c.item.currency === 'starFragments');
        const iapLines = cart.filter((c) => c.item.currency === 'usd');
        const spinLines = sfCart.filter((c) => c.item.id === 'daily-spin');
        const checkoutCart = sfCart.filter((c) => c.item.id !== 'daily-spin');

        const sfTotal = checkoutCart.reduce(
            (s, c) => s + c.item.priceStarFragments * c.quantity,
            0
        );
        if (sfTotal > balance) {
            onNotification?.('Insufficient Shards for the SF items in cart.', 'error');
            return;
        }

        setPurchasing(true);
        const succeededIds = new Set<string>();
        const purchased: MarketplaceItem[] = [];
        const lineResults: LineResult[] = [];

        try {
            if (checkoutCart.length > 0) {
                let lines: CartLine[];
                try {
                    lines = buildCheckoutLines(checkoutCart);
                } catch (err: any) {
                    onNotification?.(err?.message || 'Cart contains an unknown item.', 'error');
                    return;
                }

                try {
                    const res = await starFragmentService.checkout(
                        lines,
                        newRequestId('checkout')
                    );
                    setBalance(res.newBalance);
                    if (res.caps) setCaps(res.caps);
                    setActiveCamp(res.activeCamp);
                    if (
                        Object.keys(res.granted.ingredients).length > 0 ||
                        res.granted.boxes.length > 0
                    ) {
                        await refreshPantry();
                    }

                    // Atomic checkout: every line either succeeded or the
                    // whole call threw. Mark everything in checkoutCart as
                    // settled so the cart UI clears those lines.
                    for (const c of checkoutCart) {
                        succeededIds.add(c.item.id);
                        for (let i = 0; i < c.quantity; i++) {
                            purchased.push(toMarketplace(c.item));
                        }
                    }

                    // Build reveal queue in display order. Ingredients first
                    // (single summary toast), then box reveals in cart order,
                    // then the rest as instant toasts.
                    if (Object.keys(res.granted.ingredients).length > 0) {
                        const summary = Object.entries(res.granted.ingredients)
                            .map(([id, n]) => `${ingredientLabel(id)} ×${n}`)
                            .join(', ');
                        lineResults.push({
                            kind: 'instant',
                            line: `Ingredients: ${summary}`,
                        });
                    }
                    for (const box of res.granted.boxes) {
                        const item = checkoutCart.find(
                            (c) => c.item.id === box.boxId
                        )?.item;
                        lineResults.push({
                            kind: 'box',
                            reveal: {
                                itemName: item?.name ?? box.boxId,
                                image: item?.image,
                                granted: box.granted,
                            },
                        });
                    }
                    if (res.granted.upgrades.carryCap !== undefined) {
                        const item = checkoutCart.find(
                            (c) => c.item.id === 'upgrade-carry'
                        )?.item;
                        lineResults.push({
                            kind: 'instant',
                            line: `${item?.name ?? 'Carry Capacity'} → ${res.granted.upgrades.carryCap}`,
                        });
                    }
                    if (res.granted.upgrades.inventoryCap !== undefined) {
                        const item = checkoutCart.find(
                            (c) => c.item.id === 'upgrade-inventory'
                        )?.item;
                        lineResults.push({
                            kind: 'instant',
                            line: `${item?.name ?? 'Inventory Size'} → ${res.granted.upgrades.inventoryCap}`,
                        });
                    }
                    if (res.granted.activeCamp) {
                        const item = checkoutCart.find(
                            (c) => c.item.id === 'sleeping-camp'
                        )?.item;
                        lineResults.push({
                            kind: 'instant',
                            line: `${item?.name ?? 'Camp'} active — boost engaged`,
                        });
                    }
                    if (res.granted.hackathonGranted > 0) {
                        lineResults.push({
                            kind: 'instant',
                            line: `Hackathon Special +${res.granted.hackathonGranted.toLocaleString()} Shards`,
                        });
                    }
                    if (Object.keys(res.granted.boosters).length > 0) {
                        const parts: string[] = [];
                        for (const [skuId, qty] of Object.entries(
                            res.granted.boosters
                        )) {
                            const item = checkoutCart.find(
                                (c) => c.item.id === skuId
                            )?.item;
                            const noun = qty === 1 ? 'charge' : 'charges';
                            parts.push(`${item?.name ?? skuId} ×${qty} ${noun}`);
                        }
                        lineResults.push({
                            kind: 'instant',
                            line: `${parts.join(' · ')} — use from inventory`,
                        });
                    }
                } catch (err: any) {
                    onNotification?.(err?.message || 'Checkout failed.', 'error');
                    await refreshBalance();
                    return;
                }
            }

            // Daily spin always queues post-checkout (free + animated).
            for (const _ of spinLines) {
                succeededIds.add('daily-spin');
                lineResults.push({ kind: 'spin' });
            }

            // Drop succeeded lines from cart before reveals start so the
            // cart UI mirrors what was actually paid for, even if the user
            // dismisses the reveal modals mid-walk.
            if (succeededIds.size > 0) {
                setCart((prev) => prev.filter((c) => !succeededIds.has(c.item.id)));
            }

            // Build the reveal queue. runNextReveal pulls from this ref as
            // each stage closes — the close handlers don't need to re-enter
            // handleCheckout's closure, they just call runNextReveal.
            const expandedIap = iapLines.flatMap((c) =>
                Array.from({ length: c.quantity }, () => c.item)
            );
            pendingRevealsRef.current = {
                spin: lineResults.some((r) => r.kind === 'spin'),
                boxes: lineResults.flatMap((r) => (r.kind === 'box' ? [r.reveal] : [])),
                instants: lineResults.flatMap((r) =>
                    r.kind === 'instant' ? [r.line] : []
                ),
                iapItems: expandedIap,
                purchased,
            };
            runNextReveal();
        } finally {
            setPurchasing(false);
        }
    };

    const renderDailySpinCard = (item: ShopItem) => {
        const remainingMs = Math.max(0, spinNextAtMs - Date.now());
        const ready = spinAvailable || remainingMs === 0;
        return renderCardShell({
            item,
            title: item.name,
            description: ready ? 'Tap to spin!' : `Next: ${formatCooldown(remainingMs)}`,
            disabled: !ready || spinning,
            onPress: () => addToCart(item),
            priceNode: (
                <Text style={[styles.itemPrice, { color: ready ? '#2e5a3e' : '#888' }]}>
                    {ready ? 'FREE' : 'COOLDOWN'}
                </Text>
            ),
        });
    };

    const renderHackathonCard = (item: ShopItem) =>
        renderCardShell({
            item,
            title: item.name,
            description: item.summary,
            onPress: () => addToCart(item),
            priceNode: (
                <Text style={[styles.itemPrice, { color: '#2e5a3e' }]}>FREE</Text>
            ),
        });

    const renderBoxCard = (item: ShopItem) => {
        const insufficient = balance - cartTotal < item.priceStarFragments;
        return renderCardShell({
            item,
            title: '',
            description: item.summary,
            disabled: insufficient,
            onPress: () => addToCart(item),
            imageStyle: styles.boxImage,
            priceNode: (
                <View style={styles.priceContainer}>
                    <Image source={Stars.fragment} style={styles.priceIcon} resizeMode="contain" />
                    <Text style={[styles.itemPrice, insufficient && styles.disabledText]}>
                        {item.priceStarFragments}
                    </Text>
                </View>
            ),
            overlay: insufficient ? (
                <Text style={styles.insufficientOverlay}>INSUFFICIENT</Text>
            ) : null,
        });
    };

    const renderUpgradeCard = (
        item: ShopItem,
        kind: 'carryCap' | 'inventoryCap'
    ) => {
        const current = caps?.[kind] ?? null;
        const max =
            kind === 'carryCap'
                ? capLimits?.carryCapMax ?? null
                : capLimits?.inventoryCapMax ?? null;
        const atMax = current != null && max != null && current >= max;
        const insufficient = balance - cartTotal < item.priceStarFragments;
        const disabled = atMax || insufficient;
        const summary =
            current != null && max != null
                ? `Now ${current}${atMax ? ' (max)' : ` · max ${max}`}`
                : item.summary || '';
        return renderCardShell({
            item,
            title: item.name,
            description: summary,
            disabled,
            onPress: () => addToCart(item),
            priceNode: (
                <View style={styles.priceContainer}>
                    <Image source={Stars.fragment} style={styles.priceIcon} resizeMode="contain" />
                    <Text style={[styles.itemPrice, (insufficient || atMax) && styles.disabledText]}>
                        {atMax ? 'MAX' : item.priceStarFragments}
                    </Text>
                </View>
            ),
            overlay: insufficient && !atMax ? (
                <Text style={styles.insufficientOverlay}>INSUFFICIENT</Text>
            ) : null,
        });
    };

    const renderCampCard = (item: ShopItem, campId: CampId) => {
        const nowMs = Date.now();
        const isActive = !!activeCamp && activeCamp.id === campId && activeCamp.expiresAtMs > nowMs;
        const insufficient = !isActive && balance - cartTotal < item.priceStarFragments;
        const disabled = isActive || insufficient;
        let summary = item.summary || item.description;
        if (isActive) {
            const remainingMs = activeCamp!.expiresAtMs - nowMs;
            const days = Math.floor(remainingMs / 86_400_000);
            const hours = Math.floor((remainingMs % 86_400_000) / 3_600_000);
            summary = days > 0 ? `Active · ${days}d ${hours}h left` : `Active · ${hours}h left`;
        }
        return renderCardShell({
            item,
            title: item.name,
            description: summary,
            disabled,
            onPress: () => addToCart(item),
            priceNode: (
                <View style={styles.priceContainer}>
                    <Image source={Stars.fragment} style={styles.priceIcon} resizeMode="contain" />
                    <Text style={[styles.itemPrice, (insufficient || isActive) && styles.disabledText]}>
                        {isActive ? 'ACTIVE' : item.priceStarFragments}
                    </Text>
                </View>
            ),
            overlay: insufficient && !isActive ? (
                <Text style={styles.insufficientOverlay}>INSUFFICIENT</Text>
            ) : null,
        });
    };

    const renderItemCard = (item: ShopItem) => {
        if (item.id === 'daily-spin') return renderDailySpinCard(item);
        if (item.id === 'hackathon-special') return renderHackathonCard(item);
        if (item.id === 'upgrade-carry') return renderUpgradeCard(item, 'carryCap');
        if (item.id === 'upgrade-inventory') return renderUpgradeCard(item, 'inventoryCap');
        if (item.id === 'sleeping-camp') return renderCampCard(item, 'sleeping-camp');
        if (item.id.startsWith('box-ingredients-')) return renderBoxCard(item);
        // iap-pending now opens the IAP modal (purchasable on devnet); only
        // effect-pending stays as a hard "Coming Soon" lock.
        const isIap = item.status === 'iap-pending';
        const locked = item.status === 'effect-pending';
        const projected = cartTotal + item.priceStarFragments;
        const insufficient =
            !locked && item.currency === 'starFragments' && projected > balance;
        const disabled = locked || insufficient;

        const description = item.durationLabel
            ? `${item.durationLabel}${item.summary ? ` · ${item.summary}` : ''}`
            : item.summary ?? null;
        const priceNode = locked || isIap ? (
            <Text style={styles.itemPrice}>
                {item.priceUsd != null ? `$${item.priceUsd.toFixed(2)}` : 'Coming Soon'}
            </Text>
        ) : (
            <View style={styles.priceContainer}>
                <Image source={Stars.fragment} style={styles.priceIcon} resizeMode="contain" />
                <Text style={[styles.itemPrice, insufficient && styles.disabledText]}>
                    {item.priceStarFragments}
                </Text>
            </View>
        );
        const overlay = (
            <>
                {locked ? (
                    <View style={styles.comingSoonBadge}>
                        <Text style={styles.comingSoonText}>COMING SOON</Text>
                    </View>
                ) : null}
                {insufficient ? (
                    <Text style={styles.insufficientOverlay}>INSUFFICIENT</Text>
                ) : null}
            </>
        );
        return renderCardShell({
            item,
            title: item.name,
            description,
            disabled,
            onPress: () => addToCart(item),
            priceNode,
            overlay,
            flashing: flashingItem === item.id,
        });
    };

    return (
        <View style={{ flex: 1, backgroundColor: '#1a1033' }}>
            <ImageBackground source={Backgrounds.shop} style={styles.bg} resizeMode="cover" testID="shop-screen">
                <View
                    style={[
                        styles.scrollClipper,
                        { top: 0, bottom: 0 },
                    ]}
                >
                <ScrollView
                    contentContainerStyle={[
                        styles.scrollBody,
                        {
                            paddingTop: bannerShadowReserve + 8,
                            paddingBottom: bottomBarReserve - 4,
                        },
                    ]}
                    showsVerticalScrollIndicator={false}
                >
                    <View style={styles.balanceRow}>
                        <Image source={Stars.fragment} style={styles.balanceIcon} resizeMode="contain" />
                        <View style={styles.dustTextContainer}>
                            <Text style={styles.walletLabel}>WALLET</Text>
                            <Text style={styles.dustAmount}>{remainingBalance} Shards</Text>
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
                                {cartTotal > 0 && (
                                    <View style={styles.cartTotal}>
                                        <Image source={Stars.fragment} style={styles.cartTotalIcon} resizeMode="contain" />
                                        <Text style={styles.cartTotalText}>{cartTotal}</Text>
                                    </View>
                                )}
                                {cartUsdTotal > 0 && (
                                    <View style={styles.cartTotal}>
                                        <Text style={styles.cartTotalText}>${cartUsdTotal.toFixed(2)}</Text>
                                    </View>
                                )}
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

                <View
                    pointerEvents="none"
                    style={[styles.shopBottomOverlay, { height: bottomBarReserve }]}
                >
                    <Image
                        source={Backgrounds.shopBottom}
                        style={styles.shopBannerImage}
                        resizeMode="contain"
                    />
                </View>
                <View
                    pointerEvents="none"
                    style={[styles.shopBannerOverlay, { top: 0, height: bannerShadowReserve }]}
                >
                    <Image
                        source={Backgrounds.shopBannerShadow}
                        style={styles.shopBannerImage}
                        resizeMode="contain"
                    />
                </View>
                <View
                    pointerEvents="none"
                    style={[styles.shopBannerOverlay, { top: 0, height: bannerReserve }]}
                >
                    <Image
                        source={Backgrounds.shopBanner}
                        style={styles.shopBannerImage}
                        resizeMode="contain"
                    />
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
                        onPress={handleClose}
                        hitSlop={{ top: 12, right: 12, bottom: 12, left: 12 }}
                    >
                        <Text style={styles.backButtonText}>{'<'} Back</Text>
                    </TouchableOpacity>
                </View>
            </ImageBackground>
            {revealBoxes.length > 0 && (
                <BoxRevealModal boxes={revealBoxes} onClose={closeBoxReveal} />
            )}
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
                                                +{spinReward.amount} Shards
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
            <Modal
                visible={iapItem !== null}
                transparent
                animationType="fade"
                onRequestClose={handleIAPCancel}
            >
                <View style={styles.iapModalBackdrop}>
                    <View style={styles.iapModalCard}>
                        <Text style={styles.iapTitle}>{iapItem?.name}</Text>
                        {iapItem?.summary ? (
                            <Text style={styles.iapSummary}>{iapItem.summary}</Text>
                        ) : null}
                        <Text style={styles.iapPrice}>
                            {iapItem?.priceUsd != null ? `$${iapItem.priceUsd.toFixed(2)} USD` : 'Coming Soon'}
                        </Text>

                        <Text style={styles.iapSectionLabel}>Pay with</Text>
                        <View style={styles.iapRailRow}>
                            {(['SOL', 'USDC', 'SKR'] as IAPPaymentToken[]).map((tk) => (
                                <TouchableOpacity
                                    key={tk}
                                    style={[
                                        styles.iapRailBtn,
                                        iapToken === tk && styles.iapRailBtnActive,
                                    ]}
                                    onPress={() => setIapToken(tk)}
                                    disabled={iapPurchasing}
                                >
                                    <Text
                                        style={[
                                            styles.iapRailText,
                                            iapToken === tk && styles.iapRailTextActive,
                                        ]}
                                    >
                                        {tk}
                                    </Text>
                                </TouchableOpacity>
                            ))}
                        </View>

                        {!signer ? (
                            <Text style={styles.iapNote}>
                                Connect a wallet to purchase. Embedded users can also top up
                                with card via the button below.
                            </Text>
                        ) : (
                            <Text style={styles.iapNote}>
                                Signing wallet: {walletSource ?? 'unknown'} ·{' '}
                                {publicKey ? publicKey.slice(0, 4) + '…' + publicKey.slice(-4) : '—'}
                            </Text>
                        )}

                        {walletSource === 'embedded' && (
                            <TouchableOpacity
                                style={styles.iapTopUpBtn}
                                onPress={handleFiatTopUp}
                                disabled={iapPurchasing}
                            >
                                <Text style={styles.iapTopUpText}>
                                    Top up with card (USDC)
                                </Text>
                            </TouchableOpacity>
                        )}

                        <View style={styles.iapButtonRow}>
                            <TouchableOpacity
                                style={[styles.iapBtn, styles.iapCancelBtn]}
                                onPress={handleIAPCancel}
                                disabled={iapPurchasing}
                            >
                                <Text style={styles.iapBtnText}>Cancel</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={[
                                    styles.iapBtn,
                                    styles.iapBuyBtn,
                                    (!signer || iapPurchasing) && styles.iapBtnDisabled,
                                ]}
                                onPress={handleIAPPurchase}
                                disabled={!signer || iapPurchasing}
                            >
                                <Text style={styles.iapBtnText}>
                                    {iapPurchasing ? 'Processing…' : `Buy with ${iapToken}`}
                                </Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>
        </View>
    );
};

const styles = StyleSheet.create({
    bg: { flex: 1, width: '100%', height: '100%' },
    // Sits on top of the shopBottom strip overlay so the back button stays
    // tappable above the painted strip art. zIndex tops the bottom overlay.
    bottomBar: {
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 0,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'flex-start',
        paddingHorizontal: 16,
        zIndex: 2,
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
        fontFamily: 'Monaco',
        fontSize: 30,
        color: '#3a2a1a',
        marginBottom: 12,
    },
    spinPoolLabel: {
        fontFamily: 'Monaco',
        fontSize: 21,
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
        fontFamily: 'Monaco',
        fontSize: 17,
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
        fontFamily: 'Monaco',
        fontSize: 21,
        color: '#3a2a1a',
        marginTop: 2,
    },
    spinStatus: {
        fontFamily: 'Monaco',
        fontSize: 21,
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
        fontFamily: 'Monaco',
        fontSize: 24,
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
        fontFamily: 'Monaco',
        fontSize: 27,
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
        fontFamily: 'Monaco',
        fontSize: 21,
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
        fontFamily: 'Monaco',
        fontSize: 21,
    },
    scrollClipper: {
        position: 'absolute',
        left: 0,
        right: 0,
        overflow: 'hidden',
    },
    shopBannerOverlay: {
        position: 'absolute',
        left: 0,
        right: 0,
        zIndex: 1,
    },
    shopBottomOverlay: {
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 1,
    },
    shopBannerImage: {
        width: '100%',
        height: '100%',
    },
    // Sized to match the bundle cluster's footprint so the box-card layout
    // (title + summary + price below) lines up identically whether we're
    // showing real box art or the rare-tier bundle fallback.
    boxImage: {
        width: 48,
        height: 48,
        marginBottom: 2,
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
        fontFamily: 'Monaco',
        fontSize: 30,
        color: '#003300',
        textAlign: 'right',
    },
    walletLabel: {
        fontFamily: 'Monaco',
        fontSize: 21,
        color: '#666',
        textAlign: 'right',
        marginBottom: 2,
    },
    walletSubLabel: {
        fontFamily: 'Monaco',
        fontSize: 21,
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
        fontFamily: 'Monaco',
        fontSize: 26,
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
        fontFamily: 'Monaco',
        fontSize: 26,
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
        height: 170,
        marginBottom: 8,
    },
    cardCasing: {
        flex: 1,
        width: '100%',
        height: '100%',
    },
    cardCasingImage: {
        borderRadius: 0,
    },
    cardInner: {
        flex: 1,
        paddingHorizontal: 6,
        paddingTop: 2,
        paddingBottom: 10,
    },
    cardHeader: {
        height: 38,
        alignItems: 'center',
        justifyContent: 'flex-start',
        paddingTop: 4,
    },
    cardMiddle: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        paddingTop: 2,
    },
    cardFooter: {
        height: 26,
        alignItems: 'center',
        justifyContent: 'center',
    },
    itemImage: {
        width: 44,
        height: 44,
        marginBottom: 2,
    },
    itemName: {
        fontFamily: 'Monaco',
        fontSize: 21,
        lineHeight: 14,
        textAlign: 'center',
        color: '#2e2014',
    },
    itemRank: {
        fontFamily: 'Monaco',
        fontSize: 17,
        lineHeight: 8,
        textAlign: 'center',
        color: '#2e2014',
        marginTop: -1,
    },
    itemSummary: {
        fontFamily: 'Monaco',
        fontSize: 17,
        lineHeight: 13,
        color: '#3a2a1a',
        textAlign: 'center',
        marginTop: 2,
        paddingHorizontal: 2,
    },
    disabledItem: {
        opacity: 0.55,
    },
    disabledText: {
        color: '#999999',
    },
    insufficientOverlay: {
        position: 'absolute',
        bottom: 4,
        left: 0,
        right: 0,
        textAlign: 'center',
        fontFamily: 'Monaco',
        fontSize: 14,
        color: '#cc0000',
    },
    priceContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
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
        fontFamily: 'Monaco',
        fontSize: 21,
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
        fontFamily: 'Monaco',
        color: 'white',
        fontSize: 15,
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
        fontFamily: 'Monaco',
        fontSize: 26,
        color: '#003300',
    },
    cartTotal: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    cartTotalText: {
        fontFamily: 'Monaco',
        fontSize: 26,
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
        fontFamily: 'Monaco',
        fontSize: 21,
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
        fontFamily: 'Monaco',
        fontSize: 21,
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
        fontFamily: 'Monaco',
        color: 'white',
        fontSize: 21,
        lineHeight: 10,
    },
    emptyCart: {
        padding: 20,
        alignItems: 'center',
    },
    emptyCartText: {
        fontFamily: 'Monaco',
        fontSize: 21,
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
        fontFamily: 'Monaco',
        color: 'white',
        fontSize: 26,
    },
    iapModalBackdrop: {
        flex: 1,
        backgroundColor: 'rgba(0, 0, 0, 0.7)',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 24,
    },
    iapModalCard: {
        width: '100%',
        maxWidth: 380,
        backgroundColor: '#1a1033',
        borderColor: '#9C27B0',
        borderWidth: 2,
        borderRadius: 12,
        padding: 20,
    },
    iapTitle: {
        fontFamily: 'Monaco',
        color: '#fff',
        fontSize: 33,
        textAlign: 'center',
        marginBottom: 4,
    },
    iapSummary: {
        fontFamily: 'Monaco',
        color: '#cfc4e6',
        fontSize: 24,
        textAlign: 'center',
        marginBottom: 8,
    },
    iapPrice: {
        fontFamily: 'Monaco',
        color: '#FFD54F',
        fontSize: 39,
        textAlign: 'center',
        marginBottom: 16,
    },
    iapSectionLabel: {
        fontFamily: 'Monaco',
        color: '#bba8d6',
        fontSize: 21,
        marginBottom: 6,
        textTransform: 'uppercase',
    },
    iapRailRow: {
        flexDirection: 'row',
        gap: 8,
        marginBottom: 12,
    },
    iapRailBtn: {
        flex: 1,
        paddingVertical: 10,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: '#3d2a5e',
        alignItems: 'center',
    },
    iapRailBtnActive: {
        borderColor: '#FFD54F',
        backgroundColor: '#2a1a4a',
    },
    iapRailText: { color: '#bba8d6', fontFamily: 'Monaco' },
    iapRailTextActive: { color: '#FFD54F' },
    iapNote: {
        fontFamily: 'Monaco',
        color: '#a99fc4',
        fontSize: 21,
        textAlign: 'center',
        marginVertical: 10,
    },
    iapButtonRow: {
        flexDirection: 'row',
        gap: 8,
        marginTop: 12,
    },
    iapBtn: {
        flex: 1,
        paddingVertical: 12,
        borderRadius: 8,
        alignItems: 'center',
    },
    iapCancelBtn: { backgroundColor: '#3d2a5e' },
    iapBuyBtn: { backgroundColor: '#7B3FB8' },
    iapBtnDisabled: { opacity: 0.5 },
    iapBtnText: { color: '#fff', fontFamily: 'Monaco' },
    iapTopUpBtn: {
        marginTop: 8,
        paddingVertical: 10,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: '#FFD54F',
        alignItems: 'center',
    },
    iapTopUpText: { color: '#FFD54F', fontFamily: 'Monaco', fontSize: 26 },
});

export default Shop;
