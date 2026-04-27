import React, { useState, useEffect, useRef } from 'react';
import { View, Text, Image, TouchableOpacity, Modal, StyleSheet, Dimensions, Animated, Easing } from 'react-native';
import Shop from './Shop';
import Gallery from './Gallery';
import InnerScreen from './InnerScreen';
import Settings from './Settings';
import Frame from './Frame';
import Starburst from './Starburst';
import GamesList from './GamesList';
import SleepScreen from './SleepScreen';
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
    onGame?: () => void;
    onMemoryGame?: () => void;
    onStarGame?: () => void;
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
    onBack,
    onSettings,
    onGallery,
    shouldFadeIn = false,
    onFadeInComplete,
    pendingWidgetAction = null,
    onWidgetActionConsumed,
}) => {
    const { state: gameState, drainForaged, startSleep, endSleep } = useGameStateContext();
    const currentStats = {
        mood: gameState?.mood ?? 3,
        hunger: gameState?.hunger ?? 5,
        energy: gameState?.energy ?? 3,
    };
    const pendingFinds = gameState?.foragedItems ?? [];
    const hasPendingFinds = pendingFinds.length > 0;

    const [popOutItems, setPopOutItems] = useState<ForagedItem[] | null>(null);
    const drainInFlightRef = useRef(false);

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
                onNotification?.(e?.message || 'Failed to collect finds', 'error');
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

    const [currentGame, setCurrentGame] = useState<string | null>(null);
    // Arcade hub gates access to individual games. Tapping the games menu
    // button opens the hub; the hub then launches a specific game.
    const [arcadeOpen, setArcadeOpen] = useState(false);
    // `isSleeping` is derived from the server (`gameState.sleepStartedAt`),
    // not held as independent local state. Earlier impl used `useState(false)`
    // and got out of sync if the user force-quit mid-sleep: server still had
    // sleepStartedAt set, local state defaulted to false, home menu rendered
    // while the server paused all decay → "stats stuck after 48h" bug.
    //
    // `pendingStartSleep` covers the brief optimistic window: tapping Sleep
    // flips the screen instantly while the startSleep callable is in flight.
    // Cleared in the success/failure paths below.
    const [pendingStartSleep, setPendingStartSleep] = useState(false);
    const serverSleeping = gameState?.sleepStartedAt != null;
    const isSleeping = serverSleeping || pendingStartSleep;
    // When true, SleepScreen plays its exit animation and then fires onWake.
    // Used so a second tap on the sleep menu button reads the same as
    // tapping the in-screen Wake button (no instant unmount jump).
    const [wakeRequested, setWakeRequested] = useState(false);
    // Bumped on endSleep failure to remount SleepScreen with a fresh
    // ZoomOutOverlay — the in-flight one already animated to its exited
    // (invisible, scaled-small) state and would otherwise block touches with
    // no visible UI. Bumping the key gives the user a clean retry surface.
    const [sleepInstanceKey, setSleepInstanceKey] = useState(0);

    // Clear sleep UI flags when the active character changes. Without this,
    // a startSleep promise inflight on character A could leave pendingStartSleep
    // true while the user is now viewing character B, briefly showing
    // SleepScreen for the wrong moonoko. wakeRequested is reset for the same
    // reason — its meaning is per-character.
    useEffect(() => {
        setPendingStartSleep(false);
        setWakeRequested(false);
    }, [selectedCharacter?.id]);
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
    const [settingsService] = useState(() => SettingsService.getInstance());
    const [menuBarLayout, setMenuBarLayout] = useState({ x: 0, y: 0, width: 0, height: 0 });
    const frameOpacity = useRef(new Animated.Value(0)).current;
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

    useEffect(() => {
        if (menuBarLayout.width > 0) {
            Animated.timing(frameOpacity, {
                toValue: 1,
                duration: 150,
                easing: Easing.out(Easing.quad),
                useNativeDriver: true,
            }).start();
        }
    }, [menuBarLayout.width]);

    // Navigation functions for physical device buttons
    const goToPreviousMenu = () => {
        if (onInventory) {
            onInventory();
        } else {
            onNotification?.('📦 Opening inventory...', 'info');
        }
    };

    const goToNextMenu = () => {
        if (onShop) {
            onShop();
        } else {
            onNotification?.('🏪 Opening shop...', 'info');
        }
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
                if (isSleeping) {
                    // Already sleeping; tapping sleep again triggers the same
                    // wake flow as the in-screen button — SleepScreen plays
                    // its exit animation then onWake unmounts us. Issuing
                    // endSleep here would race with onWake's call.
                    if (!wakeRequested) setWakeRequested(true);
                } else {
                    // Flip the overlay on immediately via pendingStartSleep —
                    // the startSleep callable is a server round-trip and
                    // awaiting it here makes the tap feel laggy. On success
                    // the server response sets sleepStartedAt and serverSleeping
                    // takes over, so we clear the pending flag. On failure we
                    // clear the flag and toast — caller stays on home menu.
                    setPendingStartSleep(true);
                    startSleep()
                        .then(() => setPendingStartSleep(false))
                        .catch((e: any) => {
                            setPendingStartSleep(false);
                            onNotification?.(e?.message || 'Failed to start sleep', 'error');
                        });
                }
                break;

            case 'shop':
                onShop?.();
                break;

            case 'inventory':
                onInventory?.();
                break;

            case 'chat':
                if (onChat) await onChat();
                break;

            case 'games':
                setArcadeOpen(true);
                break;

            case 'gallery':
                onGallery?.();
                break;

                                    case 'settings':
                            if (onSettings) {
                                onSettings();
                            }
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

    // Render menu button
    const renderMenuButton = (button: MenuButton) => {
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

        return (
            <TouchableOpacity
                key={button.id}
                style={styles.menuIcon}
                onPress={() => handleMenuButtonAction(button.action)}
                activeOpacity={0.7}
            >
                <Image source={getImageSource(button.icon)} style={styles.menuImage} />
            </TouchableOpacity>
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
            onLeftButtonPress={onBack}
            onCenterButtonPress={() => onNotification?.('🎮 Moonoko Interaction: Care for your character!', 'info')}
            onRightButtonPress={() => onNotification?.('🎮 Moonoko Help: Feed, play, sleep, and care for your cosmic companion!', 'info')}
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
                        disabled={!hasPendingFinds && !popOutItems}
                        style={styles.characterTouch}
                    >
                        <Image
                            source={getImageSource(selectedCharacter.image)}
                            style={styles.characterImage}
                        />
                        {hasPendingFinds && !popOutItems && (
                            <Animated.View
                                style={[
                                    styles.exclamationBadge,
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
                                <Text style={styles.exclamationText}>!</Text>
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
                            {menuButtons.slice(0, 4).map(renderMenuButton)}
                        </View>
                        {menuButtons.length > 4 && (
                            <View style={styles.menuRow}>
                                {menuButtons.slice(4, 8).map(renderMenuButton)}
                            </View>
                        )}
                    </View>
                </View>
            )}

            {/* Decorative Frame Overlay - dims sync to menu bar via onLayout */}
            {menuBarLayout.width > 0 && (
                <Animated.View
                    pointerEvents="box-none"
                    style={{
                        position: 'absolute',
                        top: menuBarLayout.y + 15,
                        left: menuBarLayout.x + 15,
                        width: menuBarLayout.width - 30,
                        height: menuBarLayout.height - 30,
                        opacity: frameOpacity,
                    }}
                >
                    <Frame
                        width={menuBarLayout.width - 30}
                        height={menuBarLayout.height - 30}
                        top={0}
                        left={0}
                        position="absolute"
                        showBackgroundImage={false}
                        pixelSize={3}
                    >
                        <View style={{ width: '100%', height: '100%' }} />
                    </Frame>
                </Animated.View>
            )}

            </InnerScreen>
            {/* TEMP: SleepOverlay disabled while sleep UX is being reworked. */}

            {arcadeOpen && (
                <View style={[StyleSheet.absoluteFill, { zIndex: 50, elevation: 50 }]}>
                    <GamesList
                        onClose={() => setArcadeOpen(false)}
                        onSelectGame={(gameId) => setCurrentGame(gameId)}
                    />
                </View>
            )}

            {currentGame === 'starburst' && (
                <View style={[StyleSheet.absoluteFill, { zIndex: 60, elevation: 60 }]}>
                    <Starburst onBack={() => setCurrentGame(null)} />
                </View>
            )}

            {isSleeping && (
                <View style={[StyleSheet.absoluteFill, { zIndex: 50, elevation: 50 }]}>
                    <SleepScreen
                        key={sleepInstanceKey}
                        wakeRequested={wakeRequested}
                        onWake={async () => {
                            try {
                                await endSleep(true);
                                // Success: server cleared sleepStartedAt, the
                                // derived isSleeping flips false on next render
                                // and SleepScreen unmounts.
                                setWakeRequested(false);
                            } catch (e: any) {
                                // Don't unmount on failure — earlier impl set
                                // isSleeping=false unconditionally, leaving the
                                // server in stale-sleep state with the home
                                // menu showing. Keep the user on SleepScreen,
                                // bump the instance key so a fresh
                                // ZoomOutOverlay replaces the exited one
                                // (otherwise it sits invisible, blocking taps),
                                // and surface the error so they can retry.
                                onNotification?.(e?.message || 'Failed to end sleep — try again', 'error');
                                setWakeRequested(false);
                                setSleepInstanceKey((k) => k + 1);
                            }
                        }}
                    />
                </View>
            )}

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
        fontSize: 12,
        marginBottom: 2,
        fontFamily: 'PressStart2P',
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
        fontFamily: 'PressStart2P',
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
        backgroundColor: '#E8F5E8',
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
        paddingHorizontal: 20,
    },
    menuIcon: {
        padding: 5,
        alignItems: 'center',
        justifyContent: 'center',
    },
    menuImage: {
        width: 30,
        height: 30,
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