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
import type { BoosterSkuId } from '../services/GameStateService';

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
const STAT_LABEL: Record<string, string> = {
    mood: 'Mood',
    energy: 'Energy',
    hunger: 'Hunger',
};

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
    const { refreshPantry, applyBooster: applyBoosterCtx, refresh: refreshGameState } = useGameStateContext();

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
    const [upgradingField, setUpgradingField] = useState<'carryCap' | 'inventoryCap' | null>(null);
    const [activeCamp, setActiveCamp] = useState<ActiveCamp | null>(null);
    const [purchasingCampId, setPurchasingCampId] = useState<string | null>(null);
    const campInFlightRef = useRef(false);
    // IAP modal state — opened when user taps an iap-pending SKU (SF packs,
    // season pass, bundles). Picks payment rail then calls IAPService.
    const [iapItem, setIapItem] = useState<ShopItem | null>(null);
    const [iapToken, setIapToken] = useState<IAPPaymentToken>('USDC');
    const [iapPurchasing, setIapPurchasing] = useState(false);
    const [boosterPurchasingId, setBoosterPurchasingId] = useState<string | null>(null);
    // Synchronous double-tap guard — React state updates are async, so two
    // taps inside the same frame both saw boosterPurchasingId === null and
    // could each fire applyBooster, draining 2x SF for one stat bump.
    const boosterInFlightRef = useRef(false);
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
                `Hackathon Special claimed — +${res.granted.toLocaleString()} Shards!`,
                'success'
            );
        } catch (err: any) {
            onNotification?.(err?.message || 'Hackathon claim failed', 'error');
        } finally {
            setClaimingHackathon(false);
        }
    }, [claimingHackathon, starFragmentService, onNotification]);

    // Tracks which box is mid-purchase so we can disable just that card.
    const [openingBoxId, setOpeningBoxId] = useState<string | null>(null);
    const handleBoxPurchase = useCallback(async (item: ShopItem) => {
        if (openingBoxId) return;
        if (balance < item.priceStarFragments) {
            onNotification?.(
                `Not enough Shards — need ${item.priceStarFragments}, have ${balance}.`,
                'error'
            );
            return;
        }
        setOpeningBoxId(item.id);
        try {
            const res = await starFragmentService.purchaseIngredientBox(
                item.id as 'box-ingredients-common' | 'box-ingredients-uncommon' | 'box-ingredients-rare',
                newRequestId('box')
            );
            setBalance(res.newBalance);
            await refreshPantry();
            const summary = Object.entries(res.granted)
                .map(([id, n]) => `${ingredientLabel(id)} ×${n}`)
                .join(', ');
            onNotification?.(`Opened ${item.name} — ${summary}`, 'success');
        } catch (err: any) {
            onNotification?.(err?.message || 'Box open failed', 'error');
        } finally {
            setOpeningBoxId(null);
        }
    }, [openingBoxId, balance, starFragmentService, refreshPantry, onNotification]);

    const handleUpgrade = useCallback(async (
        item: ShopItem,
        kind: 'carryCap' | 'inventoryCap'
    ) => {
        if (upgradingField) return;
        if (balance < item.priceStarFragments) {
            onNotification?.(
                `Not enough Shards — need ${item.priceStarFragments}, have ${balance}.`,
                'error'
            );
            return;
        }
        setUpgradingField(kind);
        try {
            const upgradeReqId = newRequestId('up');
            const res =
                kind === 'carryCap'
                    ? await starFragmentService.upgradeCarryCapacity(upgradeReqId)
                    : await starFragmentService.upgradeInventorySize(upgradeReqId);
            setBalance(res.newBalance);
            setCaps((prev) => ({
                carryCap:
                    kind === 'carryCap'
                        ? (res as { carryCap: number }).carryCap
                        : prev?.carryCap ?? 0,
                inventoryCap:
                    kind === 'inventoryCap'
                        ? (res as { inventoryCap: number }).inventoryCap
                        : prev?.inventoryCap ?? 0,
            }));
            const newValue =
                kind === 'carryCap'
                    ? (res as { carryCap: number }).carryCap
                    : (res as { inventoryCap: number }).inventoryCap;
            onNotification?.(
                `${item.name} upgraded — now ${newValue}`,
                'success'
            );
        } catch (err: any) {
            onNotification?.(err?.message || 'Upgrade failed', 'error');
        } finally {
            setUpgradingField(null);
        }
    }, [upgradingField, balance, starFragmentService, onNotification]);

    const handleCampPurchase = useCallback(async (item: ShopItem, campId: CampId) => {
        if (campInFlightRef.current) return;
        if (activeCamp && activeCamp.expiresAtMs > Date.now()) {
            onNotification?.('A camp is already active.', 'info');
            return;
        }
        if (balance < item.priceStarFragments) {
            onNotification?.(
                `Not enough Shards — need ${item.priceStarFragments}, have ${balance}.`,
                'error'
            );
            return;
        }
        campInFlightRef.current = true;
        setPurchasingCampId(item.id);
        try {
            const res = await starFragmentService.purchaseCamp(
                campId,
                newRequestId('camp')
            );
            setBalance(res.newBalance);
            setActiveCamp(res.activeCamp);
            onNotification?.(`${item.name} active — boost engaged!`, 'success');
        } catch (err: any) {
            onNotification?.(err?.message || 'Camp purchase failed.', 'error');
            await refreshBalance();
        } finally {
            setPurchasingCampId(null);
            campInFlightRef.current = false;
        }
    }, [activeCamp, balance, starFragmentService, onNotification, refreshBalance]);

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
            setIapItem(null);
            await refreshBalance();
        } catch (err: any) {
            onNotification?.(err?.message || 'Purchase failed', 'error');
        } finally {
            setIapPurchasing(false);
        }
    }, [iapItem, iapToken, iapPurchasing, signer, onNotification, refreshBalance]);

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

    const handleBoosterPurchase = useCallback(
        async (item: ShopItem) => {
            if (boosterInFlightRef.current) return;
            if (!BOOSTER_SKU_IDS.has(item.id as BoosterSkuId)) return;
            if (balance < item.priceStarFragments) {
                onNotification?.(
                    `Not enough Shards — need ${item.priceStarFragments}, have ${balance}.`,
                    'error'
                );
                return;
            }
            boosterInFlightRef.current = true;
            setBoosterPurchasingId(item.id);
            const requestId = newRequestId('b');
            try {
                const res = await applyBoosterCtx(item.id as BoosterSkuId, requestId);
                setBalance(res.newBalance);
                const label = STAT_LABEL[res.stat] || res.stat;
                const newVal = res.state[res.stat as 'mood' | 'energy' | 'hunger'];
                onNotification?.(`${label} restored — now ${newVal}/5.`, 'success');
            } catch (err: any) {
                onNotification?.(err?.message || 'Booster failed.', 'error');
                // Server may have committed before throwing on retry/timeout —
                // refresh both wallet and game state so the UI matches truth.
                await Promise.all([refreshBalance(), refreshGameState()]);
            } finally {
                setBoosterPurchasingId(null);
                boosterInFlightRef.current = false;
            }
        },
        [balance, applyBoosterCtx, onNotification, refreshBalance, refreshGameState]
    );

    const addToCart = (item: ShopItem) => {
        if (BOOSTER_SKU_IDS.has(item.id as BoosterSkuId)) {
            void handleBoosterPurchase(item);
            return;
        }
        if (item.status === 'iap-pending') {
            // IAP scaffolding is wired but treasury/SKR are still placeholders;
            // open the rail picker anyway so QA can exercise the flow on devnet.
            setIapItem(item);
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
                `Not enough Shards — need ${projected}, have ${balance}.`,
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
            onNotification?.('Insufficient Shards.', 'error');
            return;
        }

        setPurchasing(true);
        try {
            const result = await starFragmentService.purchaseIngredients(
                ingredientCounts,
                newRequestId('ing')
            );
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
                    <Image source={item.image} style={styles.itemImage} resizeMode="contain" />
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
                <Image source={item.image} style={styles.itemImage} resizeMode="contain" />
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

    const renderBoxCard = (item: ShopItem) => {
        const opening = openingBoxId === item.id;
        const insufficient = balance < item.priceStarFragments;
        const disabled = opening || (openingBoxId !== null && !opening) || insufficient;
        return (
            <View
                key={item.id}
                style={[styles.itemCard, { borderColor: getRarityBorderColor(item.rarity) }]}
            >
                <TouchableOpacity
                    style={[styles.itemClickArea, disabled && styles.disabledItem]}
                    onPress={() => handleBoxPurchase(item)}
                    disabled={disabled}
                >
                    <Image
                        source={item.image}
                        style={styles.boxImage}
                        resizeMode="contain"
                    />

                    <Text style={styles.itemName} numberOfLines={2}>
                        {/* Force the rarity word onto its own line so Common,
                            Uncommon, and Rare all wrap identically — keeps
                            the box cards visually consistent in a row. */}
                        {item.name.replace(' · ', '\n')}
                    </Text>
                    <Text style={styles.itemSummary} numberOfLines={2}>
                        {item.summary}
                    </Text>
                    <View style={styles.priceContainer}>
                        <Image source={Stars.fragment} style={styles.priceIcon} resizeMode="contain" />
                        <Text style={[styles.itemPrice, insufficient && styles.disabledText]}>
                            {opening ? 'OPENING…' : item.priceStarFragments}
                        </Text>
                    </View>
                    {insufficient && !opening && (
                        <Text style={styles.insufficientText}>INSUFFICIENT</Text>
                    )}
                </TouchableOpacity>
            </View>
        );
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
        const upgrading = upgradingField === kind;
        const otherUpgrading = upgradingField !== null && !upgrading;
        const insufficient = balance < item.priceStarFragments;
        const disabled = atMax || upgrading || otherUpgrading || insufficient;
        const summary =
            current != null && max != null
                ? `Now ${current}${atMax ? ' (max)' : ` · max ${max}`}`
                : item.summary || '';
        return (
            <View
                key={item.id}
                style={[styles.itemCard, { borderColor: getRarityBorderColor(item.rarity) }]}
            >
                <TouchableOpacity
                    style={[styles.itemClickArea, disabled && styles.disabledItem]}
                    onPress={() => handleUpgrade(item, kind)}
                    disabled={disabled}
                >
                    <Image source={item.image} style={styles.itemImage} resizeMode="contain" />
                    <Text style={styles.itemName} numberOfLines={2}>
                        {item.name}
                    </Text>
                    <Text style={styles.itemSummary} numberOfLines={2}>
                        {summary}
                    </Text>
                    <View style={styles.priceContainer}>
                        <Image source={Stars.fragment} style={styles.priceIcon} resizeMode="contain" />
                        <Text style={[styles.itemPrice, (insufficient || atMax) && styles.disabledText]}>
                            {upgrading ? '…' : atMax ? 'MAX' : item.priceStarFragments}
                        </Text>
                    </View>
                    {insufficient && !atMax && !upgrading && (
                        <Text style={styles.insufficientText}>INSUFFICIENT</Text>
                    )}
                </TouchableOpacity>
            </View>
        );
    };

    const renderCampCard = (item: ShopItem, campId: CampId) => {
        const nowMs = Date.now();
        const isActive = !!activeCamp && activeCamp.id === campId && activeCamp.expiresAtMs > nowMs;
        const purchasing = purchasingCampId === item.id;
        const insufficient = !isActive && balance < item.priceStarFragments;
        const disabled = isActive || purchasing || insufficient;
        let summary = item.summary || item.description;
        if (isActive) {
            const remainingMs = activeCamp!.expiresAtMs - nowMs;
            const days = Math.floor(remainingMs / 86_400_000);
            const hours = Math.floor((remainingMs % 86_400_000) / 3_600_000);
            summary = days > 0 ? `Active · ${days}d ${hours}h left` : `Active · ${hours}h left`;
        }
        return (
            <View
                key={item.id}
                style={[styles.itemCard, { borderColor: getRarityBorderColor(item.rarity) }]}
            >
                <TouchableOpacity
                    style={[styles.itemClickArea, disabled && styles.disabledItem]}
                    onPress={() => handleCampPurchase(item, campId)}
                    disabled={disabled}
                >
                    <Image source={item.image} style={styles.itemImage} resizeMode="contain" />
                    <Text style={styles.itemName} numberOfLines={2}>{item.name}</Text>
                    <Text style={styles.itemSummary} numberOfLines={2}>{summary}</Text>
                    <View style={styles.priceContainer}>
                        <Image source={Stars.fragment} style={styles.priceIcon} resizeMode="contain" />
                        <Text style={[styles.itemPrice, (insufficient || isActive) && styles.disabledText]}>
                            {purchasing ? '…' : isActive ? 'ACTIVE' : item.priceStarFragments}
                        </Text>
                    </View>
                    {insufficient && !isActive && !purchasing && (
                        <Text style={styles.insufficientText}>INSUFFICIENT</Text>
                    )}
                </TouchableOpacity>
            </View>
        );
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
        const isBooster = BOOSTER_SKU_IDS.has(item.id as BoosterSkuId);
        const boosterBusy = boosterPurchasingId === item.id;
        const otherBoosterBusy = !!boosterPurchasingId && !boosterBusy;
        const projected = isBooster ? item.priceStarFragments : cartTotal + item.priceStarFragments;
        const insufficient =
            !locked && item.currency === 'starFragments' && projected > balance;
        const disabled = locked || insufficient || boosterBusy || otherBoosterBusy;

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
                    disabled={(insufficient && !locked) || boosterBusy || otherBoosterBusy}
                >
                    <Image source={item.image} style={styles.itemImage} resizeMode="contain" />

                    <Text style={[styles.itemName, disabled && styles.disabledText]} numberOfLines={2}>
                        {item.name}
                    </Text>
                    {item.durationLabel ? (
                        <Text style={styles.itemDuration}>{item.durationLabel}</Text>
                    ) : null}
                    {item.summary ? (
                        <Text style={styles.itemSummary} numberOfLines={2}>{item.summary}</Text>
                    ) : null}

                    {locked || isIap ? (
                        <View style={styles.priceContainer}>
                            <Text style={styles.itemPrice}>
                                {item.priceUsd != null ? `$${item.priceUsd.toFixed(2)}` : 'Coming Soon'}
                            </Text>
                        </View>
                    ) : (
                        <View style={styles.priceContainer}>
                            <Image source={Stars.fragment} style={styles.priceIcon} resizeMode="contain" />
                            <Text style={[styles.itemPrice, insufficient && styles.disabledText]}>
                                {boosterBusy ? '…' : item.priceStarFragments}
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
        <View style={{ flex: 1, backgroundColor: '#1a1033' }}>
            <ImageBackground source={Backgrounds.shop} style={styles.bg} resizeMode="cover">
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
                onRequestClose={() => !iapPurchasing && setIapItem(null)}
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
                                onPress={() => !iapPurchasing && setIapItem(null)}
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
        fontSize: 20,
        color: '#3a2a1a',
        marginBottom: 12,
    },
    spinPoolLabel: {
        fontFamily: 'Monaco',
        fontSize: 14,
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
        fontSize: 11,
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
        fontSize: 14,
        color: '#3a2a1a',
        marginTop: 2,
    },
    spinStatus: {
        fontFamily: 'Monaco',
        fontSize: 14,
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
        fontSize: 16,
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
        fontSize: 18,
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
        fontSize: 14,
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
        fontSize: 14,
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
        width: 56,
        height: 56,
        marginBottom: 4,
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
        fontSize: 20,
        color: '#003300',
        textAlign: 'right',
    },
    walletLabel: {
        fontFamily: 'Monaco',
        fontSize: 14,
        color: '#666',
        textAlign: 'right',
        marginBottom: 2,
    },
    walletSubLabel: {
        fontFamily: 'Monaco',
        fontSize: 14,
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
        fontSize: 17,
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
        fontSize: 17,
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
    itemName: {
        fontFamily: 'Monaco',
        fontSize: 14,
        lineHeight: 16,
        // Reserve 2 lines so titles that wrap (e.g. "Common Ingredient Box")
        // line up vertically with shorter titles (e.g. "Rare Ingredient Box")
        // — keeps the price row at the same Y across every card in a row.
        minHeight: 32,
        marginBottom: 2,
        textAlign: 'center',
        color: '#003300',
    },
    itemDuration: {
        fontFamily: 'Monaco',
        fontSize: 12,
        color: '#7a3b00',
        marginBottom: 2,
    },
    itemSummary: {
        fontFamily: 'Monaco',
        fontSize: 12,
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
        fontFamily: 'Monaco',
        fontSize: 11,
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
        fontFamily: 'Monaco',
        fontSize: 14,
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
        fontSize: 10,
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
        fontSize: 17,
        color: '#003300',
    },
    cartTotal: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    cartTotalText: {
        fontFamily: 'Monaco',
        fontSize: 17,
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
        fontSize: 14,
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
        fontSize: 14,
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
        fontSize: 14,
        lineHeight: 10,
    },
    emptyCart: {
        padding: 20,
        alignItems: 'center',
    },
    emptyCartText: {
        fontFamily: 'Monaco',
        fontSize: 14,
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
        fontSize: 17,
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
        fontSize: 22,
        textAlign: 'center',
        marginBottom: 4,
    },
    iapSummary: {
        fontFamily: 'Monaco',
        color: '#cfc4e6',
        fontSize: 16,
        textAlign: 'center',
        marginBottom: 8,
    },
    iapPrice: {
        fontFamily: 'Monaco',
        color: '#FFD54F',
        fontSize: 26,
        textAlign: 'center',
        marginBottom: 16,
    },
    iapSectionLabel: {
        fontFamily: 'Monaco',
        color: '#bba8d6',
        fontSize: 14,
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
        fontSize: 14,
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
    iapTopUpText: { color: '#FFD54F', fontFamily: 'Monaco', fontSize: 17 },
});

export default Shop;
