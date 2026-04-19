import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, SafeAreaView } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFonts } from 'expo-font';
import { StatusBar } from 'expo-status-bar';
import {
    PressStart2P_400Regular,
} from '@expo-google-fonts/press-start-2p';
import {
    SpaceMono_400Regular,
} from '@expo-google-fonts/space-mono';

import MoonokoSelection from './src/components/MoonokoSelection';
import MoonokoInteraction from './src/components/MoonokoInteraction';
import MoonokoCollection from './src/components/MoonokoCollection';
import Shop from './src/components/Shop';
import FeedingPage from './src/components/FeedingPage';
import Gallery from './src/components/Gallery';
import WelcomeScreen from './src/components/WelcomeScreen';
import CharacterChat from './src/components/CharacterChat';
import GlobalLeaderboard from './src/components/GlobalLeaderboard';
import Notification, { DeploymentStatusBanner } from './src/components/Notification';
import WalletButton from './src/components/WalletButton';
import Settings from './src/components/Settings';

// React Native compatible wallet integration
import { useWallet, WalletProvider } from './src/contexts/WalletContext';
import { ChromeProvider } from './src/contexts/ChromeContext';
import { HoshinoPrivyProvider } from './src/contexts/PrivyContext';
import { usePrivy } from '@privy-io/expo';
import LoginScreen from './src/components/LoginScreen';
import { DeviceCasing, DeviceButtons } from './src/components/DeviceChrome';
import { Connection, PublicKey } from '@solana/web3.js';

// NEW: Programmable NFT Integration
// New services and configs
import { LocalGameEngine } from './src/services/local/LocalGameEngine';
import { getGameCharacters, MOONOKOS_BY_ID, toGameCharacter } from './src/data/moonokos';
import { ENABLE_VRF_DEV_SCREEN } from './src/config/vrf';

interface Character {
    id: string;
    name: string;
    description: string;
    image: string;
    element: string;
    baseStats: {
        mood: number;
        hunger: number;
        energy: number;
    };
    rarity: 'Common' | 'Rare' | 'Epic' | 'Legendary';
    specialAbility: string;
    nftMint?: string | null;
}

const RPC_URL = 'https://api.devnet.solana.com';
const connection = new Connection(RPC_URL, 'confirmed');
const PLAYER_PROFILE_STORAGE_PREFIX = 'player_profile_';

interface StoredPlayerProfile {
    version: 1;
    playerName: string;
    ownedCharacterIds: string[];
    selectedCharacterId: string | null;
    updatedAt: number;
}

const getPlayerProfileStorageKey = (walletAddress: string) =>
    `${PLAYER_PROFILE_STORAGE_PREFIX}${walletAddress}`;

const normalizeOwnedCharacterIds = (ids: Array<string | null | undefined>) =>
    Array.from(
        new Set(ids.filter((id): id is string => Boolean(id && MOONOKOS_BY_ID[id])))
    );

const restoreCharacterFromId = (
    characterId: string | null | undefined,
    ownedIds: string[]
): Character | null => {
    if (!characterId) {
        return null;
    }

    const moonoko = MOONOKOS_BY_ID[characterId];

    if (!moonoko) {
        return null;
    }

    return toGameCharacter(
        moonoko,
        normalizeOwnedCharacterIds([...ownedIds, characterId]),
        'gif'
    );
};

const loadStoredPlayerProfile = async (
    walletAddress: string
): Promise<StoredPlayerProfile | null> => {
    try {
        const storedValue = await AsyncStorage.getItem(
            getPlayerProfileStorageKey(walletAddress)
        );

        if (!storedValue) {
            return null;
        }

        const parsed = JSON.parse(storedValue) as Partial<StoredPlayerProfile>;
        const ownedCharacterIds = normalizeOwnedCharacterIds(
            parsed.ownedCharacterIds ?? []
        );
        const selectedCharacterId =
            parsed.selectedCharacterId && MOONOKOS_BY_ID[parsed.selectedCharacterId]
                ? parsed.selectedCharacterId
                : null;

        return {
            version: 1,
            playerName: typeof parsed.playerName === 'string' ? parsed.playerName : '',
            ownedCharacterIds: normalizeOwnedCharacterIds([
                ...ownedCharacterIds,
                selectedCharacterId,
            ]),
            selectedCharacterId,
            updatedAt:
                typeof parsed.updatedAt === 'number' ? parsed.updatedAt : Date.now(),
        };
    } catch (error) {
        console.error('❌ Error loading stored player profile:', error);
        return null;
    }
};

const saveStoredPlayerProfile = async (
    walletAddress: string,
    profile: StoredPlayerProfile
) => {
    try {
        await AsyncStorage.setItem(
            getPlayerProfileStorageKey(walletAddress),
            JSON.stringify(profile)
        );
    } catch (error) {
        console.error('❌ Error saving player profile:', error);
    }
};

const validateCharacterInput = (character: Character): boolean => {
    if (
        !character?.name ||
        character.name.length === 0 ||
        character.name.length > 50
    ) {
        return false;
    }
    if (!character?.description || character.description.length > 1000) {
        return false;
    }
    if (
        !character?.image ||
        character.image.length === 0 ||
        character.image.length > 500
    ) {
        return false;
    }
    return true;
};

function App() {
    const [fontsLoaded] = useFonts({
        'PressStart2P': PressStart2P_400Regular,
        'SpaceMono': SpaceMono_400Regular,
    });



    const { connected, publicKey, connect, disconnect } = useWallet();
    const [currentView, setCurrentView] = useState('welcome');
    const [previousView, setPreviousView] = useState('welcome');
    const [welcomePhase, setWelcomePhase] = useState<string>('intro');
    const [shouldGoToCongratulations, setShouldGoToCongratulations] = useState(false);
    const [shouldFadeInInteraction, setShouldFadeInInteraction] = useState(false);

    const navigateToView = (view: string) => {
        setPreviousView(currentView);
        setCurrentView(view);
    };

    const navigateToSelection = (fromPhase?: string) => {
        if (fromPhase) {
            setWelcomePhase(fromPhase);
        }
        setPreviousView(currentView);
        setCurrentView('selection');
    };
    const [selectedCharacter, setSelectedCharacter] = useState<Character | null>(
        null
    );
    const [characterStats, setCharacterStats] = useState({
        mood: 3,
        hunger: 5,
        energy: 2
    });
    const [statusMessage, setStatusMessage] = useState('');
    const [achievements, setAchievements] = useState<string[]>([]);
    const [ownedCharacters, setOwnedCharacters] = useState<string[]>([]);

    const [lastError, setLastError] = useState<string | null>(null);
    const [notifications, setNotifications] = useState<Array<{
        id: string;
        message: string;
        type: 'success' | 'error' | 'info' | 'warning';
        duration?: number;
    }>>([]);
    const [deploymentStatus, setDeploymentStatus] = useState<string>('')
    const [showDeploymentBanner, setShowDeploymentBanner] = useState(true)

    const [localGameEngine, setLocalGameEngine] = useState<LocalGameEngine | null>(null);
    const [playerName, setPlayerName] = useState<string>('');
    const [profileHydratedWallet, setProfileHydratedWallet] = useState<string | null>(
        null
    );

    const addNotification = useCallback((message: string, type: 'success' | 'error' | 'info' | 'warning', duration?: number) => {
        const id = Date.now().toString();
        setNotifications(prev => [...prev, { id, message, type, duration }]);
    }, []);

    const removeNotification = useCallback((id: string) => {
        setNotifications(prev => prev.filter(n => n.id !== id));
    }, []);

    const persistPlayerProfile = useCallback(
        (
            walletAddress: string,
            nextProfile: Partial<
                Pick<
                    StoredPlayerProfile,
                    'playerName' | 'ownedCharacterIds' | 'selectedCharacterId'
                >
            > = {}
        ) => {
            const ownedCharacterIds = normalizeOwnedCharacterIds(
                nextProfile.ownedCharacterIds ?? [
                    ...ownedCharacters,
                    selectedCharacter?.id,
                ]
            );
            const selectedCharacterId =
                nextProfile.selectedCharacterId !== undefined
                    ? nextProfile.selectedCharacterId
                    : selectedCharacter?.id ?? null;
            const profile: StoredPlayerProfile = {
                version: 1,
                playerName:
                    nextProfile.playerName !== undefined
                        ? nextProfile.playerName.trim()
                        : playerName.trim(),
                ownedCharacterIds,
                selectedCharacterId,
                updatedAt: Date.now(),
            };

            void saveStoredPlayerProfile(walletAddress, profile);
        },
        [ownedCharacters, playerName, selectedCharacter?.id]
    );

    // Initialize local services when a Solana wallet identity is known.
    useEffect(() => {
        if (publicKey) {
            const gameEngine = new LocalGameEngine(publicKey.toString());
            setLocalGameEngine(gameEngine);
            
            gameEngine.init().then(() => {
                console.log('🎮 Game engine initialized for wallet:', publicKey.toString().slice(0, 8) + '...');
            });

        } else {
            setLocalGameEngine(null);
        }
    }, [publicKey]);

    useEffect(() => {
        return () => {
            setStatusMessage('');
            setLastError(null);
        };
    }, []);

    const connectWallet = async () => {
        setStatusMessage('');
        setLastError(null);

        try {
            console.log('🔌 Connect wallet clicked, current state:', {
                connected,
                publicKey: publicKey?.toString(),
            });

            if (connected) {
                setStatusMessage('Wallet already connected! 🎉');
                setTimeout(() => setStatusMessage(''), 3000);
                return;
            }

            console.log('🔄 Attempting to connect to wallet...');
            setStatusMessage('Connecting to wallet...');

            await connect();

            console.log('✅ Wallet connected successfully!', {
                publicKey: publicKey?.toString(),
                connected
            });

            setStatusMessage('Wallet connected successfully! 🎉');
            setTimeout(() => setStatusMessage(''), 3000);
        } catch (error: any) {
            console.error('❌ Wallet connection failed:', error);

            let errorMessage = 'Failed to connect wallet';

            if (error.message?.includes('User rejected')) {
                errorMessage = 'Connection cancelled by user';
            } else if (error.message?.includes('not found')) {
                errorMessage = 'Wallet not found - please install a Solana wallet';
            } else if (error.message?.includes('timeout')) {
                errorMessage = 'Connection timeout - please try again';
            } else if (error.message) {
                errorMessage = `Connection failed: ${error.message}`;
            }

            setLastError(errorMessage);
            setStatusMessage(errorMessage);
            addNotification(errorMessage, 'error');

            setTimeout(() => {
                setStatusMessage('');
                setLastError(null);
            }, 5000);
        }
    };

    const disconnectWallet = async () => {
        try {
            console.log('🔌 Disconnecting wallet...');
            await disconnect();
            setStatusMessage('Wallet disconnected');
            setAchievements([]);
            console.log('✅ Wallet disconnected successfully');
            setTimeout(() => setStatusMessage(''), 3000);
        } catch (error) {
            console.error('❌ Error disconnecting wallet:', error);
            setStatusMessage('Failed to disconnect wallet');
            setTimeout(() => setStatusMessage(''), 3000);
        }
    };

    const handleCharacterSelect = async (character: Character) => {
        console.log('🎮 Character selected in App:', character.name, {
            connected,
            character
        });

        if (!validateCharacterInput(character)) {
            console.log('❌ Character validation failed');
            setStatusMessage('Invalid character data');
            return;
        }

        console.log(
            '✅ Setting selected character and switching to interaction view'
        );
        setStatusMessage(`${character.name} selected! Preparing your companion...`);

        const nextOwnedCharacters = normalizeOwnedCharacterIds([
            ...ownedCharacters,
            character.id,
        ]);
        const restoredCharacter =
            restoreCharacterFromId(character.id, nextOwnedCharacters) ?? character;

        setOwnedCharacters(nextOwnedCharacters);
        setSelectedCharacter(restoredCharacter);
        if (publicKey) {
            persistPlayerProfile(publicKey.toString(), {
                ownedCharacterIds: nextOwnedCharacters,
                selectedCharacterId: restoredCharacter.id,
            });
        }
        setCharacterStats({
            mood: 3,
            hunger: 2,
            energy: 4
        });
        setCurrentView('interaction');
    };

    useEffect(() => {
        let isCancelled = false;

        const hydrateStoredProfile = async () => {
            if (!publicKey) {
                setProfileHydratedWallet(null);
                setPlayerName('');
                setOwnedCharacters([]);
                setSelectedCharacter(null);
                return;
            }

            const walletAddress = publicKey.toString();
            const storedProfile = await loadStoredPlayerProfile(walletAddress);

            if (isCancelled) {
                return;
            }

            if (!storedProfile) {
                console.log(
                    '🔍 No stored player profile for wallet:',
                    walletAddress.slice(0, 8) + '...'
                );
                setPlayerName('');
                setOwnedCharacters([]);
                setSelectedCharacter(null);
                setCurrentView('welcome');
                setProfileHydratedWallet(walletAddress);
                return;
            }

            const restoredOwnedCharacters = normalizeOwnedCharacterIds(
                storedProfile.ownedCharacterIds
            );
            const restoredCharacter = restoreCharacterFromId(
                storedProfile.selectedCharacterId,
                restoredOwnedCharacters
            );
            const hasStoredCompanion =
                restoredOwnedCharacters.length > 0 || Boolean(restoredCharacter);

            console.log('✅ Restored player profile:', {
                walletAddress,
                playerName: storedProfile.playerName,
                ownedCharacters: restoredOwnedCharacters,
                selectedCharacterId: restoredCharacter?.id ?? null,
            });

            setPlayerName(storedProfile.playerName);
            setOwnedCharacters(restoredOwnedCharacters);
            setSelectedCharacter(restoredCharacter);
            setCharacterStats({
                mood: 3,
                hunger: 2,
                energy: 4,
            });

            if (hasStoredCompanion) {
                setCurrentView(restoredCharacter ? 'interaction' : 'selection');
                if (storedProfile.playerName.trim()) {
                    addNotification(
                        `🌟 Welcome back, ${storedProfile.playerName}!`,
                        'success'
                    );
                }
            } else if (storedProfile.playerName.trim()) {
                setCurrentView('selection');
                addNotification(
                    `🌟 Welcome back, ${storedProfile.playerName}!`,
                    'success'
                );
            } else {
                setCurrentView('welcome');
            }

            setProfileHydratedWallet(walletAddress);
        };

        hydrateStoredProfile();

        return () => {
            isCancelled = true;
        };
    }, [addNotification, publicKey]);

    useEffect(() => {
        if (!publicKey) {
            return;
        }

        const walletAddress = publicKey.toString();

        if (profileHydratedWallet !== walletAddress) {
            return;
        }

        const ownedCharacterIds = normalizeOwnedCharacterIds([
            ...ownedCharacters,
            selectedCharacter?.id,
        ]);
        const storedProfile: StoredPlayerProfile = {
            version: 1,
            playerName: playerName.trim(),
            ownedCharacterIds,
            selectedCharacterId: selectedCharacter?.id ?? null,
            updatedAt: Date.now(),
        };

        void saveStoredPlayerProfile(walletAddress, storedProfile);
    }, [
        ownedCharacters,
        playerName,
        profileHydratedWallet,
        publicKey,
        selectedCharacter?.id,
    ]);

    const handleContinueFromWelcome = (name?: string) => {
        if (name) {
            setPlayerName(name);
            addNotification(`✨ Welcome, ${name}! Ready to start your stellar adventure!`, 'success');
            if (publicKey) {
                persistPlayerProfile(publicKey.toString(), {
                    playerName: name,
                });
            }
        }
        setCurrentView('selection');
    };

    const handleGoToInteraction = (name?: string) => {
        if (name) {
            setPlayerName(name);
            if (publicKey) {
                persistPlayerProfile(publicKey.toString(), {
                    playerName: name,
                });
            }
        }
        setShouldFadeInInteraction(true);
        setCurrentView('interaction');
    };

    const handleGoToCongratulations = (character?: Character) => {
        if (character) {
            const nextOwnedCharacters = normalizeOwnedCharacterIds([
                ...ownedCharacters,
                character.id,
            ]);
            const restoredCharacter =
                restoreCharacterFromId(character.id, nextOwnedCharacters) ?? character;

            setOwnedCharacters(nextOwnedCharacters);
            setSelectedCharacter(restoredCharacter);
            if (publicKey) {
                persistPlayerProfile(publicKey.toString(), {
                    ownedCharacterIds: nextOwnedCharacters,
                    selectedCharacterId: restoredCharacter.id,
                });
            }
            setCharacterStats({
                mood: 3,
                hunger: 2,
                energy: 4
            });
            console.log('🎉 Setting selected character:', restoredCharacter.name);
        }
        setShouldGoToCongratulations(true);
        setCurrentView('welcome');
        // Reset the flag after a longer delay to ensure WelcomeScreen has time to render
        setTimeout(() => {
            setShouldGoToCongratulations(false);
        }, 1000);
    };

    const handleFeed = async (
        foodType: string,
        hungerBoost: number,
        moodBoost: number
    ) => {
        if (hungerBoost < 0 || hungerBoost > 5 || moodBoost < 0 || moodBoost > 5) {
            setStatusMessage('Invalid feeding parameters');
            return;
        }

        setCharacterStats((prev) => ({
            ...prev,
            hunger: Math.min(5, prev.hunger + hungerBoost),
            mood: Math.min(5, prev.mood + moodBoost)
        }));

        // Update game engine if available
        if (localGameEngine) {
            try {
                const newStats = await localGameEngine.feedMoonoko();
                console.log('🍎 Updated game stats:', newStats);
            } catch (error) {
                console.error('❌ Error updating game stats:', error);
            }
        }
    };

    useEffect(() => {
        if (['game', 'memory-game', 'star-game'].includes(currentView)) {
            setCurrentView('interaction');
        }
    }, [currentView]);

    const moonokoInteractionElement = (
        <MoonokoInteraction
            selectedCharacter={selectedCharacter}
            onSelectCharacter={() => {
                setShouldFadeInInteraction(false);
                navigateToView('selection');
            }}
            onFeed={() => setCurrentView('feeding')}
            connected={connected}
            walletAddress={publicKey?.toString()}
            playerName={playerName}
            onNotification={addNotification}
            onRefreshNFTs={() => {
                addNotification('🔍 Checking wallet for NFTs...', 'info');
            }}
            onGame={() => setCurrentView('game')}
            onMemoryGame={() => setCurrentView('memory-game')}
            onStarGame={() => setCurrentView('star-game')}
            onShop={() => setCurrentView('shop')}
            onInventory={() => setCurrentView('inventory')}
            onGallery={() => setCurrentView('gallery')}
            onChat={() => setCurrentView('chat')}
            onSettings={() => setCurrentView('settings')}
            localGameEngine={localGameEngine}
            shouldFadeIn={shouldFadeInInteraction}
            onFadeInComplete={() => setShouldFadeInInteraction(false)}
        />
    );

    const renderContent = () => {
        switch (currentView) {
            case 'welcome':
                return (
                    <WelcomeScreen
                        onContinue={handleContinueFromWelcome}
                        onGoToInteraction={handleGoToInteraction}
                        onGoToSelection={(fromPhase) => navigateToSelection(fromPhase)}
                        connected={connected}
                        onConnectWallet={connectWallet}
                        playerName={playerName}
                        goToCongratulations={shouldGoToCongratulations}
                        initialPhase={welcomePhase}
                        selectedMoonokoName={selectedCharacter?.name}
                    />
                );
            case 'selection':
                return (
                    <MoonokoSelection
                        onBack={() => {
                            if (previousView === 'welcome') {
                                setCurrentView('welcome');
                            } else {
                                navigateToView(previousView);
                            }
                        }}
                        onNotification={addNotification}
                        onGoToCongratulations={handleGoToCongratulations}
                    />
                );
            case 'collection':
                return (
                    <MoonokoCollection
                        characters={getGameCharacters(ownedCharacters, 'png')}
                        selectedCharacter={selectedCharacter}
                        onSelectCharacter={handleCharacterSelect}
                        onExit={() => setCurrentView('selection')}
                        walletAddress={publicKey?.toString()}
                        connected={connected}
                        onNotification={addNotification}
                    />
                );
            case 'interaction':
            case 'feeding':
                return null;
            case 'game':
            case 'memory-game':
            case 'star-game':
                return (
                    <View style={styles.gamePlaceholder}>
                        <Text style={styles.gameText}>🎮 Redirecting to moonoko interaction...</Text>
                    </View>
                );
            case 'chat':
                return selectedCharacter ? null : (
                    <View style={styles.noCharacterContainer}>
                        <Text style={styles.noCharacterText}>Please select a character first!</Text>
                        <TouchableOpacity
                            onPress={() => setCurrentView('selection')}
                            style={styles.selectButton}
                        >
                            <Text style={styles.selectButtonText}>Select Character</Text>
                        </TouchableOpacity>
                    </View>
                );
            case 'shop':
            case 'gallery':
                return null;
            case 'inventory':
                return null;
            case 'leaderboard':
                return (
                    <GlobalLeaderboard
                        walletAddress={publicKey?.toString()}
                        onClose={() => setCurrentView('interaction')}
                    />
                );
            case 'settings':
                return null;
            case 'vrf-dev': {
                const VRFTest = require('./src/components/_dev/VRFTest').default;
                return (
                    <VRFTest
                        onClose={() =>
                            setCurrentView(previousView === 'vrf-dev' ? 'welcome' : previousView)
                        }
                    />
                );
            }
            default:
                return (
                    <WelcomeScreen
                        onContinue={handleContinueFromWelcome}
                        connected={connected}
                        onConnectWallet={connectWallet}
                        playerName={playerName}
                    />
                );
        }
    };

    if (!fontsLoaded) {
        return null; // or a loading screen
    }

    const miRoutes = ['interaction', 'feeding', 'shop', 'gallery', 'inventory', 'settings', 'chat'];
    const miMounted = miRoutes.includes(currentView);

    return (
        <SafeAreaView style={styles.container}>
            <StatusBar style="light" hidden={true} />
            <DeviceCasing />
            {miMounted && (
                <View
                    key="mi-layer"
                    style={StyleSheet.absoluteFill}
                    pointerEvents="box-none"
                >
                    {moonokoInteractionElement}
                </View>
            )}
            {currentView === 'feeding' && (
                <View key="overlay-layer" style={[StyleSheet.absoluteFill, { zIndex: 50, elevation: 50 }]} pointerEvents="box-none">
                    <FeedingPage
                        onBack={() => setCurrentView('interaction')}
                        onFeed={handleFeed}
                        currentHunger={characterStats.hunger}
                    />
                </View>
            )}
            {currentView === 'shop' && (
                <View key="overlay-layer" style={[StyleSheet.absoluteFill, { zIndex: 50, elevation: 50 }]} pointerEvents="box-none">
                    <Shop
                        connection={connection}
                        onNotification={addNotification}
                        onClose={() => setCurrentView('interaction')}
                    />
                </View>
            )}
            {currentView === 'gallery' && (
                <View key="overlay-layer" style={[StyleSheet.absoluteFill, { zIndex: 50, elevation: 50 }]} pointerEvents="box-none">
                    <Gallery onBack={() => setCurrentView('interaction')} />
                </View>
            )}
            {currentView === 'inventory' && (
                <View key="overlay-layer" style={[StyleSheet.absoluteFill, { zIndex: 50, elevation: 50 }]} pointerEvents="box-none">
                    <MoonokoCollection
                        characters={getGameCharacters(ownedCharacters, 'png')}
                        selectedCharacter={selectedCharacter}
                        onSelectCharacter={handleCharacterSelect}
                        onExit={() => setCurrentView('interaction')}
                        walletAddress={publicKey?.toString()}
                        connected={connected}
                        onNotification={addNotification}
                    />
                </View>
            )}
            {currentView === 'settings' && (
                <View key="overlay-layer" style={[StyleSheet.absoluteFill, { zIndex: 50, elevation: 50 }]} pointerEvents="box-none">
                    <Settings
                        onBack={() => setCurrentView('interaction')}
                        onNotification={addNotification}
                    />
                </View>
            )}
            {currentView === 'chat' && selectedCharacter && (
                <View key="overlay-layer" style={[StyleSheet.absoluteFill, { zIndex: 50, elevation: 50 }]} pointerEvents="box-none">
                    <CharacterChat
                        character={selectedCharacter}
                        onExit={() => setCurrentView('interaction')}
                        playerName={playerName}
                        onNotification={addNotification}
                    />
                </View>
            )}
            {!miMounted && renderContent()}
            <DeviceButtons />

            {ENABLE_VRF_DEV_SCREEN && currentView !== 'vrf-dev' && (
                <TouchableOpacity
                    style={styles.vrfDevButton}
                    onPress={() => navigateToView('vrf-dev')}
                >
                    <Text style={styles.vrfDevButtonText}>VRF</Text>
                </TouchableOpacity>
            )}

            <WalletButton
                connected={connected}
                publicKey={publicKey}
                onConnect={connectWallet}
                onDisconnect={disconnectWallet}
            />

            {statusMessage && (
                <View style={[styles.statusMessage, lastError ? styles.error : styles.success]}>
                    <Text style={styles.statusText}>{statusMessage}</Text>
                </View>
            )}

            {notifications.map(notification => (
                <Notification
                    key={notification.id}
                    message={notification.message}
                    type={notification.type}
                    onClose={() => removeNotification(notification.id)}
                />
            ))}
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: 'black',
    },

    statusMessage: {
        position: 'absolute',
        top: 50,
        right: 20,
        paddingVertical: 8,
        paddingHorizontal: 12,
        borderRadius: 8,
        maxWidth: 250,
        zIndex: 1000,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.25,
        shadowRadius: 4,
        elevation: 5,
    },
    success: {
        backgroundColor: 'rgba(34, 197, 94, 0.9)',
    },
    error: {
        backgroundColor: 'rgba(239, 68, 68, 0.9)',
    },
    statusText: {
        color: '#fff',
        textAlign: 'center',
        fontSize: 12,
        fontWeight: 'bold',
    },
    noCharacterContainer: {
        flex: 1,
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
    },
    noCharacterText: {
        fontSize: 12,
        color: '#4A4A4A',
    },
    selectButton: {
        marginTop: 20,
        paddingVertical: 10,
        paddingHorizontal: 20,
        backgroundColor: '#3B82F6',
        borderWidth: 2,
        borderColor: '#1E40AF',
        borderRadius: 8,
    },
    selectButtonText: {
        fontSize: 10,
        color: 'white',
    },
    gamePlaceholder: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#FFD700',
        borderRadius: 15,
        padding: 20,
    },
    gameText: {
        fontSize: 10,
        color: '#5D4E37',
    },
    vrfDevButton: {
        position: 'absolute',
        left: 18,
        bottom: 42,
        zIndex: 1000,
        backgroundColor: 'rgba(17, 24, 39, 0.9)',
        borderRadius: 999,
        paddingHorizontal: 14,
        paddingVertical: 10,
    },
    vrfDevButtonText: {
        color: '#fff',
        fontSize: 11,
        fontWeight: '700',
    },

});

function AuthGate() {
    const { user, isReady } = usePrivy();

    if (!isReady) {
        return (
            <SafeAreaView style={styles.container}>
                <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ color: '#e5dcf5', fontFamily: 'monospace' }}>Loading…</Text>
                </View>
            </SafeAreaView>
        );
    }

    if (!user) {
        return (
            <SafeAreaView style={styles.container}>
                <LoginScreen />
            </SafeAreaView>
        );
    }

    return <App />;
}

function AppWrapper() {
    return (
        <HoshinoPrivyProvider>
            <WalletProvider>
                <ChromeProvider>
                    <AuthGate />
                </ChromeProvider>
            </WalletProvider>
        </HoshinoPrivyProvider>
    );
}

export default AppWrapper;
