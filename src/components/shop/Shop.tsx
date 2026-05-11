import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
    View,
    Text,
    TouchableOpacity,
    StyleSheet,
    ScrollView,
    Image,
    ImageBackground,
    Animated,
    Easing,
    useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Modal } from 'react-native';
import FooterBackBar from '../chrome/FooterBackBar';
import PageArtShell from '../chrome/PageArtShell';
import { MarketplaceItem, ItemRarity } from '../../services/MarketplaceService';
import StarFragmentService, {
    type DailySpinReward,
    type ServerCaps,
    type ServerCapLimits,
    type ActiveCamp,
    type CampId,
    type CartLine,
    type IngredientBoxId,
} from '../../services/StarFragmentService';
import { ingredientLabel } from '../../services/RecipeCatalog';
import { getIngredientArt } from '../../assets';
import { useWallet } from '../../contexts/WalletContext';
import { Connection } from '@solana/web3.js';
import IAPService, {
    type IAPPaymentToken,
    type IAPSkuId,
} from '../../services/IAPService';
import { useFundSolanaWallet } from '@privy-io/expo/ui';
import { Backgrounds, Stars, Frames } from '../../assets';
import {
    SHOP_TABS,
    type ShopTab,
    type ShopItem,
    itemsForTab,
    groupBySubcategory,
} from '../../data/shopCatalog';
import { INGREDIENT_TIER } from '../../services/RecipeCatalog';
import { ItemCategory } from '../../services/MarketplaceService';
import { useGameStateContext } from '../../contexts/GameStateContext';
import type { BoosterSkuId } from '../../services/GameStateService';
import BoxRevealModal, { type BoxReveal } from './BoxRevealModal';
import { newRequestId } from '../../services/requestId';
import { colors } from '../../styles/tokens';

// Per-line dispatch result. Drives the post-checkout reveal queue:
// boxes open via BoxRevealModal (TCG pack-style), spin replays the reel
// animation, instants accumulate into a single summary toast.
type LineResult =
    | { kind: 'spin' }
    | { kind: 'box'; reveal: BoxReveal }
    | { kind: 'instant'; line: string };

const BOOSTER_SKU_IDS = new Set<BoosterSkuId>([
    'booster-mood',
    'booster-sleep',
    'booster-hunger',
]);
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

// Wallet address fed to StarFragmentService when the user isn't connected,
// so local balances persist across the same profile pre-Privy.
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
// Spin reel renders three REEL_TILES copies stitched together so the
// translate animation never visibly wraps. Hoist the spread once so the
// 30-element array isn't rebuilt every render while the modal is open.
const REEL_TRACK_TILES: ReelTile[] = [...REEL_TILES, ...REEL_TILES, ...REEL_TILES];

// IAP payment token selector — three fixed options. Module scope so the
// `.map` source isn't a new array literal on every render.
const IAP_TOKENS: IAPPaymentToken[] = ['SOL', 'USDC', 'SKR'];

const formatCooldown = (ms: number) => {
    if (ms <= 0) return 'Ready';
    const h = Math.floor(ms / 3_600_000);
    const m = Math.floor((ms % 3_600_000) / 60_000);
    const s = Math.floor((ms % 60_000) / 1000);
    if (h > 0) return `${h}h ${m}m`;
    if (m > 0) return `${m}m ${s}s`;
    return `${s}s`;
};

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

const Shop: React.FC<ShopProps> = ({ connection, onNotification, onClose, onItemsPurchased }) => {
    const insets = useSafeAreaInsets();
    const { publicKey, walletSource, signer } = useWallet();
    const { width: screenWidth } = useWindowDimensions();
    // Banner is 1200×773, shadow is 1200×790 (sits BEHIND the banner so its
    // bottom 17px peeks out as a soft fade over scroll content), bottom strip
    // is 1200×284 with the shadow baked into its top edge. Memoized as one
    // object so all five derived dims live on a single screenWidth dep.
    const { bannerReserve, bannerShadowReserve, bottomBarReserve, contentTopPadding, contentBottomPadding } = useMemo(() => {
        const banner = screenWidth * (773 / 1200);
        const bannerShadow = screenWidth * (790 / 1200);
        const bottomBar = screenWidth * (284 / 1200);
        return {
            bannerReserve: banner,
            bannerShadowReserve: bannerShadow,
            bottomBarReserve: bottomBar,
            contentTopPadding: bannerShadow * 1.01,
            contentBottomPadding: bottomBar * 0.96,
        };
    }, [screenWidth]);

    const walletKey = publicKey ?? FALLBACK_WALLET;
    const starFragmentService = useMemo(() => new StarFragmentService(connection), [connection]);
    const { refreshPantry } = useGameStateContext();

    const [selectedTab, setSelectedTab] = useState<ShopTab>('deals');
    const [balance, setBalance] = useState<number>(0);
    const [confirmItem, setConfirmItem] = useState<ShopItem | null>(null);
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
    // IAP modal state — opened directly from a tile tap on iap-pending items
    // (SF packs, season pass, bundles). iapQueue is retained for the reveal
    // chain so a multi-grant SF checkout can defer an IAP modal to the end.
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

    // Re-throws on failure so the reveal queue advances past the spin stage
    // even when the spin fails. Each error path also surfaces a toast
    // directly so the user sees the cause regardless of who's awaiting.
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

    // Walks the post-purchase reveal queue one stage at a time. Called from
    // each stage's close handler so overlays don't stack; populated by
    // purchaseItem via pendingRevealsRef. Stages: spin → box reveals →
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
                onNotification?.('Lunar Pass active — enjoy!', 'success');
            } else if (res.granted?.kind === 'bundle') {
                onNotification?.(`Bundle unlocked — contents pending grant.`, 'success');
            } else {
                onNotification?.('Purchase complete.', 'success');
            }
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

    // Cancel the IAP modal — drops the queue so the user can re-tap the tile
    // to retry. Per-tap purchase, no cart to fall back on.
    const handleIAPCancel = useCallback(() => {
        if (iapPurchasing) return;
        setIapItem(null);
        setIapQueue([]);
    }, [iapPurchasing]);

    useEffect(() => {
        refreshBalance();
    }, [refreshBalance]);

    const sections = useMemo(
        () => groupBySubcategory(itemsForTab(selectedTab)),
        [selectedTab]
    );

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
                        <View
                            style={[
                                styles.cardHeader,
                                // Rarity is the title on ingredient boxes (Common /
                                // Uncommon / Rare); on every other card the rarity
                                // label is dropped so the header collapses and the
                                // item image gets the freed-up vertical space.
                                item.category === ItemCategory.INGREDIENT
                                    ? styles.cardHeaderIngredient
                                    : styles.cardHeaderCompact,
                            ]}
                        >
                            {item.category === ItemCategory.INGREDIENT ? (
                                <Text style={styles.ingredientBoxTitle} numberOfLines={1}>
                                    {rarityLabel(item.rarity)}
                                </Text>
                            ) : title ? (
                                <Text style={styles.itemName} numberOfLines={1}>{title}</Text>
                            ) : null}
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

    // Tap → validate → open confirm modal (or IAP modal directly for paid
    // SKUs, since their token-pick modal is already a confirm step). One
    // purchase per tap; no cart accumulation.
    const requestPurchase = (item: ShopItem) => {
        if (item.status === 'effect-pending') {
            onNotification?.("Coming soon — this item's effect is being wired up.", 'info');
            return;
        }
        // Per-SKU "already-active / cooldown" guards. Server is source of
        // truth; surfacing here gives an immediate explanation instead of a
        // failed roundtrip.
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

        if (item.currency === 'starFragments' && item.priceStarFragments > balance) {
            onNotification?.(
                `Not enough Shards — need ${item.priceStarFragments}, have ${balance}.`,
                'error'
            );
            return;
        }

        setFlashingItem(item.id);
        setTimeout(() => setFlashingItem(null), 300);

        if (item.currency === 'usd') {
            // IAP modal handles its own confirmation (token select + Buy).
            setIapItem(item);
            return;
        }

        setConfirmItem(item);
    };

    // Project a single ShopItem into the server's CartLine shape. Unknown
    // SKUs throw so a stale catalog entry surfaces immediately instead of
    // silently dropping a line the user paid for.
    const buildCheckoutLine = (item: ShopItem): CartLine => {
        const id = item.id;
        if (id in INGREDIENT_TIER) {
            return { kind: 'ingredients', counts: { [id]: 1 } };
        }
        if (id.startsWith('box-ingredients-')) {
            return { kind: 'box', boxId: id as IngredientBoxId, qty: 1 };
        }
        if (id === 'upgrade-carry') return { kind: 'upgrade-carry' };
        if (id === 'upgrade-inventory') return { kind: 'upgrade-inventory' };
        if (id === 'sleeping-camp') return { kind: 'camp', campId: 'sleeping-camp' };
        if (id === 'hackathon-special') return { kind: 'hackathon' };
        if (BOOSTER_SKU_IDS.has(id as BoosterSkuId)) {
            return { kind: 'booster', skuId: id, qty: 1 };
        }
        throw new Error(`Unknown SF SKU: ${id}`);
    };

    // Single-item purchase. Daily-spin keeps its dedicated callable (the
    // reel animation owns its UX); IAP items never reach here (their modal
    // handles purchase directly). Everything else runs through the atomic
    // checkoutStarFragments resolver — same one the cart used, just with a
    // one-line array.
    const purchaseItem = async (item: ShopItem) => {
        if (purchasing) return;

        // Daily spin: free + animated. Skip checkout, queue the spin reveal.
        if (item.id === 'daily-spin') {
            pendingRevealsRef.current = {
                spin: true,
                boxes: [],
                instants: [],
                iapItems: [],
                purchased: [],
            };
            runNextReveal();
            return;
        }

        let line: CartLine;
        try {
            line = buildCheckoutLine(item);
        } catch (err: any) {
            onNotification?.(err?.message || 'Unknown item.', 'error');
            return;
        }

        setPurchasing(true);
        const lineResults: LineResult[] = [];
        const purchased: MarketplaceItem[] = [];

        try {
            const res = await starFragmentService.checkout(
                [line],
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
            purchased.push(toMarketplace(item));

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
                lineResults.push({
                    kind: 'box',
                    reveal: {
                        itemName: item.name,
                        image: item.image,
                        granted: box.granted,
                    },
                });
            }
            if (res.granted.upgrades.carryCap !== undefined) {
                lineResults.push({
                    kind: 'instant',
                    line: `${item.name} → ${res.granted.upgrades.carryCap}`,
                });
            }
            if (res.granted.upgrades.inventoryCap !== undefined) {
                lineResults.push({
                    kind: 'instant',
                    line: `${item.name} → ${res.granted.upgrades.inventoryCap}`,
                });
            }
            if (res.granted.activeCamp) {
                lineResults.push({
                    kind: 'instant',
                    line: `${item.name} active — boost engaged`,
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
                for (const qty of Object.values(res.granted.boosters)) {
                    const noun = qty === 1 ? 'charge' : 'charges';
                    parts.push(`${item.name} ×${qty} ${noun}`);
                }
                lineResults.push({
                    kind: 'instant',
                    line: `${parts.join(' · ')} — use from inventory`,
                });
            }

            pendingRevealsRef.current = {
                spin: false,
                boxes: lineResults.flatMap((r) => (r.kind === 'box' ? [r.reveal] : [])),
                instants: lineResults.flatMap((r) =>
                    r.kind === 'instant' ? [r.line] : []
                ),
                iapItems: [],
                purchased,
            };
            runNextReveal();
        } catch (err: any) {
            onNotification?.(err?.message || 'Checkout failed.', 'error');
            await refreshBalance();
        } finally {
            setPurchasing(false);
        }
    };

    const handleConfirmPurchase = () => {
        const item = confirmItem;
        setConfirmItem(null);
        if (!item) return;
        purchaseItem(item);
    };

    const renderDailySpinCard = (item: ShopItem) => {
        const remainingMs = Math.max(0, spinNextAtMs - Date.now());
        const ready = spinAvailable || remainingMs === 0;
        return renderCardShell({
            item,
            title: item.name,
            description: ready ? 'Tap to spin!' : `Next: ${formatCooldown(remainingMs)}`,
            disabled: !ready || spinning,
            onPress: () => requestPurchase(item),
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
            onPress: () => requestPurchase(item),
            priceNode: (
                <Text style={[styles.itemPrice, { color: '#2e5a3e' }]}>FREE</Text>
            ),
        });

    const renderBoxCard = (item: ShopItem) => {
        const insufficient = balance < item.priceStarFragments;
        return renderCardShell({
            item,
            title: '',
            description: item.summary,
            disabled: insufficient,
            onPress: () => requestPurchase(item),
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
        const insufficient = balance < item.priceStarFragments;
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
            onPress: () => requestPurchase(item),
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
        const insufficient = !isActive && balance < item.priceStarFragments;
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
            onPress: () => requestPurchase(item),
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
        const insufficient =
            !locked && item.currency === 'starFragments' && item.priceStarFragments > balance;
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
            onPress: () => requestPurchase(item),
            priceNode,
            overlay,
            flashing: flashingItem === item.id,
        });
    };

    // PageArtShell is memoized — passing a new overlays array reference each
    // render would bust its memo. Keyed on the three reserve dims (which
    // themselves only change with screenWidth).
    const shellOverlays = useMemo(
        () => [
            { key: 'bottom', source: Backgrounds.shopBottom, edge: 'bottom' as const, height: bottomBarReserve },
            { key: 'banner-shadow', source: Backgrounds.shopBannerShadow, edge: 'top' as const, height: bannerShadowReserve },
            { key: 'banner', source: Backgrounds.shopBanner, edge: 'top' as const, height: bannerReserve },
        ],
        [bottomBarReserve, bannerShadowReserve, bannerReserve],
    );

    return (
        <View style={styles.root}>
            <PageArtShell
                background={Backgrounds.shop}
                testID="shop-screen"
                overlays={shellOverlays}
            >
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
                            paddingTop: contentTopPadding,
                            paddingBottom: contentBottomPadding,
                        },
                    ]}
                    showsVerticalScrollIndicator={false}
                >
                    <View style={styles.balanceRow}>
                        <Image source={Stars.fragment} style={styles.balanceIcon} resizeMode="contain" />
                        <View style={styles.dustTextContainer}>
                            <Text style={styles.walletLabel}>WALLET</Text>
                            <Text style={styles.dustAmount}>{balance} Shards</Text>
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

                </ScrollView>
                </View>

                <FooterBackBar
                    onBack={onClose}
                    height={bottomBarReserve}
                    bottomInset={insets.bottom}
                />
            </PageArtShell>
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
                                        {REEL_TRACK_TILES.map((t, i) => (
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
                            {IAP_TOKENS.map((tk) => (
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
            <Modal
                visible={confirmItem !== null}
                transparent
                animationType="fade"
                onRequestClose={() => setConfirmItem(null)}
            >
                <View style={styles.confirmBackdrop}>
                    <View style={styles.confirmCard}>
                        <Text style={styles.confirmTitle}>{confirmItem?.name}</Text>
                        {confirmItem?.summary ? (
                            <Text style={styles.confirmSummary}>{confirmItem.summary}</Text>
                        ) : null}
                        <View style={styles.confirmPriceRow}>
                            {confirmItem?.id === 'daily-spin' ||
                            confirmItem?.id === 'hackathon-special' ? (
                                <Text style={styles.confirmPrice}>FREE</Text>
                            ) : (
                                <>
                                    <Image
                                        source={Stars.fragment}
                                        style={styles.confirmPriceIcon}
                                        resizeMode="contain"
                                    />
                                    <Text style={styles.confirmPrice}>
                                        {confirmItem?.priceStarFragments ?? 0}
                                    </Text>
                                </>
                            )}
                        </View>
                        <View style={styles.confirmButtonRow}>
                            <TouchableOpacity
                                style={[styles.confirmBtn, styles.confirmCancelBtn]}
                                onPress={() => setConfirmItem(null)}
                                disabled={purchasing}
                            >
                                <Text style={styles.confirmBtnText}>Cancel</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={[
                                    styles.confirmBtn,
                                    styles.confirmBuyBtn,
                                    purchasing && styles.confirmBtnDisabled,
                                ]}
                                onPress={handleConfirmPurchase}
                                disabled={purchasing}
                            >
                                <Text style={[styles.confirmBtnText, styles.confirmBuyBtnText]}>
                                    {purchasing ? 'Processing…' : 'Buy'}
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
    root: {
        flex: 1,
        backgroundColor: colors.purpleBg,
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
        fontSize: 18,
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
        fontSize: 24,
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
    scrollClipper: {
        position: 'absolute',
        left: 0,
        right: 0,
        overflow: 'hidden',
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
        fontSize: 24,
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
        fontSize: 24,
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
    cardHeaderCompact: {
        height: 22,
    },
    cardHeaderIngredient: {
        height: 32,
        paddingTop: 8,
    },
    ingredientBoxTitle: {
        fontFamily: 'Monaco',
        fontSize: 24,
        lineHeight: 18,
        textAlign: 'center',
        color: '#2e2014',
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
        width: 64,
        height: 64,
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
        fontSize: 18,
        lineHeight: 8,
        textAlign: 'center',
        color: '#2e2014',
        marginTop: -1,
    },
    itemSummary: {
        fontFamily: 'Monaco',
        fontSize: 18,
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
    confirmBackdrop: {
        flex: 1,
        backgroundColor: 'rgba(0, 0, 0, 0.65)',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 24,
    },
    confirmCard: {
        width: '100%',
        maxWidth: 360,
        backgroundColor: '#f6fff6',
        borderWidth: 3,
        borderColor: '#003300',
        borderTopColor: '#006600',
        borderLeftColor: '#006600',
        borderRightColor: '#001100',
        borderBottomColor: '#001100',
        padding: 18,
        alignItems: 'center',
    },
    confirmTitle: {
        fontFamily: 'Monaco',
        fontSize: 30,
        color: '#003300',
        textAlign: 'center',
        marginBottom: 6,
    },
    confirmSummary: {
        fontFamily: 'Monaco',
        fontSize: 21,
        color: '#3a2a1a',
        textAlign: 'center',
        marginBottom: 10,
    },
    confirmPriceRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 16,
    },
    confirmPriceIcon: {
        width: 22,
        height: 22,
        marginRight: 6,
    },
    confirmPrice: {
        fontFamily: 'Monaco',
        fontSize: 33,
        color: '#003300',
    },
    confirmButtonRow: {
        flexDirection: 'row',
        gap: 8,
        width: '100%',
    },
    confirmBtn: {
        flex: 1,
        paddingVertical: 12,
        alignItems: 'center',
        borderWidth: 2,
    },
    confirmCancelBtn: {
        backgroundColor: '#dbf3db',
        borderColor: '#003300',
    },
    confirmBuyBtn: {
        backgroundColor: '#006600',
        borderColor: '#003300',
        borderTopColor: '#00aa00',
        borderLeftColor: '#00aa00',
        borderRightColor: '#004400',
        borderBottomColor: '#002200',
    },
    confirmBtnDisabled: {
        opacity: 0.5,
    },
    confirmBtnText: {
        fontFamily: 'Monaco',
        fontSize: 24,
        color: '#003300',
    },
    confirmBuyBtnText: {
        color: '#fff',
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
        backgroundColor: colors.purpleBg,
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
        backgroundColor: colors.purpleBg,
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
    iapTopUpText: { color: '#FFD54F', fontFamily: 'Monaco', fontSize: 24 },
});

export default Shop;
