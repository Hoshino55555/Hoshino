import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { View, Text, Image, ImageBackground, TouchableOpacity, StyleSheet, Animated, Easing, useWindowDimensions } from 'react-native';
import type { ImageStyle } from 'react-native';
import InnerScreen from '../InnerScreen';
import SettingsService, { MenuButton } from '../../services/SettingsService';
import { useGameStateContext } from '../../contexts/GameStateContext';
import ForagePopOut, { computeForageStaggerMs, FORAGE_FLIGHT_MS } from './ForagePopOut';
import type { ForagedItem } from '../../services/GameStateService';
import type { PendingWidgetAction } from '../../types/AppTypes';
import { Backgrounds, Menu, Stars, Frames, Forage, getCharacterAnim } from '../../assets';

const WIDGET_ACTION_TTL_MS = 60_000;

const getImageSource = (imageName: string) => getCharacterAnim(imageName);

// Per-character vertical nudge as a fraction of characterSize. Lifts the
// sprite without touching its GIF — keeps the shared baseline in the asset
// so layout math stays uniform.
const CHARACTER_LIFT_FRACTION: Record<string, number> = {
    ARO: 0.025,
};

const IMAGE_SOURCES = {
    background: Backgrounds.screen,
    feed: Menu.feed,
    chat: Menu.chat,
    games: Menu.games,
    sleep: Menu.sleep,
    shop: Menu.shop,
    inventory: Menu.inventory,
    gallery: Menu.gallery,
    settings: Menu.settings,
} as const;

const MENU_ICON_FOR_NAME = (iconName: string) => {
    switch (iconName) {
        case 'feed': return IMAGE_SOURCES.feed;
        case 'chat': return IMAGE_SOURCES.chat;
        case 'games': return IMAGE_SOURCES.games;
        case 'sleep': return IMAGE_SOURCES.sleep;
        case 'shop': return IMAGE_SOURCES.shop;
        case 'inventory': return IMAGE_SOURCES.inventory;
        case 'gallery': return IMAGE_SOURCES.gallery;
        case 'settings': return IMAGE_SOURCES.settings;
        default: return IMAGE_SOURCES.settings;
    }
};

// Stats bar — 3× ImageBackground frames + 15 star Images. Memoized so a
// foragedItems tick doesn't rebuild this whole subtree; only mood/hunger/
// energy invalidate it.
interface StatsBarProps {
    mood: number;
    hunger: number;
    energy: number;
}
const StatsBar = React.memo(({ mood, hunger, energy }: StatsBarProps) => (
    <>
        <ImageBackground
            source={Frames.statBack}
            style={styles.statItem}
            imageStyle={styles.statBackImage as ImageStyle}
            resizeMode="stretch"
        >
            <Text style={styles.statLabel}>Mood</Text>
            <View style={styles.starContainer}>
                {[0, 1, 2, 3, 4].map((index) => (
                    <Image
                        key={`mood-${index}`}
                        source={index < mood ? Stars.lifeFilled : Stars.lifeEmpty}
                        style={styles.starImage as ImageStyle}
                    />
                ))}
            </View>
        </ImageBackground>
        <ImageBackground
            source={Frames.statBack}
            style={styles.statItem}
            imageStyle={styles.statBackImage as ImageStyle}
            resizeMode="stretch"
        >
            <Text style={styles.statLabel}>Hunger</Text>
            <View style={styles.starContainer}>
                {[0, 1, 2, 3, 4].map((index) => (
                    <Image
                        key={`hunger-${index}`}
                        source={index < hunger ? Stars.lifeFilled : Stars.lifeEmpty}
                        style={styles.starImage as ImageStyle}
                    />
                ))}
            </View>
        </ImageBackground>
        <ImageBackground
            source={Frames.statBack}
            style={styles.statItem}
            imageStyle={styles.statBackImage as ImageStyle}
            resizeMode="stretch"
        >
            <Text style={styles.statLabel}>Energy</Text>
            <View style={styles.starContainer}>
                {[0, 1, 2, 3, 4].map((index) => (
                    <Image
                        key={`energy-${index}`}
                        source={index < energy ? Stars.lifeFilled : Stars.lifeEmpty}
                        style={styles.starImage as ImageStyle}
                    />
                ))}
            </View>
        </ImageBackground>
    </>
));
StatsBar.displayName = 'StatsBar';

interface Character {
    id: string;
    name: string;
    description: string;
    image: string;
    nftMint?: string | null;
}

interface Props {
    selectedCharacter: Character | null;
    onSelectCharacter: () => void;
    onFeed?: () => void;
    connected: boolean;
    walletAddress?: string;
    playerName?: string;
    onRefreshNFTs?: () => void;
    onNotification?: (message: string, type: 'success' | 'error' | 'info' | 'warning') => void;
    onArcade?: () => void;
    onSleepRequest?: () => void;
    onShop?: () => void;
    onInventory?: () => void;
    onChat?: () => void;
    onBack?: () => void;
    onSettings?: () => void;
    onGallery?: () => void;
    // Transition animation control
    shouldFadeIn?: boolean;
    onFadeInComplete?: () => void;
    // Set by App when a hoshino:// deep link wants this screen to do
    // something on entry (currently forage-drain from a widget tap). We
    // consume it once gameState is ready, then notify the parent so the
    // action doesn't fire again on a re-mount. Validation against the
    // current character + TTL happens here, not in App.
    pendingWidgetAction?: PendingWidgetAction | null;
    onWidgetActionConsumed?: () => void;
}

const MoonokoInteraction: React.FC<Props> = ({
    selectedCharacter,
    onFeed,
    onNotification,
    onShop,
    onInventory,
    onChat,
    onSettings,
    onGallery,
    onArcade,
    onSleepRequest,
    shouldFadeIn = false,
    onFadeInComplete,
    pendingWidgetAction = null,
    onWidgetActionConsumed,
}) => {
    const { state: gameState, drainForaged } = useGameStateContext();
    // Sizes that used to be hardcoded dp (character sprite, badge offsets,
    // menu icons, row paddings) are derived from the live window dimensions
    // here so the screen survives Android Display-Size scaling. Values are
    // ratios tuned against Seeker's default scale (400dp wide × 890dp tall):
    //   - character ≈ 62% of screen width or 42% of height, whichever fits
    //   - exclamation badge floats ~40% of character height above the head
    //   - menu icons follow width and height so wider aspect ratios do not
    //     blow up the controls relative to the character stage
    const { width: winW, height: winH } = useWindowDimensions();
    // Shrink rendered sprites so Zaniah (the tallest) doesn't crowd the menu.
    // Math: Zaniah's feet sit at canvas y=1011 of 1024; Aro's pre-baseline-shift
    // feet sat at y=959. Scaling 959/1011 lifts the feet to that prior-Aro
    // position. The head stays anchored because we compensate marginTop by
    // half the size delta — without that, shrinking would also re-center the
    // canvas and pull the head down.
    const CHARACTER_SCALE = 959 / 1011;
    const baseCharacterSize = Math.min(winW * 0.62, winH * 0.42);
    const characterSize = baseCharacterSize * CHARACTER_SCALE;
    const characterMarginTop =
        -baseCharacterSize * 0.48 + (characterSize - baseCharacterSize) / 2;
    const badgeOffset = -characterSize * 0.5;
    const characterIdKey = selectedCharacter?.image.split('.')[0]?.toUpperCase() ?? '';
    const characterLift = (CHARACTER_LIFT_FRACTION[characterIdKey] ?? 0) * characterSize;
    const badgeFontSize = Math.min(winW * 0.13, winH * 0.065);
    const menuIconSize = Math.min(winW * 0.10, winH * 0.052);
    const menuIconHitSize = menuIconSize * 1.36;
    const moodVal = gameState?.mood ?? 3;
    const hungerVal = gameState?.hunger ?? 5;
    const energyVal = gameState?.energy ?? 3;
    // Sleep-tagged finds are surfaced through the Morning Recap modal, not the
    // standard forage pop-out — splitting here keeps the daytime tap path
    // unchanged while preventing a duplicate animation right after wake.
    const pendingFinds = useMemo(
        () => (gameState?.foragedItems ?? []).filter((f) => f.source !== 'sleep'),
        [gameState?.foragedItems],
    );
    const hasPendingFinds = pendingFinds.length > 0;

    const [popOutItems, setPopOutItems] = useState<ForagedItem[] | null>(null);
    // Flips true once the per-item squeeze sequence finishes — i.e. every
    // item has been ejected. Bag rendering hides on this so the bag
    // visibly disappears the moment it's "empty," even though
    // popOutItems is still set while the items finish their arcs.
    const [bagEmpty, setBagEmpty] = useState(false);
    const drainInFlightRef = useRef(false);

    const handleCharacterLongPress = useCallback(() => {
        if (!__DEV__) return;
        if (popOutItems) return;
        const tiers: Array<{
            ingredients: string[];
            tier: ForagedItem['tier'];
            weight: number;
        }> = [
            {
                tier: 'common',
                weight: 4,
                ingredients: ['egg', 'lettuce', 'potato', 'rice', 'carrot'],
            },
            {
                tier: 'uncommon',
                weight: 3,
                ingredients: ['banana', 'strawberry', 'tomato', 'tofu', 'oat', 'bread'],
            },
            {
                tier: 'rare',
                weight: 2,
                ingredients: ['bacon', 'milk', 'tuna', 'gouda'],
            },
            {
                tier: 'ultra_rare',
                weight: 1,
                ingredients: ['star_dust'],
            },
        ];
        const totalWeight = tiers.reduce((s, t) => s + t.weight, 0);
        const pickTier = () => {
            let r = Math.random() * totalWeight;
            for (const t of tiers) {
                r -= t.weight;
                if (r <= 0) return t;
            }
            return tiers[0];
        };
        const count = 50;
        const now = Date.now();
        const fake: ForagedItem[] = Array.from({ length: count }, (_, i) => {
            const t = pickTier();
            const ingredient =
                t.ingredients[Math.floor(Math.random() * t.ingredients.length)];
            return {
                id: `dev-${now}-${i}`,
                ingredient,
                tier: t.tier,
                tickMs: now,
                slot: i,
                source: 'awake',
            };
        });
        setPopOutItems(fake);
    }, [popOutItems]);

    const handleCharacterPress = useCallback(() => {
        if (drainInFlightRef.current || popOutItems) return;
        if (!hasPendingFinds) return;
        // Play the animation immediately from the cached finds — the drain
        // call still flushes the server queue, but the pop-out no longer
        // waits on a round trip (+ inventory refetch) before starting.
        setPopOutItems(pendingFinds);
        drainInFlightRef.current = true;
        drainForaged()
            .catch((e: any) => {
                const raw = e?.message || '';
                // Firebase Functions coerces uncaught server throws to the
                // bare code "internal" — surface a friendly fallback rather
                // than that opaque string.
                const friendly =
                    !raw || raw.toLowerCase() === 'internal'
                        ? "Couldn't collect finds — try again in a moment"
                        : raw;
                onNotification?.(friendly, 'error');
                // Clear the optimistic items on failure. Otherwise, if
                // ForagePopOut unmounts before its onComplete fires (e.g. the
                // user navigates into Inventory mid-animation), its cleanup
                // [ForagePopOut.tsx:113] clears the completion timer and
                // popOutItems stays set forever — the character tap then
                // perma-rejects (`if (popOutItems) return`) until the whole
                // component remounts. Cutting the animation short here is
                // visually OK because the toast already explains the failure.
                setPopOutItems(null);
            })
            .finally(() => {
                drainInFlightRef.current = false;
            });
    }, [popOutItems, hasPendingFinds, pendingFinds, drainForaged, onNotification]);

    // Widget deep-link → auto-drain. Wait until gameState has resolved so
    // foragedItems is real, then validate the action targets the active
    // character and is fresh before invoking the same press handler the
    // in-screen tap uses. Stale or mismatched actions are silently dropped.
    useEffect(() => {
        if (!pendingWidgetAction || pendingWidgetAction.type !== 'forage-drain') return;
        if (!gameState) return;
        if (pendingWidgetAction.characterId !== gameState.characterId) {
            // Different character active than the one the widget tap was
            // bound to — drop the action without draining anyone's finds.
            onWidgetActionConsumed?.();
            return;
        }
        if (Date.now() - pendingWidgetAction.setAt > WIDGET_ACTION_TTL_MS) {
            // Stale intent — likely a deep link that survived in OS state
            // longer than expected. Don't drain on a minutes-old tap.
            onWidgetActionConsumed?.();
            return;
        }
        if (hasPendingFinds && !drainInFlightRef.current && !popOutItems) {
            handleCharacterPress();
        }
        onWidgetActionConsumed?.();
    }, [pendingWidgetAction, gameState, hasPendingFinds, popOutItems, handleCharacterPress, onWidgetActionConsumed]);

    // Arcade + individual games are App-level views now (see App.tsx
    // renderContent). Tapping the games menu button calls onArcade which
    // routes through the App-level iris transition like every other page.
    // Sleep is also App-level — SleepController in App.tsx owns the
    // start/end sleep callables, the alarm scheduling, the SleepScreen
    // overlay, and the morning recap modal. Tapping the sleep menu button
    // just calls onSleepRequest, which opens the App-owned confirmation
    // modal.
    const [isTransitioning, setIsTransitioning] = useState(true);
    const [transitionOpacity, setTransitionOpacity] = useState(1);

    // Fade in animation when component mounts (only if shouldFadeIn is true)
    useEffect(() => {
        if (shouldFadeIn) {
            // Start with full opacity and fade in
            setTransitionOpacity(1);
            setIsTransitioning(true);
            
            // Choppy fade in animation (5-6 layers, 0.5s apart)
            const fadeInSteps = [1.0, 0.8, 0.6, 0.4, 0.2, 0.0];
            fadeInSteps.forEach((opacity, index) => {
                setTimeout(() => {
                    setTransitionOpacity(opacity);
                }, index * 500);
            });
            
            // End transition after fade in and reset the flag
            setTimeout(() => {
                setIsTransitioning(false);
                setTransitionOpacity(0);
                // Reset the fade-in flag so it doesn't trigger on subsequent navigations
                if (shouldFadeIn && onFadeInComplete) {
                    onFadeInComplete();
                }
            }, fadeInSteps.length * 500);
        } else {
            // No transition needed, start with normal opacity
            setIsTransitioning(false);
            setTransitionOpacity(0);
        }
    }, [shouldFadeIn]);

    const [menuButtons, setMenuButtons] = useState<MenuButton[]>([]);
    const [selectedMenuIndex, setSelectedMenuIndex] = useState(0);
    const [settingsService] = useState(() => SettingsService.getInstance());
    const [menuBarLayout, setMenuBarLayout] = useState({ x: 0, y: 0, width: 0, height: 0 });
    const excBobAnim = useRef(new Animated.Value(0)).current;
    const bagSqueezeAnim = useRef(new Animated.Value(0)).current;
    const bagFadeAnim = useRef(new Animated.Value(1)).current;

    // Exclamation float — matches ARO-anim.gif cadence (7 frames × 300ms =
    // 2100ms cycle). Frame y-offsets in source-px: [0, +12, 0, 0, 0, -13, 0]
    // (baseline → dip → 3× rest → peak → baseline). Snapped, not eased, to
    // match the gif's stepped motion. Scaled to ~3dp amplitude for the badge.
    useEffect(() => {
        const FRAME_MS = 300;
        const frames = [0, 3, 0, 0, 0, -3, 0];
        const seq = Animated.sequence(
            frames.flatMap((y) => [
                Animated.timing(excBobAnim, {
                    toValue: y,
                    duration: 0,
                    useNativeDriver: true,
                }),
                Animated.delay(FRAME_MS),
            ])
        );
        const loop = Animated.loop(seq);
        loop.start();
        return () => loop.stop();
    }, [excBobAnim]);

    // One squeeze per item: the bag pulses N times (N = items spilling),
    // each pulse synced to the same staggerMs ForagePopOut uses to launch
    // items. After the last pulse, wait for that final item to finish its
    // flight and land on the ground, then fade the bag out — the bag
    // stays in the foreground throughout the spill, then dissolves once
    // the spill is visually done.
    const BAG_FADE_MS = 360;
    useEffect(() => {
        bagSqueezeAnim.setValue(0);
        bagFadeAnim.setValue(1);
        if (!popOutItems || popOutItems.length === 0) {
            setBagEmpty(true);
            return;
        }
        setBagEmpty(false);
        // Each pulse: snap squish (in), quick release (out). Total cycle
        // length = staggerMs so pulse N fires alongside item-launch N.
        // staggerMs is derived from item count so total spill stays ~constant
        // regardless of queue length — bag stays visible long enough on
        // small drops, doesn't drag forever on big ones.
        // Split: ~40% squish, 60% release — release feels less robotic
        // when it slightly lags the next squish's leading edge.
        const staggerMs = computeForageStaggerMs(popOutItems.length);
        const squishMs = Math.max(20, Math.round(staggerMs * 0.4));
        const releaseMs = Math.max(20, staggerMs - squishMs);
        const seq = Animated.sequence(
            popOutItems.map(() =>
                Animated.sequence([
                    Animated.timing(bagSqueezeAnim, {
                        toValue: 1,
                        duration: squishMs,
                        easing: Easing.in(Easing.quad),
                        useNativeDriver: true,
                    }),
                    Animated.timing(bagSqueezeAnim, {
                        toValue: 0,
                        duration: releaseMs,
                        easing: Easing.out(Easing.quad),
                        useNativeDriver: true,
                    }),
                ])
            )
        );
        // The last item launches when its squish starts — i.e. at
        // (length-1)*staggerMs from the squeeze start, finishing flight
        // FORAGE_FLIGHT_MS later. The squeeze sequence itself ends at
        // length*staggerMs. Fire the fade when the last item lands; if
        // that's before the squeeze ends (large drops where flight <
        // staggerMs), fall back to squeeze end so the final pulse plays.
        let fadeTimer: ReturnType<typeof setTimeout> | null = null;
        let fadeAnim: Animated.CompositeAnimation | null = null;
        seq.start();
        const lastLandingMs = Math.max(
            popOutItems.length * staggerMs,
            (popOutItems.length - 1) * staggerMs + FORAGE_FLIGHT_MS,
        );
        fadeTimer = setTimeout(() => {
            fadeAnim = Animated.timing(bagFadeAnim, {
                toValue: 0,
                duration: BAG_FADE_MS,
                useNativeDriver: true,
            });
            fadeAnim.start(({ finished }) => {
                if (finished) setBagEmpty(true);
            });
        }, lastLandingMs);
        return () => {
            seq.stop();
            if (fadeTimer) clearTimeout(fadeTimer);
            fadeAnim?.stop();
        };
    }, [popOutItems, bagSqueezeAnim, bagFadeAnim]);

    // The three center buttons act as a cursor controller for the menu grid:
    // left/right move a highlight across the rendered menu icons, and the
    // center button activates the highlighted icon. Direct icon taps still
    // work — this is an alternate input path for one-handed / physical-button
    // use without overriding the existing tap UX.
    const moveLeft = useCallback(() => {
        setSelectedMenuIndex((i) => {
            const len = menuButtons.length;
            if (len === 0) return i;
            return ((i - 1) % len + len) % len;
        });
    }, [menuButtons.length]);

    const moveRight = useCallback(() => {
        setSelectedMenuIndex((i) => {
            const len = menuButtons.length;
            if (len === 0) return i;
            return ((i + 1) % len + len) % len;
        });
    }, [menuButtons.length]);

    // Handle menu button actions
    const handleMenuButtonAction = useCallback(async (action: string) => {
        if (!selectedCharacter && action !== 'settings' && action !== 'shop') {
            onNotification?.('❌ Please select a character first', 'error');
            return;
        }

        switch (action) {
            case 'feed':
                onFeed?.();
                break;

            case 'sleep':
                // SleepController owns the sleep flow. The menu just opens
                // the App-level confirmation modal; if the moonoko is
                // already sleeping, SleepController's auto-routing has
                // already moved us to the 'sleep' route, so this branch
                // is unreachable while sleeping.
                onSleepRequest?.();
                break;

            case 'shop':
                onShop?.();
                break;

            case 'inventory':
                onInventory?.();
                break;

            case 'chat':
                onChat?.();
                break;

            case 'games':
                onArcade?.();
                break;

            case 'gallery':
                onGallery?.();
                break;

            case 'settings':
                onSettings?.();
                break;

            default:
                onNotification?.(`Unknown action: ${action}`, 'error');
        }
    }, [selectedCharacter, onFeed, onSleepRequest, onShop, onInventory, onChat, onArcade, onGallery, onSettings, onNotification]);

    const confirmSelection = useCallback(() => {
        const btn = menuButtons[selectedMenuIndex];
        if (btn) handleMenuButtonAction(btn.action);
    }, [menuButtons, selectedMenuIndex, handleMenuButtonAction]);

    // Load menu buttons from settings
    useEffect(() => {
        const loadMenuButtons = async () => {
            await settingsService.initialize();
            const buttons = settingsService.getMenuButtons();
            setMenuButtons(buttons);
        };
        loadMenuButtons();
    }, [settingsService]);

    // Keep the selection cursor inside bounds if the menu list shrinks
    // (e.g. user disabled a button in Settings).
    useEffect(() => {
        if (menuButtons.length > 0 && selectedMenuIndex >= menuButtons.length) {
            setSelectedMenuIndex(0);
        }
    }, [menuButtons.length, selectedMenuIndex]);

    // Stabilize callbacks passed to child components so they don't force
    // re-renders. onLayout only stores the first measurement (see body),
    // so memoizing with [] is safe.
    const handlePopOutComplete = useCallback(() => setPopOutItems(null), []);
    const handleMenuBarLayout = useCallback((e: { nativeEvent: { layout: { x: number; y: number; width: number; height: number } } }) => {
        const next = e.nativeEvent.layout;
        setMenuBarLayout(prev => (prev.width === 0 ? next : prev));
    }, []);

    // Render menu button. `index` is the absolute position in `menuButtons`
    // (not the slice index) so the selection highlight matches the cursor.
    const renderMenuButton = useCallback((button: MenuButton, index: number) => {
        const iconSource = MENU_ICON_FOR_NAME(button.icon);
        const isSelected = index === selectedMenuIndex;

        return (
            <View
                key={button.id}
                style={styles.menuIcon}
                testID={`menu-${button.action}`}
            >
                <Image
                    source={isSelected ? Frames.iconSelect : Frames.iconSelectDim}
                    style={[
                        styles.menuIconSelectImage as ImageStyle,
                        { width: menuIconHitSize, height: menuIconHitSize },
                    ]}
                    resizeMode="stretch"
                />

                <Image
                    source={iconSource}
                    style={[
                        styles.menuImage as ImageStyle,
                        { width: menuIconSize, height: menuIconSize },
                        button.icon === 'chat' && ({ transform: [{ translateY: -2 }] } as ImageStyle),
                    ]}
                />
            </View>
        );
    }, [selectedMenuIndex, menuIconHitSize, menuIconSize]);

    return (
        <>
            <InnerScreen
            showStatsBar={true}
            isTransitioning={isTransitioning}
            transitionOpacity={transitionOpacity}
            statsBarContent={<StatsBar mood={moodVal} hunger={hungerVal} energy={energyVal} />}
            onLeftButtonPress={moveLeft}
            onCenterButtonPress={confirmSelection}
            onRightButtonPress={moveRight}
            leftButtonText=""
            centerButtonText=""
            rightButtonText=""
        >
            {/* Main Display Area */}
            <View style={styles.mainDisplayArea}>
                <Image source={IMAGE_SOURCES.background} style={styles.backgroundImage as ImageStyle} resizeMode="cover" />
                {selectedCharacter ? (
                    <TouchableOpacity
                        activeOpacity={hasPendingFinds ? 0.7 : 1}
                        onPress={handleCharacterPress}
                        onLongPress={handleCharacterLongPress}
                        delayLongPress={500}
                        disabled={!__DEV__ && !hasPendingFinds && !popOutItems}
                        style={styles.characterTouch}
                    >
                        <Image
                            source={getImageSource(selectedCharacter.image)}
                            style={[
                                styles.characterImage as ImageStyle,
                                {
                                    width: characterSize,
                                    height: characterSize,
                                    marginTop: characterMarginTop,
                                    transform: [{ translateY: -characterLift }],
                                },
                            ]}
                        />
                        {hasPendingFinds && !popOutItems && (
                            <Animated.View
                                style={[
                                    styles.exclamationBadge,
                                    { top: badgeOffset - 8 },
                                    {
                                        transform: [
                                            { translateX: 70 },
                                            { translateY: excBobAnim },
                                        ],
                                    },
                                ]}
                                pointerEvents="none"
                            >
                                <Image
                                    source={Forage.exclamation}
                                    style={{ width: badgeFontSize, height: badgeFontSize }}
                                    resizeMode="contain"
                                />
                            </Animated.View>
                        )}
                    </TouchableOpacity>
                ) : (
                    <View style={styles.noCharacterPlaceholder}>
                        <Text>No Character Selected</Text>
                    </View>
                )}
                {/* Bag rendered BEFORE ForagePopOut so spilling ingredients
                   pass over the bag instead of behind it. The wrapper
                   mirrors characterTouch's flex-centered layout (size +
                   negative marginTop) so the bag's `left`/`bottom`
                   offsets read off the same anchor as before. */}
                {selectedCharacter && popOutItems && !bagEmpty && (
                    <View
                        pointerEvents="none"
                        style={[
                            StyleSheet.absoluteFill,
                            { alignItems: 'center', justifyContent: 'center' },
                        ]}
                    >
                        <View
                            style={{
                                width: characterSize,
                                height: characterSize,
                                marginTop: characterMarginTop,
                            }}
                        >
                            <Animated.View
                                style={{
                                    position: 'absolute',
                                    width: characterSize * 0.20,
                                    height: characterSize * 0.20,
                                    left: characterSize * 0.18,
                                    bottom: characterSize * 0.08,
                                    opacity: bagFadeAnim,
                                    transform: [
                                        {
                                            scaleX: bagSqueezeAnim.interpolate({
                                                inputRange: [0, 1],
                                                outputRange: [1, 0.9],
                                            }),
                                        },
                                        {
                                            scaleY: bagSqueezeAnim.interpolate({
                                                inputRange: [0, 1],
                                                outputRange: [1, 1.08],
                                            }),
                                        },
                                    ],
                                }}
                            >
                                <Image
                                    source={Forage.bag}
                                    style={{ width: '100%', height: '100%', resizeMode: 'contain' }}
                                />
                            </Animated.View>
                        </View>
                    </View>
                )}
                {popOutItems && (
                    <ForagePopOut
                        items={popOutItems}
                        bottomInset={menuBarLayout.height}
                        // Spawn from the forage bag's approximate position so
                        // items look like they're tossed out of it. Bag center
                        // (in characterTouch coords) is left=0.18 + width/2 =
                        // 0.28 of characterSize, which is -0.22 of characterSize
                        // from the touch's horizontal center.
                        launchOffsetX={-characterSize * 0.22}
                        launchOffsetY={characterSize * 0.30}
                        onComplete={handlePopOutComplete}
                    />
                )}
            </View>

            {/* Navigation Menu - Inside Main Screen */}
            {/* Menu Bar at Bottom — gated on buttons being loaded so onLayout reports final size */}
            {menuButtons.length > 0 && (
                <View
                    style={styles.integratedMenuBar}
                    onLayout={handleMenuBarLayout}
                >
                    <View style={styles.integratedMenuBarInner}>
                        <View style={styles.menuRow}>
                            {menuButtons.slice(0, 4).map((b, i) => renderMenuButton(b, i))}
                        </View>
                        {menuButtons.length > 4 && (
                            <View style={styles.menuRow}>
                                {menuButtons.slice(4, 8).map((b, i) => renderMenuButton(b, i + 4))}
                            </View>
                        )}
                    </View>
                </View>
            )}

            </InnerScreen>
        </>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        position: 'relative',
    },
    statItem: {
        alignItems: 'center',
        justifyContent: 'center',
        flex: 1,
        paddingVertical: 6,
        marginHorizontal: 3,
        overflow: 'hidden',
    },
    statBackImage: {
        borderRadius: 8,
        opacity: 0.55,
    },
    statLabel: {
        fontSize: 16,
        marginBottom: 2,
        fontFamily: 'MacMinecraft',
        textAlign: 'center',
        width: '100%',
        paddingHorizontal: 2,
        transform: [{ translateY: -7 }, { translateX: 1 }],
    },
    starRating: {
        fontSize: 16,
        color: '#ffd700',
    },
    starContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        transform: [{ translateY: -5 }],
    },
    starImage: {
        width: 16,
        height: 16,
        marginHorizontal: 0.1,
    },
    mainDisplayArea: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    backgroundImage: {
        position: 'absolute',
        width: '100%',
        height: '100%',
    },
    characterImage: {
        width: 250,
        height: 250,
        resizeMode: 'contain',
        marginTop: -80,
    },
    characterTouch: {
        alignItems: 'center',
        justifyContent: 'center',
    },
    // Floats well above the Moonoko's head. characterImage is 250x250 with
    // contain + marginTop:-80, so the visible head sits in the upper third of
    // that box. left:0/right:0 + alignItems:center makes the text reliably
    // centered horizontally (alignSelf on an absolute element without an
    // explicit width drifts off-center). Negative top pulls the glyph above
    // the ears — tune by eye if sprites change size.
    exclamationBadge: {
        position: 'absolute',
        top: -100,
        left: 0,
        right: 0,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'transparent',
    },
    exclamationText: {
        fontFamily: 'Monaco',
        fontSize: 36,
        color: '#ff2a2a',
        textAlign: 'center',
        textShadowColor: '#000',
        textShadowOffset: { width: 2, height: 2 },
        textShadowRadius: 0,
    },
    noCharacterPlaceholder: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    integratedMenuBar: {
        flexDirection: 'column',
        justifyContent: 'flex-end',
        backgroundColor: 'transparent',
        width: '98%',
        position: 'absolute',
        bottom: 3,
        left: 3,
        right: 0,
    },
    integratedMenuBarInner: {
        flexDirection: 'column',
        justifyContent: 'flex-end',
        backgroundColor: 'transparent',
        marginHorizontal: 3,
        marginTop: 4,
        marginBottom: 3,
        paddingTop: 30,
        paddingBottom: 4,
    },
    menuRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginVertical: 4,
        paddingHorizontal: '5%',
    },
    menuIcon: {
        padding: 6,
        alignItems: 'center',
        justifyContent: 'center',
    },
    menuIconSelectImage: {
        position: 'absolute',
        top: -2,
        left: -2,
    },
    menuImage: {
        width: 48,
        height: 48,
        resizeMode: 'contain',
    },
    achievementStatusSection: {
        padding: 10,
        backgroundColor: '#fff',
        borderTopWidth: 1,
        borderTopColor: '#ccc',
    },
    achievementNotification: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },

    feedingAnimationOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0, 0, 0, 0.3)',
        justifyContent: 'center',
        alignItems: 'center',
        borderRadius: 12,
    },
    sleepAnimationOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0, 0, 0, 0.3)',
        justifyContent: 'center',
        alignItems: 'center',
        borderRadius: 12,
    },
    galleryOverlay: {
        flex: 1,
        backgroundColor: '#fff',
    },
    settingsOverlay: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: '#E8F5E8',
        zIndex: 1000,
    },
});

export default MoonokoInteraction;
