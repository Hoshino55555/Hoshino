import React, { type ReactNode } from 'react';
import {
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import type { Connection } from '@solana/web3.js';

import CharacterChat from '../components/chat/CharacterChat';
import FeedingPage from '../components/feeding/FeedingPage';
import Gallery from '../components/room/Gallery';
import GamesList from '../components/games/GamesList';
import InventoryPage from '../components/inventory/InventoryPage';
import MoonokoInteraction from '../components/home/MoonokoInteraction';
import MoonokoSelection from '../components/welcome/MoonokoSelection';
import Profile from '../components/settings/Profile';
import Settings from '../components/settings/Settings';
import Shop from '../components/shop/Shop';
import Starburst from '../components/games/Starburst';
import WaterRingToss from '../components/games/WaterRingToss';
import WelcomeScreen from '../components/welcome/WelcomeScreen';
import { useGameStateContext } from '../contexts/GameStateContext';
import type {
    AppCharacter,
    AppNotificationHandler,
    AppView,
    PendingWidgetAction,
} from '../types/AppTypes';

interface AppRouteLayersProps {
    currentView: AppView;
    previousView: AppView;
    selectedCharacter: AppCharacter | null;
    connected: boolean;
    walletAddress?: string;
    playerName: string;
    connection: Connection;
    email: string | null;
    walletSource?: string | null;
    shouldFadeInInteraction: boolean;
    pendingWidgetAction: PendingWidgetAction | null;
    shouldGoToCongratulations: boolean;
    welcomePhase: string;
    selectedMoonokoName?: string;
    onNotification: AppNotificationHandler;
    onConnectWallet: () => void;
    onContinueFromWelcome: (name?: string) => void;
    onGoToInteraction: (name?: string) => void;
    onGoToSelection: (fromPhase?: string, name?: string) => void;
    onGoToCongratulations: (character?: AppCharacter) => void;
    onUpdatePlayerName: (name: string) => void;
    onLogout: () => void;
    onSleepRequest: () => void;
    onInteractionFadeInComplete: () => void;
    onWidgetActionConsumed: () => void;
    clearInteractionFadeIn: () => void;
    replaceView: (view: AppView) => void;
    transitionTo: (view: AppView) => void;
    navigateToView: (view: AppView) => void;
}

export default function AppRouteLayers({
    currentView,
    previousView,
    selectedCharacter,
    connected,
    walletAddress,
    playerName,
    connection,
    email,
    walletSource,
    shouldFadeInInteraction,
    pendingWidgetAction,
    shouldGoToCongratulations,
    welcomePhase,
    selectedMoonokoName,
    onNotification,
    onConnectWallet,
    onContinueFromWelcome,
    onGoToInteraction,
    onGoToSelection,
    onGoToCongratulations,
    onUpdatePlayerName,
    onLogout,
    onSleepRequest,
    onInteractionFadeInComplete,
    onWidgetActionConsumed,
    clearInteractionFadeIn,
    replaceView,
    transitionTo,
    navigateToView,
}: AppRouteLayersProps) {
    const renderRootRoute = () => {
        switch (currentView) {
            case 'welcome':
                return (
                    <WelcomeScreen
                        onContinue={onContinueFromWelcome}
                        onGoToInteraction={onGoToInteraction}
                        onGoToSelection={onGoToSelection}
                        connected={connected}
                        onConnectWallet={onConnectWallet}
                        playerName={playerName}
                        goToCongratulations={shouldGoToCongratulations}
                        initialPhase={welcomePhase}
                        selectedMoonokoName={selectedMoonokoName}
                    />
                );
            case 'selection':
                return (
                    <MoonokoSelection
                        onBack={() => {
                            if (previousView === 'welcome') {
                                replaceView('welcome');
                            } else {
                                navigateToView(previousView);
                            }
                        }}
                        onNotification={onNotification}
                        onGoToCongratulations={onGoToCongratulations}
                    />
                );
            case 'chat':
                return selectedCharacter ? null : (
                    <NoCharacterRoute onSelect={() => replaceView('selection')} />
                );
            case 'vrf-dev': {
                const VRFTest = require('../components/_dev/VRFTest').default;
                return (
                    <VRFTest
                        onClose={() =>
                            replaceView(previousView === 'vrf-dev' ? 'welcome' : previousView)
                        }
                    />
                );
            }
            default:
                return null;
        }
    };

    const renderFullScreenRoute = () => {
        switch (currentView) {
            case 'feeding':
                return (
                    <FeedingPage
                        onBack={() => transitionTo('interaction')}
                        onNotification={onNotification}
                    />
                );
            case 'shop':
                return (
                    <Shop
                        connection={connection}
                        onNotification={onNotification}
                        onClose={() => transitionTo('interaction')}
                    />
                );
            case 'gallery':
                return <Gallery onBack={() => transitionTo('interaction')} />;
            case 'arcade':
                return (
                    <GamesList
                        onClose={() => transitionTo('interaction')}
                        onSelectGame={(gameId) => transitionTo(gameId)}
                    />
                );
            case 'starburst':
                return <StarburstView onBack={() => transitionTo('arcade')} />;
            case 'water-ring-toss':
                return <WaterRingTossView onBack={() => transitionTo('arcade')} />;
            case 'inventory':
                return <InventoryPage onBack={() => transitionTo('interaction')} />;
            case 'settings':
                return (
                    <Settings
                        onBack={() => transitionTo('interaction')}
                        onNotification={onNotification}
                    />
                );
            case 'profile':
                return (
                    <Profile
                        onBack={() => navigateToView(previousView || 'interaction')}
                        onNotification={onNotification}
                        playerName={playerName}
                        publicKey={walletAddress ?? null}
                        email={email}
                        walletSource={walletSource}
                        onUpdatePlayerName={onUpdatePlayerName}
                        onLogout={onLogout}
                    />
                );
            case 'chat':
                return selectedCharacter ? (
                    <CharacterChat
                        character={selectedCharacter}
                        onExit={() => transitionTo('interaction')}
                        playerName={playerName}
                        onNotification={onNotification}
                    />
                ) : null;
            default:
                return null;
        }
    };

    const fullScreenRoute = renderFullScreenRoute();

    return (
        <>
            {currentView === 'interaction' && (
                <View
                    key="interaction-layer"
                    style={StyleSheet.absoluteFill}
                    pointerEvents="box-none"
                >
                    <MoonokoInteraction
                        selectedCharacter={selectedCharacter}
                        onSelectCharacter={() => {
                            clearInteractionFadeIn();
                            transitionTo('selection');
                        }}
                        onFeed={() => transitionTo('feeding')}
                        connected={connected}
                        walletAddress={walletAddress}
                        playerName={playerName}
                        onNotification={onNotification}
                        onRefreshNFTs={() => {
                            onNotification('🔍 Checking wallet for NFTs...', 'info');
                        }}
                        onArcade={() => transitionTo('arcade')}
                        onSleepRequest={onSleepRequest}
                        onShop={() => transitionTo('shop')}
                        onInventory={() => transitionTo('inventory')}
                        onGallery={() => transitionTo('gallery')}
                        onChat={() => transitionTo('chat')}
                        onSettings={() => transitionTo('settings')}
                        shouldFadeIn={shouldFadeInInteraction}
                        onFadeInComplete={onInteractionFadeInComplete}
                        pendingWidgetAction={pendingWidgetAction}
                        onWidgetActionConsumed={onWidgetActionConsumed}
                    />
                </View>
            )}
            {fullScreenRoute && (
                <FullScreenRouteSurface>
                    {fullScreenRoute}
                </FullScreenRouteSurface>
            )}
            {!fullScreenRoute && currentView !== 'interaction' && renderRootRoute()}
        </>
    );
}

function NoCharacterRoute({ onSelect }: { onSelect: () => void }) {
    return (
        <View style={styles.noCharacterContainer}>
            <Text style={styles.noCharacterText}>Please select a character first!</Text>
            <TouchableOpacity onPress={onSelect} style={styles.selectButton}>
                <Text style={styles.selectButtonText}>Select Character</Text>
            </TouchableOpacity>
        </View>
    );
}

function FullScreenRouteSurface({ children }: { children: ReactNode }) {
    return (
        <View
            key="full-screen-route"
            style={[StyleSheet.absoluteFill, styles.fullScreenRouteSurface]}
            pointerEvents="box-none"
        >
            {children}
        </View>
    );
}

function StarburstView({ onBack }: { onBack: () => void }) {
    const { play } = useGameStateContext();
    return (
        <Starburst
            onBack={onBack}
            onGameEnd={(won) => {
                play(won).catch((e) => console.warn('play mood update failed', e));
            }}
        />
    );
}

function WaterRingTossView({ onBack }: { onBack: () => void }) {
    const { play } = useGameStateContext();
    return (
        <WaterRingToss
            onBack={onBack}
            onGameEnd={(won) => {
                play(won).catch((e) => console.warn('water ring toss mood update failed', e));
            }}
        />
    );
}

const styles = StyleSheet.create({
    fullScreenRouteSurface: {
        zIndex: 50,
        elevation: 50,
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
});
