import React, { useState, useEffect, useRef } from 'react';
import { View, Text, Image, TouchableOpacity, Modal, StyleSheet, Dimensions, Animated, Easing } from 'react-native';
import Shop from './Shop';
import Gallery from './Gallery';
import SleepMode from './SleepMode';
import InnerScreen from './InnerScreen';
import Settings from './Settings';
import Frame from './Frame';
import Starburst from './Starburst';
import SettingsService, { MenuButton } from '../services/SettingsService';
import { useGameStateContext } from '../contexts/GameStateContext';

const { height } = Dimensions.get('window');


// Helper function to get image source based on character image name
const getImageSource = (imageName: string) => {
    switch (imageName) {
        case 'LYRA.gif':
            return require('../../assets/images/anim/LYRA.gif');
        case 'ORION.gif':
            return require('../../assets/images/anim/ORION.gif');
        case 'ARO.gif':
            return require('../../assets/images/anim/ARO.gif');
        case 'SIRIUS.gif':
            return require('../../assets/images/anim/SIRIUS.gif');
        case 'ZANIAH.gif':
            return require('../../assets/images/anim/ZANIAH.gif');
        default:
            return require('../../assets/images/anim/LYRA.gif'); // fallback
    }
};

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
    onFadeInComplete
}) => {
    const { state: gameState } = useGameStateContext();
    const currentStats = {
        mood: gameState?.mood ?? 3,
        hunger: gameState?.hunger ?? 5,
        energy: gameState?.energy ?? 3,
    };

    const [currentGame, setCurrentGame] = useState<string | null>(null);
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
                // TEMP: sleep is disabled while the UX is being reworked.
                onNotification?.('😴 Sleep is being reworked — stay tuned.', 'info');
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
                setCurrentGame('starburst');
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
        background: require('../../assets/images/screen bg.png'),
        feed: require('../../assets/images/feed.png'),
        chat: require('../../assets/images/chat.png'),
        games: require('../../assets/images/games.png'),
        sleep: require('../../assets/images/sleepzzzz.png'),
        shop: require('../../assets/images/shop.png'),
        inventory: require('../../assets/images/backpack.png'),
        gallery: require('../../assets/images/gallery.png'),
        settings: require('../../assets/images/settings.png'),
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
                                    source={index < currentStats.mood ? require('../../assets/images/star_life_3.png') : require('../../assets/images/star_life.png')}
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
                                    source={index < currentStats.hunger ? require('../../assets/images/star_life_3.png') : require('../../assets/images/star_life.png')}
                                    style={styles.starImage}
                                />
                            ))}
                        </View>
                    </View>
                    <View style={styles.statItem}>
                        <Text style={styles.statLabel}>Sleep</Text>
                        <View style={styles.starContainer}>
                            {[...Array(5)].map((_, index) => (
                                <Image
                                    key={`sleep-${index}`}
                                    source={index < currentStats.energy ? require('../../assets/images/star_life_3.png') : require('../../assets/images/star_life.png')}
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
                    <Image
                        source={getImageSource(selectedCharacter.image)}
                        style={styles.characterImage}
                    />
                ) : (
                    <View style={styles.noCharacterPlaceholder}>
                        <Text>No Character Selected</Text>
                    </View>
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

            {currentGame === 'starburst' && (
                <View style={[StyleSheet.absoluteFill, { zIndex: 2, elevation: 12 }]}>
                    <Starburst onBack={() => setCurrentGame(null)} />
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