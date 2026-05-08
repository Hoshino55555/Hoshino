import React, { useState, useEffect, useMemo, useCallback, useRef, ReactNode } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, SafeAreaView, Linking, Image } from 'react-native';
import Animated, {
    useSharedValue,
    useAnimatedStyle,
} from 'react-native-reanimated';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFonts } from 'expo-font';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import {
    PressStart2P_400Regular,
} from '@expo-google-fonts/press-start-2p';
import {
    SpaceMono_400Regular,
} from '@expo-google-fonts/space-mono';

// Hold the native splash up until the auth handshake + fonts have all
// resolved. Without this, the user sees: native splash → brief "Loading…"
// text → blank frame while fonts load → finally the real UI. AuthGate is
// the single place that calls hideAsync (see below) once everything we
// need to first-paint is ready.
SplashScreen.preventAutoHideAsync().catch(() => {});

import MoonokoSelection from './src/components/MoonokoSelection';
import MoonokoInteraction from './src/components/MoonokoInteraction';
import GamesList from './src/components/GamesList';
import Starburst from './src/components/Starburst';
import SleepScreen from './src/components/SleepScreen';
import SleepConfirmationModal from './src/components/SleepConfirmationModal';
import MorningRecapModal, { MorningRecapDeltas } from './src/components/MorningRecapModal';
import MoonokoCollection from './src/components/MoonokoCollection';
import Shop from './src/components/Shop';
import FeedingPage from './src/components/FeedingPage';
import InventoryPage from './src/components/InventoryPage';
import Gallery from './src/components/Gallery';
import WelcomeScreen from './src/components/WelcomeScreen';
import CharacterChat from './src/components/CharacterChat';
import GlobalLeaderboard from './src/components/GlobalLeaderboard';
import Notification, { DeploymentStatusBanner } from './src/components/Notification';
import WalletButton from './src/components/WalletButton';
import Settings from './src/components/Settings';
import Profile from './src/components/Profile';

// React Native compatible wallet integration
import { useWallet, WalletProvider } from './src/contexts/WalletContext';
import { ChromeProvider } from './src/contexts/ChromeContext';
import { HoshinoPrivyProvider } from './src/contexts/PrivyContext';
import { usePrivy } from '@privy-io/expo';
import LoginScreen from './src/components/LoginScreen';
import { DeviceCasing, DeviceButtons } from './src/components/DeviceChrome';
import ZoomOutOverlay, { IRIS_DURATION_MS } from './src/components/ZoomOutOverlay';
import { Logos } from './src/assets';
import { Connection, PublicKey } from '@solana/web3.js';

// NEW: Programmable NFT Integration
// New services and configs
import { getGameCharacters, MOONOKOS_BY_ID, toGameCharacter } from './src/data/moonokos';
import { ENABLE_VRF_DEV_SCREEN } from './src/config/vrf';
import { FirebaseAuthProvider, useFirebaseAuth } from './src/contexts/FirebaseAuthContext';
import { GameStateProvider, useGameStateContext } from './src/contexts/GameStateContext';
import { GameStateService, SLEEP_REQUIRED_MS } from './src/services/GameStateService';
import type { ForagedItem } from './src/services/GameStateService';
import { scheduleSleepAlarm, cancelSleepAlarm } from './src/services/AlarmService';
import { pushEmptySnapshot } from './src/widgets/widgetService';

// Pending one-shot action requested by a widget tap. Includes characterId so
// MoonokoInteraction can refuse to drain if the active character doesn't
// match (e.g. user swapped moonokos between widget refresh and tap), plus a
// setAt timestamp to drop actions older than the freshness window — a stale
// intent surviving in OS state shouldn't drain forage minutes later.
export interface PendingWidgetAction {
    type: 'forage-drain';
    characterId: string;
    setAt: number;
}

const WIDGET_ACTION_TTL_MS = 60_000;

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
    const { connected, publicKey, connect, disconnect, email, walletSource } = useWallet();
    const { firebaseUid } = useFirebaseAuth();
    const [currentView, setCurrentView] = useState('welcome');
    const [previousView, setPreviousView] = useState('welcome');
    const [welcomePhase, setWelcomePhase] = useState<string>('intro');
    const [shouldGoToCongratulations, setShouldGoToCongratulations] = useState(false);
    const [shouldFadeInInteraction, setShouldFadeInInteraction] = useState(false);
    // Set when a hoshino:// deep link asks the interaction screen to do
    // something on entry (e.g. drain pending forage finds from a widget tap).
    // MoonokoInteraction reads this prop, runs the action once gameState is
    // ready, and calls back to clear it. One-shot — never persisted. The
    // characterId in the URI must match the active character before MI will
    // honor it, so a stale tap on a widget bound to a different moonoko is
    // a no-op rather than a drain on the wrong pet.
    const [pendingWidgetAction, setPendingWidgetAction] =
        useState<PendingWidgetAction | null>(null);

    // Single App-owned iris state machine. The whole tree (persistent MI
    // layer, route overlay layer, chrome, wallet pill, notifications) lives
    // INSIDE one <ZoomOutOverlay> rendered below. Screens never animate
    // their own iris — they just call transitionTo(view) and the machine
    // runs:
    //   idle    -> closing  (iris animates closed, screen still on screen A)
    //           -> covered  (currentView swaps to B; iris fully black; new
    //                        screen mounts and gets at least one paint
    //                        committed before the open animates so the
    //                        first frame of B is visible behind a still-
    //                        closed iris instead of mid-animation)
    //           -> opening  (iris animates open over the now-painted B)
    //           -> idle
    // setCurrentView is no longer called directly anywhere that wants the
    // iris — call transitionTo. Direct setCurrentView still works for
    // bypass cases (initial hydration, deep links into a fresh state).
    type TransitionPhase = 'idle' | 'closing' | 'covered' | 'opening';
    const [transitionPhase, setTransitionPhase] = useState<TransitionPhase>('idle');
    // Sleep modal opens from the room's sleep menu button. The modal itself
    // doesn't need the iris (it's a transient confirmation), but the
    // start-sleep + wake actions it triggers DO route through transitionTo.
    // SleepController consumes this flag.
    const [sleepModalVisible, setSleepModalVisible] = useState(false);
    const pendingViewRef = useRef<string | null>(null);
    const coverRafRef = useRef<number | null>(null);
    const coverHoldRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    // Black "cover panel" that overlaps the close→open seam. The iris alone
    // can't fully bridge the seam — any sub-frame gap in the screens'
    // unmount→mount sequence, or a momentary lapse in iris opacity at
    // INITIAL_SCALE, exposes whatever's behind. Cover panel mounts BEFORE
    // the close finishes (during late-close) and unmounts AFTER the open
    // begins (during early-open) so there's always a fully opaque layer
    // covering the swap, with overlap on both ends. See COVER_OVERLAP_MS.
    const [coverMounted, setCoverMounted] = useState(false);
    const coverPanelTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    // Two independent overlaps so the close side can be tighter than the
    // open side (or vice versa). CLOSE_OVERLAP = how many ms before the
    // close finishes the cover mounts; OPEN_OVERLAP = how many ms after the
    // open starts the cover unmounts.
    const COVER_CLOSE_OVERLAP_MS = 95;
    const COVER_OPEN_OVERLAP_MS = 120;
    // Cover fades out (rather than unmounting) during the open animation so
    // there's no discrete handoff frame between "cover visible" and "iris has
    // grown enough to cover". Binary unmount used to expose a black→open gap
    // because the cubic-ease-in iris has barely moved off INITIAL_SCALE in
    // the first few hundred ms. Animating opacity in lockstep with the iris
    // means the new screen is revealed by the cover's transparency curve and
    // the iris's growth simultaneously — no swap frame.
    const coverOpacity = useSharedValue(1);
    // Match the iris's duration + easing exactly so the cover's transparency
    // curve mirrors the iris hole's growth curve. The iris uses
    // Easing.in(Easing.cubic) over IRIS_DURATION_MS — slow start, fast end —
    // so for the first several hundred ms the iris hole is still essentially
    // sub-pixel. A linear 600ms fade emptied the cover long before the iris
    // had grown enough to take over, leaving a black-then-bare beat. Same
    // curve + duration means: while the iris hole is tiny, the cover is also
    // still nearly opaque; both transition off in the final stretch together.
    const animatedCoverStyle = useAnimatedStyle(() => ({
        opacity: coverOpacity.value,
    }));
    // Refs mirror state for the iris callbacks below. Without them, the
    // useCallback identities would change every time currentView or
    // transitionPhase ticks, which would re-fire ZoomOutOverlay's animation
    // useEffect mid-transition and restart the timing.
    const currentViewRef = useRef(currentView);
    const transitionPhaseRef = useRef<TransitionPhase>('idle');
    useEffect(() => {
        currentViewRef.current = currentView;
    }, [currentView]);
    useEffect(() => {
        transitionPhaseRef.current = transitionPhase;
    }, [transitionPhase]);
    const transitionTo = useCallback((view: string) => {
        if (transitionPhaseRef.current !== 'idle') return;
        if (view === currentViewRef.current) return;
        pendingViewRef.current = view;
        setTransitionPhase('closing');
    }, []);
    const handleIrisClosed = useCallback(() => {
        const next = pendingViewRef.current;
        pendingViewRef.current = null;
        if (next != null) {
            setPreviousView(currentViewRef.current);
            setCurrentView(next);
        }
        setTransitionPhase('covered');
    }, []);
    const handleIrisOpened = useCallback(() => {
        setTransitionPhase((p) => (p === 'opening' ? 'idle' : p));
    }, []);
    // Hold the 'covered' phase long enough to (a) let React commit + Android
    // paint the new currentView behind the still-closed iris, and (b) give
    // the user a clearly visible held-black beat that masks the screen swap
    // through the iris's sub-pixel pinhole. The 2-RAF wait covers (a); the
    // setTimeout covers (b). Without the held duration the seam is a single-
    // frame flash and any iris-pinhole leakage is perceived as jitter rather
    // than a deliberate transition.
    const COVERED_HOLD_MS = 200;
    useEffect(() => {
        if (transitionPhase !== 'covered') return;
        const id1 = requestAnimationFrame(() => {
            coverRafRef.current = requestAnimationFrame(() => {
                coverRafRef.current = null;
                coverHoldRef.current = setTimeout(() => {
                    coverHoldRef.current = null;
                    setTransitionPhase('opening');
                }, COVERED_HOLD_MS);
            });
        });
        return () => {
            cancelAnimationFrame(id1);
            if (coverRafRef.current != null) {
                cancelAnimationFrame(coverRafRef.current);
                coverRafRef.current = null;
            }
            if (coverHoldRef.current != null) {
                clearTimeout(coverHoldRef.current);
                coverHoldRef.current = null;
            }
        };
    }, [transitionPhase]);

    // Drive the cover panel with overlap on both ends of the seam:
    //   closing → schedule mount at (closeDuration - OVERLAP)  [late-close]
    //   covered → ensure mounted (in case timer didn't fire)
    //   opening → schedule unmount at +OVERLAP                  [early-open]
    //   idle    → ensure unmounted
    // The overlap means the cover is already in place before the close iris
    // reaches INITIAL_SCALE, and is still in place after the open iris has
    // started moving — so there's never a frame where the swap is exposed
    // between the iris and the cover handing off to each other.
    useEffect(() => {
        const clearTimer = () => {
            if (coverPanelTimerRef.current != null) {
                clearTimeout(coverPanelTimerRef.current);
                coverPanelTimerRef.current = null;
            }
        };
        clearTimer();

        if (transitionPhase === 'closing') {
            // Reset opacity so a re-entered transition starts fully opaque.
            coverOpacity.value = 1;
            const armDelay = Math.max(0, IRIS_DURATION_MS - COVER_CLOSE_OVERLAP_MS);
            coverPanelTimerRef.current = setTimeout(() => {
                coverPanelTimerRef.current = null;
                setCoverMounted(true);
            }, armDelay);
        } else if (transitionPhase === 'covered') {
            // Defensive: in case 'closing' was very short or skipped.
            coverOpacity.value = 1;
            setCoverMounted(true);
        } else if (transitionPhase === 'opening') {
            // Snap-unmount after a short overlap. With the sub-pixel pinhole
            // fix in place (IRIS_INITIAL_SCALE = 0.0001 → 0.1px star hole),
            // the iris is genuinely opaque even when "closed", so the cover
            // doesn't need to fade — it can just disappear once the iris has
            // started moving and the user no longer expects the cover.
            coverOpacity.value = 1;
            coverPanelTimerRef.current = setTimeout(() => {
                coverPanelTimerRef.current = null;
                setCoverMounted(false);
            }, COVER_OPEN_OVERLAP_MS);
        } else {
            coverOpacity.value = 1;
            setCoverMounted(false);
        }

        return clearTimer;
    }, [transitionPhase]);

    const navigateToView = (view: string) => {
        setPreviousView(currentView);
        setCurrentView(view);
    };

    const navigateToSelection = (fromPhase?: string, name?: string) => {
        if (fromPhase) {
            setWelcomePhase(fromPhase);
        }
        const trimmed = name?.trim();
        if (trimmed && trimmed.length > 0) {
            setPlayerName(trimmed);
            if (publicKey) {
                persistPlayerProfile(publicKey.toString(), { playerName: trimmed });
            }
        }
        setPreviousView(currentView);
        setCurrentView('selection');
    };
    const [selectedCharacter, setSelectedCharacter] = useState<Character | null>(
        null
    );
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

    const [playerName, setPlayerName] = useState<string>('');
    const [profileHydratedWallet, setProfileHydratedWallet] = useState<string | null>(
        null
    );
    // Tracks wallets we've already shown the "Welcome back" toast for in this
    // session. Without this, the hydrate effect fires once on cache-hit then
    // again when firebaseUid lands and the server profile arrives — both go
    // through applyProfile and both fire the toast.
    const welcomedWalletsRef = useRef<Set<string>>(new Set());

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

            // Mirror the explicitly-changed fields to the server. We only send
            // fields the caller actually passed (not the derived/implicit
            // ones) so we don't spam setPlayerProfile on every render, and we
            // don't send ownedCharacterIds because the server derives it from
            // /users/{uid}/moonokos/*. Server-side auth isn't a hard gate —
            // it'll reject with unauthenticated if Firebase Auth isn't ready,
            // which we swallow and rely on AsyncStorage as a queue that will
            // naturally re-sync on next hydrate.
            const serverUpdates: { playerName?: string; selectedCharacterId?: string | null } = {};
            if (nextProfile.playerName !== undefined) {
                serverUpdates.playerName = nextProfile.playerName.trim();
            }
            if (nextProfile.selectedCharacterId !== undefined) {
                serverUpdates.selectedCharacterId = nextProfile.selectedCharacterId;
            }
            if (Object.keys(serverUpdates).length > 0) {
                GameStateService.setPlayerProfile(serverUpdates).catch((err) => {
                    console.warn('⚠️ setPlayerProfile failed (cache still saved):', err);
                });
            }
        },
        [ownedCharacters, playerName, selectedCharacter?.id]
    );

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
            setAchievements([]);
            console.log('✅ Wallet disconnected successfully');
        } catch (error) {
            console.error('❌ Error disconnecting wallet:', error);
            addNotification('Failed to disconnect wallet', 'error');
        }
    };

    const handleCharacterSelect = async (character: Character) => {
        console.log('🎮 Character selected in App:', character.name, {
            connected,
            character
        });

        if (!validateCharacterInput(character)) {
            console.log('❌ Character validation failed');
            addNotification('Invalid character data', 'error');
            return;
        }

        console.log(
            '✅ Setting selected character and switching to interaction view'
        );
        addNotification(`${character.name} selected! Preparing your companion...`, 'success');

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
        setCurrentView('interaction');
    };

    useEffect(() => {
        let isCancelled = false;

        const applyProfile = (
            walletAddress: string,
            profile: { playerName: string; ownedCharacterIds: string[]; selectedCharacterId: string | null },
            source: 'server' | 'cache'
        ) => {
            if (isCancelled) return;
            const restoredOwnedCharacters = normalizeOwnedCharacterIds(profile.ownedCharacterIds);
            // If the user owns Moonokos but hasn't stamped a selection yet
            // (e.g. their selection predates the server-side profile doc), fall
            // back to the first owned character so they land on interaction
            // instead of being re-asked to pick — and persist that choice so
            // the server takes over on the next login.
            const effectiveSelectedId =
                profile.selectedCharacterId ??
                (restoredOwnedCharacters.length > 0 ? restoredOwnedCharacters[0] : null);
            const restoredCharacter = restoreCharacterFromId(
                effectiveSelectedId,
                restoredOwnedCharacters
            );
            if (
                source === 'server' &&
                !profile.selectedCharacterId &&
                restoredCharacter &&
                publicKey
            ) {
                GameStateService.setPlayerProfile({
                    selectedCharacterId: restoredCharacter.id,
                }).catch((err) => {
                    console.warn('⚠️ default-select persist failed:', err);
                });
            }
            const hasStoredCompanion =
                restoredOwnedCharacters.length > 0 || Boolean(restoredCharacter);

            console.log(`✅ Restored player profile (${source}):`, {
                walletAddress,
                playerName: profile.playerName,
                ownedCharacters: restoredOwnedCharacters,
                selectedCharacterId: restoredCharacter?.id ?? null,
            });

            setPlayerName(profile.playerName);
            setOwnedCharacters(restoredOwnedCharacters);
            setSelectedCharacter(restoredCharacter);

            const alreadyWelcomed = welcomedWalletsRef.current.has(walletAddress);
            const shouldWelcome = !alreadyWelcomed && profile.playerName.trim().length > 0;

            if (hasStoredCompanion) {
                setCurrentView(restoredCharacter ? 'interaction' : 'selection');
                if (shouldWelcome) {
                    addNotification(`🌟 Welcome back, ${profile.playerName}!`, 'success');
                    welcomedWalletsRef.current.add(walletAddress);
                }
            } else if (profile.playerName.trim()) {
                setCurrentView('selection');
                if (shouldWelcome) {
                    addNotification(`🌟 Welcome back, ${profile.playerName}!`, 'success');
                    welcomedWalletsRef.current.add(walletAddress);
                }
            } else {
                setCurrentView('welcome');
            }

            setProfileHydratedWallet(walletAddress);
        };

        const hydrateStoredProfile = async () => {
            if (!publicKey) {
                setProfileHydratedWallet(null);
                setPlayerName('');
                setOwnedCharacters([]);
                setSelectedCharacter(null);
                return;
            }

            const walletAddress = publicKey.toString();

            // Server is the source of truth. Wait until Firebase Auth is ready
            // (Privy→Firebase exchange runs in FirebaseAuthContext) before
            // calling the callable; otherwise it rejects unauthenticated.
            if (firebaseUid) {
                try {
                    const serverProfile = await GameStateService.getPlayerProfile();
                    if (isCancelled) return;
                    applyProfile(walletAddress, serverProfile, 'server');
                    // Mirror into AsyncStorage so next cold start has a warm
                    // cache for instant first-paint (while still being
                    // overridden by the server on arrival).
                    void saveStoredPlayerProfile(walletAddress, {
                        version: 1,
                        playerName: serverProfile.playerName,
                        ownedCharacterIds: serverProfile.ownedCharacterIds,
                        selectedCharacterId: serverProfile.selectedCharacterId,
                        updatedAt: Date.now(),
                    });
                    return;
                } catch (err) {
                    console.warn('⚠️ Server profile fetch failed, falling back to cache:', err);
                    // Fall through to AsyncStorage cache.
                }
            }

            // Fallback: AsyncStorage cache (offline, pre-auth, or server error).
            const cached = await loadStoredPlayerProfile(walletAddress);
            if (isCancelled) return;
            if (cached) {
                applyProfile(walletAddress, cached, 'cache');
                return;
            }

            // No cache. If Firebase isn't ready yet, don't declare the
            // profile hydrated as "welcome" — that flashes WelcomeScreen
            // for the duration of the Privy→Firebase exchange even for
            // returning users who have server-side data. Bail; the
            // effect re-fires when firebaseUid lands and we'll try the
            // server then.
            if (!firebaseUid) return;

            console.log(
                '🔍 No stored player profile for wallet:',
                walletAddress.slice(0, 8) + '...'
            );
            setPlayerName('');
            setOwnedCharacters([]);
            setSelectedCharacter(null);
            setCurrentView('welcome');
            setProfileHydratedWallet(walletAddress);
        };

        hydrateStoredProfile();

        return () => {
            isCancelled = true;
        };
    }, [addNotification, publicKey, firebaseUid]);

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

    const updatePlayerName = useCallback(
        (name: string) => {
            const trimmed = name.trim();
            setPlayerName(trimmed);
            if (publicKey) {
                persistPlayerProfile(publicKey.toString(), { playerName: trimmed });
            }
        },
        [persistPlayerProfile, publicKey]
    );

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
            console.log('🎉 Setting selected character:', restoredCharacter.name);
        }
        setShouldGoToCongratulations(true);
        setCurrentView('welcome');
        // Reset the flag after a longer delay to ensure WelcomeScreen has time to render
        setTimeout(() => {
            setShouldGoToCongratulations(false);
        }, 1000);
    };

    // Deep-link router for widget taps and external launches.
    // Supported URIs:
    //   hoshino://forage/drain?characterId=ABC -> jump to interaction view,
    //     auto-drain pending finds for ABC. The characterId must match the
    //     active character at consume time or the action is dropped.
    useEffect(() => {
        const handleUrl = (url: string | null) => {
            if (!url) return;
            try {
                const parsed = new URL(url);
                if (parsed.hostname === 'forage' && parsed.pathname === '/drain') {
                    const characterId = parsed.searchParams.get('characterId');
                    if (!characterId) return;
                    setCurrentView('interaction');
                    setPendingWidgetAction({
                        type: 'forage-drain',
                        characterId,
                        setAt: Date.now(),
                    });
                }
            } catch {
                // Malformed URI — ignore rather than crash. The widget only
                // emits known schemes, so this only fires on hand-crafted
                // intents.
            }
        };
        // Cold-start path: app was launched by the widget tap.
        Linking.getInitialURL().then(handleUrl);
        // Warm path: app was already alive and the OS hands us the URL.
        const sub = Linking.addEventListener('url', (event) =>
            handleUrl(event.url)
        );
        return () => sub.remove();
    }, []);

    // True once the profile-hydrate flow has settled: either no wallet is
    // connected (nothing to hydrate) or the connected wallet's profile has
    // loaded from server/cache. Used to gate effects that branch on
    // "selectedCharacter is null" — without this gate, those effects fire
    // during the cold-start window when selectedCharacter is *temporarily*
    // null and would either drop a valid pending widget action or blank the
    // widget before the real character lands.
    const profileSettled =
        !publicKey || profileHydratedWallet === publicKey.toString();

    // Drop pending widget action if the active character doesn't match the
    // one the tap was bound to. Gated on profileSettled so a cold-start
    // widget tap survives the hydrate window — without that gate, the
    // initial-null selectedCharacter would clear the action immediately.
    useEffect(() => {
        if (!pendingWidgetAction) return;
        if (!profileSettled) return;
        if (
            !selectedCharacter ||
            selectedCharacter.id !== pendingWidgetAction.characterId
        ) {
            setPendingWidgetAction(null);
        }
    }, [selectedCharacter?.id, pendingWidgetAction, profileSettled]);

    // Clear the home-screen widget when the profile has settled with no
    // active character (fresh install, profile reset, wallet disconnect, or
    // a cold start into an already-empty account). We dedupe via a ref so
    // we push empty exactly once per no-character session — the launcher
    // coalesces redraws but a per-render call would still spam IPC.
    // Re-armed when a character becomes active again.
    const emptyPushedForSessionRef = React.useRef(false);
    useEffect(() => {
        if (!profileSettled) return;
        const currentId = selectedCharacter?.id ?? null;
        if (currentId) {
            emptyPushedForSessionRef.current = false;
            return;
        }
        if (emptyPushedForSessionRef.current) return;
        pushEmptySnapshot().catch(() => {});
        emptyPushedForSessionRef.current = true;
    }, [profileSettled, selectedCharacter?.id]);

    const moonokoInteractionElement = (
        <MoonokoInteraction
            selectedCharacter={selectedCharacter}
            onSelectCharacter={() => {
                setShouldFadeInInteraction(false);
                transitionTo('selection');
            }}
            onFeed={() => transitionTo('feeding')}
            connected={connected}
            walletAddress={publicKey?.toString()}
            playerName={playerName}
            onNotification={addNotification}
            onRefreshNFTs={() => {
                addNotification('🔍 Checking wallet for NFTs...', 'info');
            }}
            onArcade={() => transitionTo('arcade')}
            onSleepRequest={() => setSleepModalVisible(true)}
            onShop={() => transitionTo('shop')}
            onInventory={() => transitionTo('inventory')}
            onGallery={() => transitionTo('gallery')}
            onChat={() => transitionTo('chat')}
            onSettings={() => transitionTo('settings')}
            shouldFadeIn={shouldFadeInInteraction}
            onFadeInComplete={() => setShouldFadeInInteraction(false)}
            pendingWidgetAction={pendingWidgetAction}
            onWidgetActionConsumed={() => setPendingWidgetAction(null)}
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
            case 'arcade':
            case 'starburst':
            case 'sleep':
                return null;
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
            case 'profile':
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
                return null;
        }
    };

    const miRoutes = ['interaction', 'feeding', 'shop', 'gallery', 'inventory', 'settings', 'chat', 'profile'];
    const miMounted = miRoutes.includes(currentView);

    // Hold a splash-colored shim until the wallet has resolved AND its
    // profile has hydrated. Without this, returning users paint a frame
    // of WelcomeScreen — currentView's useState default is 'welcome',
    // and applyProfile only flips it to 'interaction' after the server
    // round-trip. Don't reuse `profileSettled` (line 695): it treats a
    // null publicKey as settled, which is wrong inside App() where we
    // always have a Privy user and just haven't auto-provisioned yet.
    const hydrationComplete =
        !!publicKey && profileHydratedWallet === publicKey.toString();
    if (!hydrationComplete) {
        return <SplashShim />;
    }

    return (
        <GameStateProvider characterId={selectedCharacter?.id ?? null}>
        <GameStateGate hasCharacter={!!selectedCharacter}>
        <SafeAreaView style={styles.container}>
            <StatusBar style="light" hidden={true} />
            <DeviceCasing />
            {/* Single global iris. Everything that should be hidden during a
                page transition lives inside this overlay — the persistent MI
                layer, the route-overlay layer, the chrome buttons, the
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
                            onBack={() => transitionTo('interaction')}
                            onNotification={addNotification}
                        />
                    </View>
                )}
                {currentView === 'shop' && (
                    <View key="overlay-layer" style={[StyleSheet.absoluteFill, { zIndex: 50, elevation: 50 }]} pointerEvents="box-none">
                        <Shop
                            connection={connection}
                            onNotification={addNotification}
                            onClose={() => transitionTo('interaction')}
                        />
                    </View>
                )}
                {currentView === 'gallery' && (
                    <View key="overlay-layer" style={[StyleSheet.absoluteFill, { zIndex: 50, elevation: 50 }]} pointerEvents="box-none">
                        <Gallery onBack={() => transitionTo('interaction')} />
                    </View>
                )}
                {currentView === 'arcade' && (
                    <View key="overlay-layer" style={[StyleSheet.absoluteFill, { zIndex: 50, elevation: 50 }]} pointerEvents="box-none">
                        <GamesList
                            onClose={() => transitionTo('interaction')}
                            onSelectGame={(gameId) => transitionTo(gameId)}
                        />
                    </View>
                )}
                {currentView === 'starburst' && (
                    <View key="overlay-layer" style={[StyleSheet.absoluteFill, { zIndex: 50, elevation: 50 }]} pointerEvents="box-none">
                        <StarburstView onBack={() => transitionTo('arcade')} />
                    </View>
                )}
                {currentView === 'inventory' && (
                    <View key="overlay-layer" style={[StyleSheet.absoluteFill, { zIndex: 50, elevation: 50 }]} pointerEvents="box-none">
                        <InventoryPage onBack={() => transitionTo('interaction')} />
                    </View>
                )}
                {currentView === 'settings' && (
                    <View key="overlay-layer" style={[StyleSheet.absoluteFill, { zIndex: 50, elevation: 50 }]} pointerEvents="box-none">
                        <Settings
                            onBack={() => transitionTo('interaction')}
                            onNotification={addNotification}
                        />
                    </View>
                )}
                {currentView === 'profile' && (
                    <View key="overlay-layer" style={[StyleSheet.absoluteFill, { zIndex: 50, elevation: 50 }]} pointerEvents="box-none">
                        <Profile
                            onBack={() => transitionTo(previousView || 'interaction')}
                            onNotification={addNotification}
                            playerName={playerName}
                            publicKey={publicKey?.toString() ?? null}
                            email={email}
                            walletSource={walletSource}
                            onUpdatePlayerName={updatePlayerName}
                            onLogout={disconnectWallet}
                        />
                    </View>
                )}
                {currentView === 'chat' && selectedCharacter && (
                    <View key="overlay-layer" style={[StyleSheet.absoluteFill, { zIndex: 50, elevation: 50 }]} pointerEvents="box-none">
                        <CharacterChat
                            character={selectedCharacter}
                            onExit={() => transitionTo('interaction')}
                            playerName={playerName}
                            onNotification={addNotification}
                        />
                    </View>
                )}
                {!miMounted && renderContent()}

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
                    onNotification={addNotification}
                />

                {/* Chrome (DeviceButtons + WalletButton + notifications) sits
                    inside the iris with no zIndex of its own — natural render
                    order puts it on top of the mi-layer (zIndex 0) on the
                    home screen, but BEHIND the zIndex:50 overlay layer when
                    Shop/Inventory/Settings/etc. is up. The iris covers it
                    during page transitions because the iris is the last
                    sibling rendered inside ZoomOutOverlay's wrapper. */}
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
                    playerName={playerName}
                    onConnect={connectWallet}
                    onOpenProfile={() => transitionTo('profile')}
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

                {/* Cover panel — solid black layer that overlaps the seam.
                    Mounts during late-close (before the iris reaches
                    INITIAL_SCALE) and unmounts during early-open (after the
                    iris has begun growing). zIndex/elevation 100 puts it
                    above the screens (50) but below the iris (999) so the
                    iris still renders on top during its animation; the
                    cover's job is to be a stable opaque layer that doesn't
                    change while the screens swap underneath. */}
                {coverMounted && (
                    <Animated.View
                        pointerEvents="none"
                        style={[
                            StyleSheet.absoluteFill,
                            { backgroundColor: 'black', zIndex: 100, elevation: 100 },
                            animatedCoverStyle,
                        ]}
                    />
                )}
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

// Tiny wrapper so the App-level Starburst route can call play() — App itself
// renders OUTSIDE GameStateProvider, but this component renders inside it.
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

// Sleep is App-level navigation: a first-class route managed by the App's
// iris transition, not an in-place overlay inside MoonokoInteraction.
// SleepController owns the entire sleep state machine — server callables,
// optimistic flags, alarm scheduling, recap — and renders its UI surfaces
// (modal, SleepScreen, MorningRecapModal) from a single place. It lives
// inside GameStateProvider so it can use useGameStateContext directly;
// App passes down currentView, transitionTo, the modal-visible flag, and
// the active character. See ZoomOutOverlay for the iris itself; see
// MoonokoInteraction's `case 'sleep'` for the trigger that opens the
// modal (it just calls onSleepRequest now).
interface SleepControllerProps {
    currentView: string;
    transitionTo: (view: string) => void;
    selectedCharacter: Character | null;
    sleepModalVisible: boolean;
    setSleepModalVisible: (v: boolean) => void;
    onNotification: (
        message: string,
        type: 'success' | 'error' | 'info' | 'warning',
    ) => void;
}

function SleepController({
    currentView,
    transitionTo,
    selectedCharacter,
    sleepModalVisible,
    setSleepModalVisible,
    onNotification,
}: SleepControllerProps) {
    const {
        state: gameState,
        startSleep,
        endSleep,
        drainForaged,
    } = useGameStateContext();

    const serverSleeping = gameState?.sleepStartedAt != null;
    const [pendingStartSleep, setPendingStartSleep] = useState(false);
    const [pendingEndSleep, setPendingEndSleep] = useState(false);
    // Bumps SleepScreen's wakeRequested prop to trigger its onWake — used
    // when something other than the in-screen Wake button initiates the
    // wake (re-tap of the menu sleep button while already sleeping).
    const [wakeRequested, setWakeRequested] = useState(false);
    const [pickedWakeAtMs, setPickedWakeAtMs] = useState<number | null>(null);
    const [recapState, setRecapState] = useState<{
        deltas: MorningRecapDeltas;
        items: ForagedItem[];
    } | null>(null);

    const isSleeping =
        (serverSleeping || pendingStartSleep) && !pendingEndSleep;

    // Reset optimistic flags when the active character changes — a startSleep
    // in flight on character A shouldn't keep us on the sleep route after
    // the user swaps to character B.
    useEffect(() => {
        setPendingStartSleep(false);
        setPendingEndSleep(false);
        setWakeRequested(false);
    }, [selectedCharacter?.id]);

    // Clear pendingEndSleep only when serverSleeping actually transitions
    // true→false (i.e. endSleep landed). Without the transition guard, the
    // bare check fires the moment we set the flag and unsticks us before
    // startSleep has even resolved.
    const prevServerSleepingRef = useRef(false);
    useEffect(() => {
        const wasSleeping = prevServerSleepingRef.current;
        prevServerSleepingRef.current = serverSleeping;
        if (wasSleeping && !serverSleeping && pendingEndSleep) {
            setPendingEndSleep(false);
        }
    }, [serverSleeping, pendingEndSleep]);

    // Drive the route from sleep state. Two automatic paths:
    //   (a) cold-launch with serverSleeping → route to 'sleep'.
    //   (b) sleep ends (server cleared sleepStartedAt) → route off 'sleep'.
    // The user-driven paths (modal confirm, wake button) call transitionTo
    // directly in the handlers below; this effect is the safety net for
    // server-side or restored state we didn't initiate locally.
    useEffect(() => {
        if (isSleeping && currentView !== 'sleep') {
            transitionTo('sleep');
        } else if (!isSleeping && currentView === 'sleep') {
            transitionTo('interaction');
        }
    }, [isSleeping, currentView, transitionTo]);

    const handleConfirmSleep = useCallback(
        (wakeAtMs: number) => {
            setSleepModalVisible(false);
            setPickedWakeAtMs(wakeAtMs);
            setPendingStartSleep(true);
            transitionTo('sleep');
            startSleep()
                .then((next) => {
                    setPendingStartSleep(false);
                    if (next?.sleepStartedAt) {
                        scheduleSleepAlarm(
                            wakeAtMs,
                            selectedCharacter?.name,
                        ).then((res) => {
                            if (!res.ok && res.reason === 'notifications-denied') {
                                onNotification(
                                    'Enable notifications for a wake-up alarm.',
                                    'info',
                                );
                            } else if (res.ok && res.reason === 'inexact') {
                                onNotification(
                                    'Wake reminder set (may be a few min late).',
                                    'info',
                                );
                            }
                        });
                    }
                })
                .catch((e: any) => {
                    setPendingStartSleep(false);
                    onNotification(
                        e?.message || 'Failed to start sleep',
                        'error',
                    );
                });
        },
        [
            setSleepModalVisible,
            transitionTo,
            startSleep,
            selectedCharacter?.name,
            onNotification,
        ],
    );

    const handleWake = useCallback(async () => {
        // Optimistically dismiss sleep the instant the iris starts moving so
        // the user doesn't watch a blocked UI while endSleep round-trips.
        setPendingEndSleep(true);
        setPickedWakeAtMs(null);
        cancelSleepAlarm();
        const preWake = gameState ?? null;
        try {
            const next = await endSleep(true);
            setWakeRequested(false);
            if (preWake) {
                const energyGained = Math.max(
                    0,
                    (next.energy ?? 0) - (preWake.energy ?? 0),
                );
                const moodGained = Math.max(
                    0,
                    (next.mood ?? 0) - (preWake.mood ?? 0),
                );
                const xpGained = Math.max(
                    0,
                    (next.experience ?? 0) - (preWake.experience ?? 0),
                );
                const sleepItems = (next.foragedItems ?? []).filter(
                    (f) => f.source === 'sleep',
                );
                // Only show the recap on a real full-rest wake — force-wake
                // without 8h returns no grants and would render an empty
                // ceremony.
                if (
                    energyGained > 0 ||
                    moodGained > 0 ||
                    xpGained > 0 ||
                    sleepItems.length > 0
                ) {
                    setRecapState({
                        deltas: {
                            energyGained,
                            moodGained,
                            xpGained,
                            totalSleeps: next.totalSleeps ?? 0,
                        },
                        items: sleepItems,
                    });
                }
            }
        } catch (e: any) {
            // Server is still sleeping: roll back the optimistic dismiss so
            // the route effect bounces back to 'sleep'. The App iris is
            // fresh per transition so no remount-key hack is needed.
            setPendingEndSleep(false);
            setWakeRequested(false);
            onNotification(
                e?.message || 'Failed to end sleep — try again',
                'error',
            );
        }
    }, [endSleep, gameState, onNotification]);

    return (
        <>
            <SleepConfirmationModal
                visible={sleepModalVisible}
                character={selectedCharacter}
                playerName={undefined}
                defaultWakeAtMs={Date.now() + SLEEP_REQUIRED_MS}
                onCancel={() => setSleepModalVisible(false)}
                onSmokeTest={() => {
                    setSleepModalVisible(false);
                    scheduleSleepAlarm(
                        Date.now() + 60_000,
                        selectedCharacter?.name,
                    ).then((res) => {
                        if (!res.ok && res.reason === 'notifications-denied') {
                            onNotification(
                                'Enable notifications to test the alarm.',
                                'info',
                            );
                        } else if (res.ok) {
                            onNotification(
                                `Test alarm scheduled (${res.reason} · 60s)`,
                                'success',
                            );
                        } else {
                            onNotification(
                                `Smoke test failed: ${res.reason}`,
                                'error',
                            );
                        }
                    });
                }}
                onConfirm={handleConfirmSleep}
            />

            {currentView === 'sleep' && (
                <View
                    key="overlay-layer"
                    style={[
                        StyleSheet.absoluteFill,
                        { zIndex: 50, elevation: 50 },
                    ]}
                    pointerEvents="box-none"
                >
                    <SleepScreen
                        wakeRequested={wakeRequested}
                        characterId={selectedCharacter?.id}
                        sleepStartedAt={gameState?.sleepStartedAt ?? null}
                        wakeAtMs={pickedWakeAtMs}
                        onWake={handleWake}
                    />
                </View>
            )}

            {recapState && (
                <MorningRecapModal
                    visible={true}
                    characterId={selectedCharacter?.id}
                    deltas={recapState.deltas}
                    overnightItems={recapState.items}
                    onDismiss={() => {
                        setRecapState(null);
                        if ((gameState?.foragedItems ?? []).length > 0) {
                            drainForaged().catch((e: any) => {
                                onNotification(
                                    e?.message ||
                                        'Failed to collect overnight finds',
                                    'error',
                                );
                            });
                        }
                    }}
                />
            )}
        </>
    );
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
        'SpaceMono': SpaceMono_400Regular,
        '04b03': require('./assets/fonts/04b03.ttf'),
        // Primary UI font as of 0.1.16 — replaces PressStart2P everywhere
        // except the sleep arc (Sleep* + MorningRecapModal), which stays on
        // 04b03/PressStart2P for the dreamy bedtime palette.
        'Monaco': require('./assets/fonts/Monaco.ttf'),
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
