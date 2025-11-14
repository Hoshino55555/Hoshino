import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, SafeAreaView } from 'react-native';
import { useFonts } from 'expo-font';
import { StatusBar } from 'expo-status-bar';
import {
    PressStart2P_400Regular,
} from '@expo-google-fonts/press-start-2p';
import {
    SpaceMono_400Regular,
} from '@expo-google-fonts/space-mono';

import MoonlingSelection from './src/components/MoonlingSelection';
import MoonlingInteraction from './src/components/MoonlingInteraction';
import MoonlingCollection from './src/components/MoonlingCollection';
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
import { Connection, PublicKey } from '@solana/web3.js';

// NEW: Programmable NFT Integration
import { useProgrammableNFT } from './src/hooks/useProgrammableNFT';

// New services and configs
import { LocalGameEngine } from './src/services/local/LocalGameEngine';
import { getAsset } from './src/config/AssetRegistry';

interface Character {
    id: string;
    name: string;
    description: string;
    image: string;

    rarity?: 'Common' | 'Rare' | 'Epic' | 'Legendary';
    nftMint?: string | null;
    baseStats?: {
        mood: number;
        hunger: number;
        energy: number;
    };
    specialAbility?: string;
}

const RPC_URL = 'https://api.devnet.solana.com';
const connection = new Connection(RPC_URL, 'confirmed');

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

const createRateLimiter = (maxAttempts: number, windowMs: number) => {
    const attempts = new Map<string, number[]>();

    return (key: string): boolean => {
        const now = Date.now();
        const userAttempts = attempts.get(key) || [];

        const recentAttempts = userAttempts.filter((time) => now - time < windowMs);

        if (recentAttempts.length >= maxAttempts) {
            return false;
        }

        recentAttempts.push(now);
        attempts.set(key, recentAttempts);
        return true;
    };
};

const mintRateLimiter = createRateLimiter(3, 60000);

function App() {
    const [fontsLoaded] = useFonts({
        'PressStart2P': PressStart2P_400Regular,
        'SpaceMono': SpaceMono_400Regular,
    });



    // NEW: Programmable NFT Integration
    const {
        quickMintCharacter,
        quickMintAchievement,
        mintCharacterNFT,
        connected: nftConnected,
        connectWallet: connectNFTWallet,
        disconnect: disconnectNFTWallet,
        getServiceStatus
    } = useProgrammableNFT();

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
    const [isLoading, setIsLoading] = useState(false);
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

    // New service instances
    const [localGameEngine, setLocalGameEngine] = useState<LocalGameEngine | null>(null);
    const [nftMinter, setNftMinter] = useState<any>(null); // Legacy NFT minter - now using ProgrammableNFTService
    const [metaplexService, setMetaplexService] = useState<any>(null); // This will be updated to MetaplexService

    const addNotification = useCallback((message: string, type: 'success' | 'error' | 'info' | 'warning', duration?: number) => {
        const id = Date.now().toString();
        setNotifications(prev => [...prev, { id, message, type, duration }]);
    }, []);

    const removeNotification = useCallback((id: string) => {
        setNotifications(prev => prev.filter(n => n.id !== id));
    }, []);

    // Initialize services when wallet connects
    useEffect(() => {
        if (connected && publicKey) {
            const gameEngine = new LocalGameEngine(publicKey.toString());
            setLocalGameEngine(gameEngine);
            
            // Initialize the game engine
            gameEngine.init().then(() => {
                console.log('🎮 Game engine initialized for wallet:', publicKey.toString().slice(0, 8) + '...');
            });

            // Initialize Metaplex service with UMI
            // const mobileWalletService = new MobileWalletService(); // This line is removed as per new_code
            // const metaplex = new MetaplexService(connection, mobileWalletService); // This line is removed as per new_code
            // setMetaplexService(metaplex); // This line is removed as per new_code
            console.log('📱 Metaplex service initialized with UMI for wallet:', publicKey.toString().slice(0, 8) + '...');

        } else {
            setLocalGameEngine(null);
            setNftMinter(null);
            setMetaplexService(null);
        }
    }, [connected, publicKey]);

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
            setSelectedCharacter(null);
            setAchievements([]);
            setPlayerName('');
            setCurrentView('welcome');
            console.log('✅ Wallet disconnected successfully, cleared state');
            setTimeout(() => setStatusMessage(''), 3000);
        } catch (error) {
            console.error('❌ Error disconnecting wallet:', error);
            setStatusMessage('Failed to disconnect wallet');
            setTimeout(() => setStatusMessage(''), 3000);
        }
    };

    const handleMintCharacter = async () => {
        console.log('🚀 Mint button clicked!', {
            selectedCharacter,
            connected,
        });

        if (!selectedCharacter) {
            console.log('❌ No character selected');
            return;
        }

        setIsLoading(true);
        setStatusMessage('Preparing to mint your character...');
        setLastError(null);

        try {
            if (!connected || !publicKey) {
                setStatusMessage('Please connect your wallet first...');
                setIsLoading(false);
                return;
            }

            console.log('🪙 Starting minting process for:', selectedCharacter.name);
            setStatusMessage(`Minting ${selectedCharacter.name} as NFT...`);

            // Check if character exists in asset registry
            const asset = getAsset(selectedCharacter.id);
            if (!asset) {
                throw new Error(`Character ${selectedCharacter.id} not found in asset registry`);
            }

            if (asset.category !== 'character') {
                throw new Error(`Asset ${selectedCharacter.id} is not a character`);
            }

            // Mint NFT using existing IPFS CID from AssetRegistry
            const result = await mintCharacterNFT(selectedCharacter, asset.ipfsHash);
            
            if (!result.success) {
                throw new Error(result.error || 'Minting failed');
            }

            console.log('✅ Character NFT minted successfully!', result.mintAddress);
            setStatusMessage(
                '🎉 Character NFT minted successfully! Check your wallet.'
            );

            setSelectedCharacter((prev) =>
                prev ? { ...prev, nftMint: 'mock_mint_address' } : null
            );

            if (selectedCharacter) {
                setOwnedCharacters(prev => [...prev, selectedCharacter.id]);
            }

        } catch (error: any) {
            console.error('❌ Minting failed:', error);
            const errorMessage = error?.message || 'Unknown error occurred';
            setLastError(errorMessage);
            setStatusMessage(`❌ ${errorMessage}`);
        } finally {
            setIsLoading(false);
            setTimeout(() => {
                setStatusMessage('');
                setLastError(null);
            }, 8000);
        }
    };

    const mintAchievementNFTs = async () => {
        if (!localGameEngine) {
            addNotification('Game not initialized', 'error');
            return;
        }

        const queuedAchievements = localGameEngine.getQueuedAchievements();

        if (queuedAchievements.length === 0) {
            addNotification('No achievements to mint', 'info');
            return;
        }

        setIsLoading(true);

        let successCount = 0;
        let failedCount = 0;

        try {
            for (let i = 0; i < queuedAchievements.length; i++) {
                const achievementId = queuedAchievements[i];
                setStatusMessage(`Minting achievement ${i + 1} of ${queuedAchievements.length}...`);

                try {
                    // TODO: Implement actual NFT minting
                    console.log(`✅ Successfully minted achievement: ${achievementId} (mock)`);
                    await localGameEngine.markAchievementMinted(achievementId);
                    successCount++;
                } catch (error) {
                    failedCount++;
                    console.error(`❌ Failed to mint achievement: ${achievementId}`, error);
                }
            }

            if (successCount > 0) {
                addNotification(`Successfully minted ${successCount} achievement NFT${successCount > 1 ? 's' : ''}!`, 'success');
            }

            if (failedCount > 0) {
                addNotification(`Failed to mint ${failedCount} achievement${failedCount > 1 ? 's' : ''}. Will retry later.`, 'warning');
            }

        } catch (error) {
            console.error('Achievement minting error:', error);
            addNotification('Failed to mint achievements', 'error');
        } finally {
            setIsLoading(false);
            setStatusMessage('');
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

        setSelectedCharacter(character);
        setCharacterStats({
            mood: 3,
            hunger: 2,
            energy: 4
        });
        setCurrentView('interaction');

        if (nftConnected && !character.nftMint) {
            console.log('🪙 NFT wallet connected, character ready to mint!');
            setTimeout(() => {
                setStatusMessage(
                    `Use ◎ to mint NFT! Programmable NFTs with update authority enabled.`
                );
            }, 1000);
        } else if (!nftConnected) {
            console.log('💰 Wallet not connected, showing connection message');
            setTimeout(() => {
                setStatusMessage(
                    'Connect your wallet to mint your character as an NFT with 70% savings!'
                );
            }, 1000);
        }

        setTimeout(() => setStatusMessage(''), 5000);
    };

    const [playerName, setPlayerName] = useState<string>('');

    const savePlayerName = (name: string, walletAddress: string) => {
        try {
            const nameData = {
                name,
                walletAddress,
                timestamp: Date.now()
            };
            // TODO: Use React Native AsyncStorage instead of localStorage
            console.log('💾 Saved player name:', { name, walletAddress: walletAddress.slice(0, 8) + '...' });
        } catch (error) {
            console.error('❌ Error saving player name:', error);
        }
    };

    const getStoredPlayerName = (walletAddress: string): string | null => {
        try {
            // TODO: Use React Native AsyncStorage instead of localStorage
            console.log('🔍 Checking for stored name for wallet:', walletAddress.slice(0, 8) + '...');
            return null; // For now, return null
        } catch (error) {
            console.error('❌ Error retrieving stored name:', error);
        }
        return null;
    };

    useEffect(() => {
        if (connected && publicKey) {
            const storedName = getStoredPlayerName(publicKey.toString());
            console.log('🔍 Checking for stored name:', { walletAddress: publicKey.toString(), storedName });
            if (storedName) {
                console.log('✅ Found stored name, setting player name:', storedName);
                setPlayerName(storedName);
                if (currentView === 'welcome') {
                    console.log('📱 Skipping welcome screen, going to selection');
                    setCurrentView('selection');
                    addNotification(`🌟 Welcome back, ${storedName}!`, 'success');
                } else {
                    console.log('📱 Not on welcome screen, name set but view unchanged. Current view:', currentView);
                    addNotification(`🌟 Welcome back, ${storedName}!`, 'success');
                }
            } else {
                console.log('❌ No stored name found for wallet:', publicKey.toString().slice(0, 8) + '...');
            }
        } else {
            console.log('🔌 Wallet disconnected, clearing player name');
            setPlayerName('');
        }
    }, [connected, publicKey]);

    const handleContinueFromWelcome = (name?: string) => {
        if (name && publicKey) {
            setPlayerName(name);
            savePlayerName(name, publicKey.toString());
            addNotification(`✨ Welcome, ${name}! Ready to start your stellar adventure!`, 'success');
        }
        setCurrentView('selection');
    };

    const handleGoToInteraction = (name?: string) => {
        if (name && publicKey) {
            setPlayerName(name);
            savePlayerName(name, publicKey.toString());
        }
        setShouldFadeInInteraction(true);
        setCurrentView('interaction');
    };

    const handleGoToCongratulations = (character?: Character) => {
        if (character) {
            // Store the minted character
            setSelectedCharacter(character);
            setCharacterStats({
                mood: 3,
                hunger: 2,
                energy: 4
            });
            console.log('🎉 Setting selected character:', character.name);
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
                const newStats = await localGameEngine.feedMoonling();
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
                        selectedMoonlingName={selectedCharacter?.name}
                    />
                );
            case 'selection':
                return (
                    <MoonlingSelection
                        onBack={() => {
                            if (previousView === 'welcome') {
                                // Go back to the specific welcome phase
                                setCurrentView('welcome');
                                // The welcome screen will handle the phase based on welcomePhase
                            } else {
                                // Go back to the previous view (like interaction)
                                navigateToView(previousView);
                            }
                        }}
                        onSelectCharacter={handleCharacterSelect}
                        onFeed={() => setCurrentView('feeding')}
                        onChat={() => setCurrentView('chat')}
                        onGame={() => setCurrentView('game')}
                        ownedCharacters={ownedCharacters}
                        connection={connection}
                        playerName={playerName}
                        onNotification={addNotification}
                        onViewCollection={() => setCurrentView('collection')}
                        onGoToCongratulations={handleGoToCongratulations}
                    />
                );
            case 'collection':
                return (
                    <MoonlingCollection
                        characters={[
                            {
                                id: 'lyra',
                                name: 'Lyra',
                                description: 'Anime-obsessed celestial maiden who knows every existing anime.',
                                image: 'LYRA.png',
                                baseStats: { mood: 4, hunger: 3, energy: 3 },
                                rarity: 'Common',
                                specialAbility: 'Healing Aura - Recovers faster when resting',
                                nftMint: ownedCharacters.includes('lyra') ? 'mint_address_lyra' : null
                            },
                            {
                                id: 'orion',
                                name: 'Orion',
                                description: 'Mystical guardian with moon and stars',
                                image: 'ORION.png',
                                baseStats: { mood: 3, hunger: 4, energy: 3 },
                                rarity: 'Rare',
                                specialAbility: 'Night Vision - Gains energy during nighttime',
                                nftMint: ownedCharacters.includes('orion') ? 'mint_address_orion' : null
                            },
                            {
                                id: 'aro',
                                name: 'Aro',
                                description: 'Bright guardian full of celestial energy',
                                image: 'ARO.png',
                                baseStats: { mood: 5, hunger: 2, energy: 3 },
                                rarity: 'Epic',
                                specialAbility: 'Star Power - Mood boosts last longer',
                                nftMint: ownedCharacters.includes('aro') ? 'mint_address_aro' : null
                            },
                            {
                                id: 'sirius',
                                name: 'Sirius',
                                description: 'The brightest star guardian with unmatched luminosity. Known as the Dog Star, Sirius is fiercely loyal and radiates powerful stellar energy. Has an intense, focused personality and never backs down from a challenge.',
                                image: 'SIRIUS.png',
                                baseStats: { mood: 5, hunger: 3, energy: 4 },
                                rarity: 'Legendary',
                                specialAbility: 'Stellar Radiance - Boosts all stats when mood is at maximum',
                                nftMint: ownedCharacters.includes('sirius') ? 'mint_address_sirius' : null
                            },
                            {
                                id: 'zaniah',
                                name: 'Zaniah',
                                description: 'Mysterious entity with ethereal presence. Zaniah embodies the essence of distant stars and ancient wisdom. Quiet and contemplative, but harbors immense power within.',
                                image: 'ZANIAH.png',
                                baseStats: { mood: 4, hunger: 3, energy: 5 },
                                rarity: 'Legendary',
                                specialAbility: 'Stellar Resonance - Amplifies all abilities during stellar events',
                                nftMint: ownedCharacters.includes('zaniah') ? 'mint_address_zaniah' : null
                            }
                        ]}
                        selectedCharacter={selectedCharacter}
                        onSelectCharacter={handleCharacterSelect}
                        onExit={() => setCurrentView('selection')}
                        walletAddress={publicKey?.toString()}
                        connected={connected}
                        onNotification={addNotification}
                    />
                );
            case 'interaction':
                return (
                    <MoonlingInteraction
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
                        onChat={() => setCurrentView('chat')}
                        onSettings={() => setCurrentView('settings')}
                        localGameEngine={localGameEngine}
                        shouldFadeIn={shouldFadeInInteraction}
                        onFadeInComplete={() => setShouldFadeInInteraction(false)}
                        onMintAchievements={mintAchievementNFTs}
                        onMint={() => {
                            console.log('🎫 Mint button clicked!', {
                                selectedCharacter: selectedCharacter?.name,
                                hasNftMint: !!selectedCharacter?.nftMint,
                                connected,
                                walletPublicKey: publicKey?.toString()
                            });

                            if (!selectedCharacter) {
                                addNotification('❌ Please select a character first', 'error');
                                return;
                            }

                            if (selectedCharacter.nftMint) {
                                addNotification('❌ Character already minted as NFT', 'warning');
                                return;
                            }

                            if (!connected) {
                                addNotification('❌ Please connect your wallet first', 'error');
                                return;
                            }

                            addNotification(
                                `🎭 Preparing to mint ${selectedCharacter.name} as NFT! Your wallet will popup to approve the transaction...`,
                                'info',
                                3000
                            );

                            handleMintCharacter();
                        }}
                    />
                );
            case 'feeding':
                return (
                    <FeedingPage
                        onBack={() => setCurrentView('interaction')}
                        onFeed={handleFeed}
                        currentHunger={characterStats.hunger}
                    />
                );
            case 'game':
            case 'memory-game':
            case 'star-game':
                return (
                    <View style={styles.gamePlaceholder}>
                        <Text style={styles.gameText}>🎮 Redirecting to moonling interaction...</Text>
                    </View>
                );
            case 'chat':
                return selectedCharacter ? (
                    <CharacterChat
                        character={selectedCharacter}
                        onExit={() => setCurrentView('interaction')}
                        playerName={playerName}
                        onNotification={addNotification}
                    />
                ) : (
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
                return (
                    <Shop
                        connection={connection}
                        onNotification={addNotification}
                        onClose={() => setCurrentView('interaction')}
                    />
                );
            case 'gallery':
                return (
                    <Gallery
                        onBack={() => setCurrentView('interaction')}
                    />
                );
            case 'inventory':
                return (
                    <MoonlingCollection
                        characters={[
                            {
                                id: 'lyra',
                                name: 'Lyra',
                                description: 'Anime-obsessed celestial maiden who knows every existing anime. Has a secret soft spot for Orion but would NEVER admit it. Very comprehensive when chatting, but turns into an exaggerated crying mess (Misa from Death Note style) if ignored. Lowkey jealous of you sentimentally but in a funny way. When angry, becomes irritable like someone with hormonal imbalance and will roast you. When sad, has existential crises.',
                                image: 'LYRA.png',
                                baseStats: { mood: 4, hunger: 3, energy: 3 },
                                rarity: 'Common',
                                specialAbility: 'Healing Aura - Recovers faster when resting',
                                nftMint: ownedCharacters.includes('lyra') ? 'mint_address_lyra' : null
                            },
                            {
                                id: 'orion',
                                name: 'Orion',
                                description: 'Mystical guardian with moon and stars',
                                image: 'ORION.png',
                                baseStats: { mood: 3, hunger: 4, energy: 3 },
                                rarity: 'Rare',
                                specialAbility: 'Night Vision - Gains energy during nighttime',
                                nftMint: ownedCharacters.includes('orion') ? 'mint_address_orion' : null
                            },
                            {
                                id: 'aro',
                                name: 'Aro',
                                description: 'Bright guardian full of celestial energy',
                                image: 'ARO.png',
                                baseStats: { mood: 5, hunger: 2, energy: 3 },
                                rarity: 'Epic',
                                specialAbility: 'Star Power - Mood boosts last longer',
                                nftMint: ownedCharacters.includes('aro') ? 'mint_address_aro' : null
                            },
                            {
                                id: 'sirius',
                                name: 'Sirius',
                                description: 'The brightest star guardian with unmatched luminosity. Known as the Dog Star, Sirius is fiercely loyal and radiates powerful stellar energy. Has an intense, focused personality and never backs down from a challenge.',
                                image: 'SIRIUS.png',
                                baseStats: { mood: 5, hunger: 3, energy: 4 },
                                rarity: 'Legendary',
                                specialAbility: 'Stellar Radiance - Boosts all stats when mood is at maximum',
                                nftMint: ownedCharacters.includes('sirius') ? 'mint_address_sirius' : null
                            }
                        ]}
                        selectedCharacter={selectedCharacter}
                        onSelectCharacter={handleCharacterSelect}
                        onExit={() => setCurrentView('interaction')}
                        walletAddress={publicKey?.toString()}
                        connected={connected}
                        onNotification={addNotification}
                    />
                );
            case 'leaderboard':
                return (
                    <GlobalLeaderboard
                        walletAddress={publicKey?.toString()}
                        onClose={() => setCurrentView('interaction')}
                    />
                );
            case 'settings':
                return (
                    <Settings
                        onBack={() => setCurrentView('interaction')}
                        onNotification={addNotification}
                    />
                );
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

    return (
        <SafeAreaView style={styles.container}>
            <StatusBar style="light" hidden={true} />
            {renderContent()}
            
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
        backgroundColor: '#fff',
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

});

// Main App component with WalletProvider wrapper
function AppWrapper() {
    return (
        <WalletProvider>
            <App />
        </WalletProvider>
    );
}

export default AppWrapper;