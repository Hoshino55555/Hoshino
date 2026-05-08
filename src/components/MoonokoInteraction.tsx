import React, { useState, useEffect, useRef } from 'react';
import { View, Text, Image, TouchableOpacity, Modal, StyleSheet, Dimensions, Animated, Easing, useWindowDimensions } from 'react-native';
import Shop from './Shop';
import Gallery from './Gallery';
import InnerScreen from './InnerScreen';
import Settings from './Settings';
import SettingsService, { MenuButton } from '../services/SettingsService';
import { useGameStateContext } from '../contexts/GameStateContext';
import ForagePopOut from './ForagePopOut';
import type { ForagedItem } from '../services/GameStateService';
import { pushMoonokoSnapshot } from '../widgets/widgetService';
import type { PendingWidgetAction } from '../../App';
import { Backgrounds, Menu, Stars, getCharacterAnim } from '../assets';

const WIDGET_ACTION_TTL_MS = 60_000;

const { height } = Dimensions.get('window');


const getImageSource = (imageName: string) => getCharacterAnim(imageName);

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
    //   - menu icons ~13% of screen width, capped so big tablets don't get
    //     cartoonishly large icons
    const { width: winW, height: winH } = useWindowDimensions();
    const characterSize = Math.min(winW * 0.62, winH * 0.42);
    const characterMarginTop = -characterSize * 0.32;
    const badgeOffset = -characterSize * 0.4;
    const badgeFontSize = Math.max(28, Math.min(44, winW * 0.09));
    const menuIconSize = Math.min(winW * 0.10, 44);
    const currentStats = {
        mood: gameState?.mood ?? 3,
        hunger: gameState?.hunger ?? 5,
        energy: gameState?.energy ?? 3,
    };
    const allPendingFinds = gameState?.foragedItems ?? [];
    // Sleep-tagged finds are surfaced through the Morning Recap modal, not the
    // standard forage pop-out — splitting here keeps the daytime tap path
    // unchanged while preventing a duplicate animation right after wake.
    const pendingFinds = allPendingFinds.filter((f) => f.source !== 'sleep');
    const hasPendingFinds = pendingFinds.length > 0;

    const [popOutItems, setPopOutItems] = useState<ForagedItem[] | null>(null);
    const drainInFlightRef = useRef(false);

    const handleCharacterLongPress = () => {
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
    };

    const handleCharacterPress = () => {
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
    };

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
    }, [pendingWidgetAction, gameState, hasPendingFinds]);

    // Push the home-screen widget a fresh snapshot whenever the state that
    // drives its rendering changes. The widget runs in the launcher process
    // and can't see React state — this is the only way it learns that
    // mood/hunger/energy/foraging have moved. Cheap to over-call: the
    // launcher coalesces redraws. Empty-state pushes happen at the App
    // lifecycle level on profile reset, not here — pushing empty during
    // the cold-start gameState load window would briefly blank the widget.
    useEffect(() => {
        if (!selectedCharacter || !gameState) return;
        const avatarKey = selectedCharacter.image.replace(/\.gif$/i, '');
        // gameState stats are on a 0..5 scale — same as the in-app 5-star
        // readout. Widget contract is 0..100, so multiply by 20.
        const scale = (n: number) => n * 20;
        pushMoonokoSnapshot({
            characterId: gameState.characterId,
            name: selectedCharacter.name,
            avatarKey,
            mood: scale(gameState.mood),
            hunger: scale(gameState.hunger),
            energy: scale(gameState.energy),
            level: gameState.level,
            // Player-wide currency lives outside gameState; for now we omit
            // it (widget shows 0). Wiring GlobalPointSystem here is a
            // follow-up — the forage interaction doesn't depend on it.
            fragments: 0,
            isSleeping: gameState.sleepStartedAt != null,
            foragedCount: pendingFinds.length,
        }).catch(() => {});
    }, [
        selectedCharacter,
        gameState?.characterId,
        gameState?.mood,
        gameState?.hunger,
        gameState?.energy,
        gameState?.level,
        gameState?.sleepStartedAt,
        pendingFinds.length,
    ]);

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

    const [showSettings, setShowSettings] = useState(false);
    const [menuButtons, setMenuButtons] = useState<MenuButton[]>([]);
    const [selectedMenuIndex, setSelectedMenuIndex] = useState(0);
    const [settingsService] = useState(() => SettingsService.getInstance());
    const [menuBarLayout, setMenuBarLayout] = useState({ x: 0, y: 0, width: 0, height: 0 });
    const bobAnim = useRef(new Animated.Value(0)).current;

    // Gentle up/down loop to match the Moonoko's baked-in float. Native driver
    // so it doesn't fight any JS work while forage ticks land.
    useEffect(() => {
        const loop = Animated.loop(
            Animated.sequence([
                Animated.timing(bobAnim, {
                    toValue: 1,
                    duration: 900,
                    easing: Easing.inOut(Easing.sin),
                    useNativeDriver: true,
                }),
                Animated.timing(bobAnim, {
                    toValue: 0,
                    duration: 900,
                    easing: Easing.inOut(Easing.sin),
                    useNativeDriver: true,
                }),
            ])
        );
        loop.start();
        return () => loop.stop();
    }, [bobAnim]);

    // The three center buttons act as a cursor controller for the menu grid:
    // left/right move a highlight across the rendered menu icons, and the
    // center button activates the highlighted icon. Direct icon taps still
    // work — this is an alternate input path for one-handed / physical-button
    // use without overriding the existing tap UX.
    const moveSelection = (delta: number) => {
        if (menuButtons.length === 0) return;
        setSelectedMenuIndex((i) => {
            const len = menuButtons.length;
            return ((i + delta) % len + len) % len;
        });
    };

    const confirmSelection = () => {
        const btn = menuButtons[selectedMenuIndex];
        if (btn) handleMenuButtonAction(btn.action);
    };

    // Load menu buttons from settings
    useEffect(() => {
        const loadMenuButtons = async () => {
            await settingsService.initialize();
            const buttons = settingsService.getMenuButtons();
            setMenuButtons(buttons);
        };
        loadMenuButtons();
    }, [settingsService]);

    // Reload menu buttons when returning from settings
    useEffect(() => {
        if (!showSettings) {
            const loadMenuButtons = async () => {
                const buttons = settingsService.getMenuButtons();
                setMenuButtons(buttons);
            };
            loadMenuButtons();
        }
    }, [showSettings, settingsService]);

    // Keep the selection cursor inside bounds if the menu list shrinks
    // (e.g. user disabled a button in Settings).
    useEffect(() => {
        if (menuButtons.length > 0 && selectedMenuIndex >= menuButtons.length) {
            setSelectedMenuIndex(0);
        }
    }, [menuButtons.length, selectedMenuIndex]);

    // Handle menu button actions
    const handleMenuButtonAction = async (action: string) => {
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
    };

    const imageSources = {
        background: Backgrounds.screen,
        feed: Menu.feed,
        chat: Menu.chat,
        games: Menu.games,
        sleep: Menu.sleep,
        shop: Menu.shop,
        inventory: Menu.inventory,
        gallery: Menu.gallery,
        settings: Menu.settings,
    };

    // Render menu button. `index` is the absolute position in `menuButtons`
    // (not the slice index) so the selection highlight matches the cursor.
    const renderMenuButton = (button: MenuButton, index: number) => {
        const getImageSource = (iconName: string) => {
            switch (iconName) {
                case 'feed': return imageSources.feed;
                case 'chat': return imageSources.chat;
                case 'games': return imageSources.games;
                case 'sleep': return imageSources.sleep;
                case 'shop': return imageSources.shop;
                case 'inventory': return imageSources.inventory;
                case 'gallery': return imageSources.gallery;
                case 'settings': return imageSources.settings;
                default: return imageSources.settings;
            }
        };

        const isSelected = index === selectedMenuIndex;

        return (
            <View
                key={button.id}
                style={[styles.menuIcon, isSelected && styles.menuIconSelected]}
                testID={`menu-${button.action}`}
            >
                <Image
                    source={getImageSource(button.icon)}
                    style={[styles.menuImage, { width: menuIconSize, height: menuIconSize }]}
                />
            </View>
        );
    };

    return (
        <>
            <InnerScreen
            showStatsBar={true}
            isTransitioning={isTransitioning}
            transitionOpacity={transitionOpacity}
            statsBarContent={
                <>
                    <View style={styles.statItem}>
                        <Text style={styles.statLabel}>Mood</Text>
                        <View style={styles.starContainer}>
                            {[...Array(5)].map((_, index) => (
                                <Image
                                    key={`mood-${index}`}
                                    source={index < currentStats.mood ? Stars.lifeFilled : Stars.lifeEmpty}
                                    style={styles.starImage}
                                />
                            ))}
                        </View>
                    </View>
                    <View style={styles.statItem}>
                        <Text style={styles.statLabel}>Hunger</Text>
                        <View style={styles.starContainer}>
                            {[...Array(5)].map((_, index) => (
                                <Image
                                    key={`hunger-${index}`}
                                    source={index < currentStats.hunger ? Stars.lifeFilled : Stars.lifeEmpty}
                                    style={styles.starImage}
                                />
                            ))}
                        </View>
                    </View>
                    <View style={styles.statItem}>
                        <Text style={styles.statLabel}>Energy</Text>
                        <View style={styles.starContainer}>
                            {[...Array(5)].map((_, index) => (
                                <Image
                                    key={`energy-${index}`}
                                    source={index < currentStats.energy ? Stars.lifeFilled : Stars.lifeEmpty}
                                    style={styles.starImage}
                                />
                            ))}
                        </View>
                    </View>
                </>
            }
            onLeftButtonPress={() => moveSelection(-1)}
            onCenterButtonPress={confirmSelection}
            onRightButtonPress={() => moveSelection(1)}
            leftButtonText=""
            centerButtonText=""
            rightButtonText=""
        >
            {/* Main Display Area */}
            <View style={styles.mainDisplayArea}>
                <Image source={imageSources.background} style={styles.backgroundImage} resizeMode="cover" />
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
                                styles.characterImage,
                                { width: characterSize, height: characterSize, marginTop: characterMarginTop },
                            ]}
                        />
                        {hasPendingFinds && !popOutItems && (
                            <Animated.View
                                style={[
                                    styles.exclamationBadge,
                                    { top: badgeOffset },
                                    {
                                        transform: [
                                            {
                                                translateY: bobAnim.interpolate({
                                                    inputRange: [0, 1],
                                                    outputRange: [0, -8],
                                                }),
                                            },
                                        ],
                                    },
                                ]}
                                pointerEvents="none"
                            >
                                <Text style={[styles.exclamationText, { fontSize: badgeFontSize }]}>!</Text>
                            </Animated.View>
                        )}
                    </TouchableOpacity>
                ) : (
                    <View style={styles.noCharacterPlaceholder}>
                        <Text>No Character Selected</Text>
                    </View>
                )}
                {popOutItems && (
                    <ForagePopOut
                        items={popOutItems}
                        bottomInset={menuBarLayout.height}
                        onComplete={() => setPopOutItems(null)}
                    />
                )}
            </View>

            {/* Navigation Menu - Inside Main Screen */}
            {/* Menu Bar at Bottom — gated on buttons being loaded so onLayout reports final size */}
            {menuButtons.length > 0 && (
                <View
                    style={styles.integratedMenuBar}
                    onLayout={(e) => {
                        const next = e.nativeEvent.layout;
                        setMenuBarLayout(prev => (prev.width === 0 ? next : prev));
                    }}
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
    },
    statLabel: {
        fontSize: 17,
        marginBottom: 2,
        fontFamily: 'Monaco',
        textAlign: 'center',
        width: '100%',
        paddingHorizontal: 2,
    },
    starRating: {
        fontSize: 16,
        color: '#ffd700',
    },
    starContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
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
        paddingTop: 15,
        paddingBottom: 15,
    },
    menuRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginVertical: 1,
        paddingHorizontal: '5%',
    },
    menuIcon: {
        padding: 6,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 8,
        borderWidth: 2,
        borderColor: 'transparent',
        backgroundColor: 'transparent',
    },
    menuIconSelected: {
        borderColor: 'rgba(46, 90, 62, 0.85)',
        backgroundColor: 'rgba(232, 245, 232, 0.55)',
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