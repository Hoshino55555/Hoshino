import React, { useState, useEffect, useCallback, ReactNode } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, SafeAreaView, Image } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useFonts } from 'expo-font';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import {
    PressStart2P_400Regular,
} from '@expo-google-fonts/press-start-2p';

// Hold the native splash up until the auth handshake + fonts have all
// resolved. Without this, the user sees: native splash → brief "Loading…"
// text → blank frame while fonts load → finally the real UI. AuthGate is
// the single place that calls hideAsync (see below) once everything we
// need to first-paint is ready.
SplashScreen.preventAutoHideAsync().catch(() => {});

import Notification from './src/components/Notification';
import WalletButton from './src/components/WalletButton';

// React Native compatible wallet integration
import { useWallet, WalletProvider } from './src/contexts/WalletContext';
import { ChromeProvider } from './src/contexts/ChromeContext';
import { HoshinoPrivyProvider } from './src/contexts/PrivyContext';
import { usePrivy } from '@privy-io/expo';
import LoginScreen from './src/components/LoginScreen';
import { DeviceCasing, DeviceButtons } from './src/components/DeviceChrome';
import ZoomOutOverlay from './src/components/ZoomOutOverlay';
import { Logos } from './src/assets';
import { Connection } from '@solana/web3.js';

import { ENABLE_VRF_DEV_SCREEN } from './src/config/vrf';
import { FirebaseAuthProvider, useFirebaseAuth } from './src/contexts/FirebaseAuthContext';
import { GameStateProvider, useGameStateContext } from './src/contexts/GameStateContext';
import { useAppNavigationTransition } from './src/hooks/useAppNavigationTransition';
import { usePlayerProfile } from './src/hooks/usePlayerProfile';
import { useWidgetDeepLinks } from './src/hooks/useWidgetDeepLinks';
import AppRouteLayers from './src/navigation/AppRouteLayers';
import SleepController from './src/navigation/SleepController';
import WidgetSnapshotController from './src/widgets/WidgetSnapshotController';
import type {
    AppCharacter as Character,
    AppNotificationType,
    AppView,
} from './src/types/AppTypes';

const RPC_URL = 'https://api.devnet.solana.com';
const connection = new Connection(RPC_URL, 'confirmed');

function App() {
    const { connected, publicKey, connect, disconnect, email, walletSource } = useWallet();
    const { firebaseUid } = useFirebaseAuth();
    const {
        currentView,
        previousView,
        transitionPhase,
        replaceView,
        transitionTo,
        navigateToView,
        handleIrisClosed,
        handleIrisOpened,
    } = useAppNavigationTransition<AppView>('welcome');
    const [welcomePhase, setWelcomePhase] = useState<string>('intro');
    const [shouldGoToCongratulations, setShouldGoToCongratulations] = useState(false);
    const [shouldFadeInInteraction, setShouldFadeInInteraction] = useState(false);

    // Sleep modal opens from the room's sleep menu button. The modal itself
    // doesn't need the iris (it's a transient confirmation), but the
    // start-sleep + wake actions it triggers DO route through transitionTo.
    // SleepController consumes this flag.
    const [sleepModalVisible, setSleepModalVisible] = useState(false);

    const [lastError, setLastError] = useState<string | null>(null);
    const [notifications, setNotifications] = useState<Array<{
        id: string;
        message: string;
        type: AppNotificationType;
        duration?: number;
    }>>([]);
    const addNotification = useCallback((message: string, type: AppNotificationType, duration?: number) => {
        const id = Date.now().toString();
        setNotifications([{ id, message, type, duration }]);
    }, []);

    const removeNotification = useCallback((id: string) => {
        setNotifications(prev => prev.filter(n => n.id !== id));
    }, []);

    const walletAddress = publicKey?.toString() ?? null;
    const {
        playerName,
        selectedCharacter,
        profileSettled,
        hydrationComplete,
        savePlayerName,
        updatePlayerName,
        selectCharacter,
    } = usePlayerProfile({
        walletAddress,
        firebaseUid,
        replaceView,
        onNotification: addNotification,
    });
    const {
        pendingWidgetAction,
        clearPendingWidgetAction,
    } = useWidgetDeepLinks({
        selectedCharacterId: selectedCharacter?.id,
        profileSettled,
        replaceView,
    });

    const navigateToSelection = (fromPhase?: string, name?: string) => {
        if (fromPhase) {
            setWelcomePhase(fromPhase);
        }
        const trimmed = name?.trim();
        if (trimmed && trimmed.length > 0) {
            savePlayerName(trimmed, { trimForState: true });
        }
        navigateToView('selection');
    };

    useEffect(() => {
        return () => {
            setLastError(null);
        };
    }, []);

    const connectWallet = async () => {
        setLastError(null);

        try {
            console.log('🔌 Connect wallet clicked, current state:', {
                connected,
                publicKey: publicKey?.toString(),
            });

            if (connected) {
                addNotification('Wallet already connected! 🎉', 'success');
                return;
            }

            console.log('🔄 Attempting to connect to wallet...');
            addNotification('Connecting to wallet...', 'info');

            await connect();

            console.log('✅ Wallet connected successfully!', {
                publicKey: publicKey?.toString(),
                connected
            });

            addNotification('Wallet connected successfully! 🎉', 'success');
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
            addNotification(errorMessage, 'error');

            setTimeout(() => {
                setLastError(null);
            }, 5000);
        }
    };

    const disconnectWallet = async () => {
        try {
            console.log('🔌 Disconnecting wallet...');
            await disconnect();
            addNotification('Wallet disconnected', 'info');
            console.log('✅ Wallet disconnected successfully');
        } catch (error) {
            console.error('❌ Error disconnecting wallet:', error);
            addNotification('Failed to disconnect wallet', 'error');
        }
    };

    const handleContinueFromWelcome = (name?: string) => {
        if (name) {
            savePlayerName(name);
            addNotification(`✨ Welcome, ${name}! Ready to start your stellar adventure!`, 'success');
        }
        replaceView('selection');
    };

    const handleGoToInteraction = (name?: string) => {
        if (name) {
            savePlayerName(name);
        }
        setShouldFadeInInteraction(true);
        replaceView('interaction');
    };

    const handleGoToCongratulations = (character?: Character) => {
        if (character) {
            const restoredCharacter = selectCharacter(character);
            console.log('🎉 Setting selected character:', restoredCharacter.name);
        }
        setShouldGoToCongratulations(true);
        replaceView('welcome');
        // Reset the flag after a longer delay to ensure WelcomeScreen has time to render
        setTimeout(() => {
            setShouldGoToCongratulations(false);
        }, 1000);
    };

    // Hold a splash-colored shim until the wallet has resolved AND its
    // profile has hydrated. Without this, returning users paint a frame
    // of WelcomeScreen before the profile hook can restore interaction.
    if (!hydrationComplete) {
        return <SplashShim />;
    }

    return (
        <GameStateProvider characterId={selectedCharacter?.id ?? null}>
        <GameStateGate hasCharacter={!!selectedCharacter}>
        <WidgetSnapshotController selectedCharacter={selectedCharacter} />
        <SafeAreaView style={styles.container}>
            <StatusBar style="light" hidden={true} />
            {/* Single global iris. Everything that should be hidden during a
                page transition lives inside this overlay — the interaction
                layer, full-screen route surface, the chrome buttons, the
                wallet pill, and notifications. Per-screen iris instances
                were removed so there's exactly one Reanimated timer running
                a transition at any time. The iris is "open" (FINAL_SCALE)
                while transitionPhase is idle/opening and "closed"
                (INITIAL_SCALE) while closing/covered. handleIrisClosed
                swaps currentView during the covered window so the new
                screen mounts and paints behind the still-closed iris
                before the open animation kicks off. */}
            <ZoomOutOverlay
                exiting={transitionPhase === 'closing' || transitionPhase === 'covered'}
                initialOpen
                onExitComplete={handleIrisClosed}
                onOpenComplete={handleIrisOpened}
            >
                <AppRouteLayers
                    currentView={currentView}
                    previousView={previousView}
                    selectedCharacter={selectedCharacter}
                    connected={connected}
                    walletAddress={walletAddress ?? undefined}
                    playerName={playerName}
                    connection={connection}
                    email={email}
                    walletSource={walletSource}
                    shouldFadeInInteraction={shouldFadeInInteraction}
                    pendingWidgetAction={pendingWidgetAction}
                    shouldGoToCongratulations={shouldGoToCongratulations}
                    welcomePhase={welcomePhase}
                    selectedMoonokoName={selectedCharacter?.name}
                    onNotification={addNotification}
                    onConnectWallet={connectWallet}
                    onContinueFromWelcome={handleContinueFromWelcome}
                    onGoToInteraction={handleGoToInteraction}
                    onGoToSelection={navigateToSelection}
                    onGoToCongratulations={handleGoToCongratulations}
                    onUpdatePlayerName={updatePlayerName}
                    onLogout={disconnectWallet}
                    onSleepRequest={() => setSleepModalVisible(true)}
                    onInteractionFadeInComplete={() => setShouldFadeInInteraction(false)}
                    onWidgetActionConsumed={clearPendingWidgetAction}
                    clearInteractionFadeIn={() => setShouldFadeInInteraction(false)}
                    replaceView={replaceView}
                    transitionTo={transitionTo}
                    navigateToView={navigateToView}
                />

                {/* Sleep is App-level — SleepController owns the modal,
                    SleepScreen overlay, and morning recap. Lives inside the
                    iris so its overlay is hidden during page transitions and
                    inside GameStateProvider so it can call startSleep /
                    endSleep / drainForaged directly. */}
                <SleepController
                    currentView={currentView}
                    transitionTo={transitionTo}
                    selectedCharacter={selectedCharacter}
                    sleepModalVisible={sleepModalVisible}
                    setSleepModalVisible={setSleepModalVisible}
                    playerName={playerName}
                    onNotification={addNotification}
                />

                {/* Chrome (DeviceButtons + WalletButton + notifications) sits
                    inside the iris with no zIndex of its own — natural render
                    order puts it on top of the interaction layer on the home
                    screen, but BEHIND the zIndex:50 full-screen route surface
                    when Shop/Inventory/Settings/etc. is up. The iris covers
                    it during page transitions because the iris is the last
                    sibling rendered inside ZoomOutOverlay's wrapper. */}
                {/* DeviceCasing — sits ABOVE the interaction layer (z 0) so the
                    painted frame overlaps the InnerScreen edges and hides
                    the seam, but BELOW full-screen routes (z 50) so screens
                    like Shop/Inventory/Settings paint over it on their
                    own routes. DeviceButtons, WalletButton (1000),
                    notifications, and the iris layers all sit above. */}
                <View
                    style={[StyleSheet.absoluteFill, { zIndex: 20, elevation: 20 }]}
                    pointerEvents="none"
                >
                    <DeviceCasing />
                </View>

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
                    publicKey={walletAddress}
                    playerName={playerName}
                    onConnect={connectWallet}
                    onOpenProfile={() => navigateToView('profile')}
                />

                {notifications.map((notification, i) => (
                    <Notification
                        key={notification.id}
                        message={notification.message}
                        type={notification.type}
                        index={i}
                        onClose={() => removeNotification(notification.id)}
                    />
                ))}

            </ZoomOutOverlay>
        </SafeAreaView>
        </GameStateGate>
        </GameStateProvider>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: 'black',
    },
    splashFill: {
        flex: 1,
        backgroundColor: '#211F37',
    },
    // Composed onto splashFill in the AuthGate not-ready and App-level
    // hydration shims. Kept as a separate style so splashFill's children
    // (LoginScreen / <App />) layout normally when ready=true and we're
    // not painting the shim.
    splashCenter: {
        alignItems: 'center',
        justifyContent: 'center',
    },
    // Absolute dp (RN treats unitless numbers as dp on Android) so the
    // JS shim matches the native Android 12 splash icon size, which is
    // also dp-based — the OS splash framework renders the icon at
    // ~108dp visible inside a 192dp safezone. Percentage-based widths
    // were drifting by enough to feel like a size jump on the native →
    // JS hand-off; absolute dp makes both sides identical.
    splashLogo: {
        width: 192,
        height: 192,
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

// Shared splash shim: same image + bg as the native splash, sized to
// match the native Android 12 icon safezone. Used by AuthGate (Privy +
// Firebase exchange), App's profile-hydration gate, and GameStateGate
// (first server fetch) so the user sees one continuous splash across
// all three async windows.
function SplashShim() {
    return (
        <View style={[styles.splashFill, styles.splashCenter]}>
            <Image
                source={Logos.star}
                style={styles.splashLogo}
                resizeMode="contain"
            />
        </View>
    );
}

// Holds the splash through the first GameStateService.getState() round-
// trip when a character is selected. Without this, MoonokoInteraction
// mounts with `gameState === null` and renders fallback default stats
// (mood:3, hunger:5, energy:3) for a few hundred ms before the server
// response repaints them — visible as the stat stars jumping at first
// paint. New users with no selectedCharacter bypass the gate so they
// can reach the selection flow.
function GameStateGate({
    hasCharacter,
    children,
}: {
    hasCharacter: boolean;
    children: ReactNode;
}) {
    const { state } = useGameStateContext();
    if (hasCharacter && !state) {
        return <SplashShim />;
    }
    return <>{children}</>;
}

interface AuthGateProps {
    fontsLoaded: boolean;
}

function AuthGate({ fontsLoaded }: AuthGateProps) {
    const { user, isReady: privyReady } = usePrivy();
    const { ready: firebaseReady } = useFirebaseAuth();

    // Hold the native splash until everything required for the first
    // visible frame has resolved. For logged-out users that's just Privy
    // + fonts (we're about to show LoginScreen). For logged-in users we
    // also wait for the Privy→Firebase token exchange so the first frame
    // of <App /> already has firebaseUid in hand and game state can fire
    // its initial fetch immediately rather than after a perceptible beat.
    const ready = fontsLoaded && privyReady && (!user || firebaseReady);

    // Always render a full-bleed View painted in the splash background
    // color (#211F37) so the splash → first-content transition stays one
    // continuous color. The Activity's windowBackground is also #211F37
    // (set via android.backgroundColor in app.json), so even if the JS
    // splashFill hasn't painted by the time we hide, there's nothing to
    // flash to.
    //
    // Why useEffect + RAF instead of onLayout: onLayout only fires when
    // the host view's geometry changes. The outer splashFill View stays
    // flex:1 throughout, so onLayout fires once on mount (when ready is
    // still false) and never again — the splash would stay up forever
    // even after auth completes. RAF defers one frame so the conditional
    // child has painted before we drop the OS splash.
    useEffect(() => {
        if (!ready) return;
        const id = requestAnimationFrame(() => {
            SplashScreen.hideAsync().catch(() => {});
        });
        return () => cancelAnimationFrame(id);
    }, [ready]);

    if (!ready) {
        return <SplashShim />;
    }

    return (
        <View style={styles.splashFill}>
            {user ? (
                <App />
            ) : (
                <SafeAreaView style={styles.container}>
                    <LoginScreen />
                </SafeAreaView>
            )}
        </View>
    );
}

function AppWrapper() {
    const [fontsLoaded] = useFonts({
        'PressStart2P': PressStart2P_400Regular,
        '04b03': require('./assets/fonts/04b03.ttf'),
        // Primary UI font as of 0.1.16 — replaces PressStart2P everywhere
        // except the sleep arc (Sleep* + MorningRecapModal), which stays on
        // 04b03/PressStart2P for the dreamy bedtime palette.
        'Monaco': require('./assets/fonts/Monaco.ttf'),
        'Minecraft': require('./assets/fonts/Minecraft.ttf'),
        'MacMinecraft': require('./assets/fonts/MacMinecraft.ttf'),
        'MacMinecraftTweaked': require('./assets/fonts/MacMinecraftTweaked.ttf'),
    });

    return (
        <SafeAreaProvider>
            <HoshinoPrivyProvider>
                <FirebaseAuthProvider>
                    <WalletProvider>
                        <ChromeProvider>
                            <AuthGate fontsLoaded={fontsLoaded} />
                        </ChromeProvider>
                    </WalletProvider>
                </FirebaseAuthProvider>
            </HoshinoPrivyProvider>
        </SafeAreaProvider>
    );
}

export default AppWrapper;
