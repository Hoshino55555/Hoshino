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
import ConfirmPurchaseModal from './ConfirmPurchaseModal';
import SpinModal, {
    REEL_TILES,
    REEL_STEP,
    findReelIndex,
    computeLandingTranslateX,
    type SpinPhase,
} from './SpinModal';
import IAPPurchaseModal from './IAPPurchaseModal';
import { newRequestId } from '../../services/requestId';
import { colors, terminalGreen, fonts } from '../../styles/tokens';
import { scrollClipperFill } from '../../styles/primitives';

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
            contentTopPadding: bannerShadow * 1.06,
            contentBottomPadding: bottomBar * 1.15,
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

    const stopReelAndReveal = useCallback((reward: DailySpinReward) => {
        if (reelLoopRef.current) {
            reelLoopRef.current.stop();
            reelLoopRef.current = null;
        }
        // Match the server reward to its REEL_TILES index and compute the
        // exact translateX that puts that tile under the pointer. Snap the
        // reel one full cycle ahead of the target so the decel animation
        // always travels a known distance regardless of where the loop
        // happened to stop — the snap is masked by the fast spin motion.
        const rewardIndex = findReelIndex(reward);
        const targetX = computeLandingTranslateX(rewardIndex, 2);
        const startX = targetX + REEL_STEP * REEL_TILES.length;
        reelTranslateX.setValue(startX);
        // Deceleration: one last partial sweep with ease-out so the reel
        // glides to a stop on the matching tile.
        const decel = Animated.timing(reelTranslateX, {
            toValue: targetX,
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
            stopReelAndReveal(res.reward);
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
        // Tint wash: when set, layers a tinted copy of item.image at
        // tintOpacity (default 0.55) on top of the original. tintColor
        // flattens the overlay to a single hue but respects alpha, so the
        // wash hits only the artwork silhouette. The original underneath
        // bleeds through and shifts the perceived hue (purple → blue, etc.)
        // without the flat-silhouette look pure tintColor produces.
        tintColor?: string;
        tintOpacity?: number;
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
            tintColor,
            tintOpacity = 0.55,
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
                            {tintColor ? (
                                <Image
                                    source={item.image}
                                    style={[
                                        imageStyle ?? styles.itemImage,
                                        styles.tintOverlay,
                                        { tintColor, opacity: tintOpacity },
                                    ]}
                                    resizeMode="contain"
                                />
                            ) : null}
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
            setConfirmItem(null);
            runNextReveal();
        } catch (err: any) {
            setConfirmItem(null);
            onNotification?.(err?.message || 'Checkout failed.', 'error');
            await refreshBalance();
        } finally {
            setPurchasing(false);
        }
    };

    const handleConfirmPurchase = () => {
        const item = confirmItem;
        if (!item) return;
        // Leave the confirm modal mounted so its "Processing…" button shows
        // through the network roundtrip — closeConfirmThenReveal hands off
        // to the reveal modal in a single render so the user never sees a
        // blank frame.
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
                <Text style={[styles.itemPrice, { color: ready ? colors.forestDark : colors.inkText }]}>
                    {ready ? 'FREE' : 'SOLD OUT'}
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
            tintColor: '#3a6dd6',
            tintOpacity: 0.55,
            priceNode: (
                <Text style={[styles.itemPrice, { color: colors.forestDark }]}>FREE</Text>
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
        return renderCardShell({
            item,
            title: item.name,
            description: item.summary || '',
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
        const overlay = locked ? (
            <View style={styles.comingSoonBadge}>
                <Text style={styles.comingSoonText}>COMING SOON</Text>
            </View>
        ) : null;
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
                <View style={scrollClipperFill}>
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
            <SpinModal
                phase={spinPhase}
                reward={spinReward}
                reelTranslateX={reelTranslateX}
                revealScale={revealScale}
                revealGlow={revealGlow}
                onClose={closeSpinModal}
            />
            <IAPPurchaseModal
                item={iapItem}
                token={iapToken}
                onSelectToken={setIapToken}
                purchasing={iapPurchasing}
                signerConnected={!!signer}
                walletSource={walletSource}
                publicKey={publicKey}
                onCancel={handleIAPCancel}
                onPurchase={handleIAPPurchase}
                onFiatTopUp={handleFiatTopUp}
            />
            <ConfirmPurchaseModal
                item={confirmItem}
                purchasing={purchasing}
                onCancel={() => {
                    if (purchasing) return;
                    setConfirmItem(null);
                }}
                onConfirm={handleConfirmPurchase}
            />
        </View>
    );
};

const styles = StyleSheet.create({
    root: {
        flex: 1,
        backgroundColor: colors.purpleBg,
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
        borderColor: colors.black,
        padding: 10,
    },
    balanceIcon: {
        width: 32,
        height: 32,
    },
    dustTextContainer: {
        alignItems: 'flex-end',
    },
    dustAmount: {
        fontFamily: fonts.body,
        fontSize: 30,
        color: terminalGreen.bgMid,
        textAlign: 'right',
    },
    walletLabel: {
        fontFamily: fonts.body,
        fontSize: 21,
        color: colors.inkText,
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
        backgroundColor: colors.mintPale,
        borderColor: colors.black,
        borderWidth: 2,
        paddingVertical: 8,
        alignItems: 'center',
    },
    activeTab: {
        backgroundColor: '#b8e6b8',
    },
    tabButtonText: {
        fontFamily: fonts.body,
        fontSize: 24,
        color: terminalGreen.bgMid,
    },
    itemsContainer: {
        borderWidth: 3,
        borderColor: colors.black,
        backgroundColor: colors.mintPale,
        padding: 8,
    },
    section: {
        marginBottom: 12,
    },
    sectionHeader: {
        fontFamily: fonts.body,
        fontSize: 24,
        color: terminalGreen.bgMid,
        marginBottom: 6,
        paddingBottom: 2,
        borderBottomWidth: 1,
        borderBottomColor: terminalGreen.bgMid,
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
        paddingTop: 7,
    },
    cardHeaderIngredient: {
        height: 32,
        paddingTop: 6,
    },
    ingredientBoxTitle: {
        fontFamily: fonts.body,
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
    tintOverlay: {
        marginTop: -66,
    },
    itemName: {
        fontFamily: fonts.body,
        fontSize: 21,
        lineHeight: 14,
        textAlign: 'center',
        color: '#2e2014',
    },
    itemRank: {
        fontFamily: fonts.body,
        fontSize: 18,
        lineHeight: 8,
        textAlign: 'center',
        color: '#2e2014',
        marginTop: -1,
    },
    itemSummary: {
        fontFamily: fonts.body,
        fontSize: 18,
        lineHeight: 13,
        color: colors.slotInk,
        textAlign: 'center',
        marginTop: 2,
        paddingHorizontal: 2,
    },
    disabledItem: {
        opacity: 0.55,
    },
    disabledText: {
        color: colors.inkText,
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
        fontFamily: fonts.body,
        fontSize: 21,
        color: terminalGreen.bgMid,
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
        fontFamily: fonts.body,
        color: 'white',
        fontSize: 15,
    },
    flashingCard: {
        backgroundColor: colors.mintPale,
        shadowColor: '#00ff00',
        shadowOpacity: 0.8,
        shadowRadius: 4,
        elevation: 8,
    },
});

export default Shop;
