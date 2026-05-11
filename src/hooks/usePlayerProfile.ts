import { useCallback, useEffect, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { MOONOKOS_BY_ID, toGameCharacter } from '../data/moonokos';
import { GameStateService } from '../services/GameStateService';
import type {
    AppCharacter,
    AppNotificationHandler,
    AppView,
} from '../types/AppTypes';

const PLAYER_PROFILE_STORAGE_PREFIX = 'player_profile_';
const WELCOME_BACK_ICON = '\uD83C\uDF1F ';

interface StoredPlayerProfile {
    version: 1;
    playerName: string;
    ownedCharacterIds: string[];
    selectedCharacterId: string | null;
    updatedAt: number;
}

type StoredPlayerProfilePatch = Partial<
    Pick<
        StoredPlayerProfile,
        'playerName' | 'ownedCharacterIds' | 'selectedCharacterId'
    >
>;

interface UsePlayerProfileArgs {
    walletAddress: string | null;
    firebaseUid: string | null;
    replaceView: (view: AppView) => void;
    onNotification: AppNotificationHandler;
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
): AppCharacter | null => {
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
        console.error('Error loading stored player profile:', error);
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
        console.error('Error saving player profile:', error);
    }
};

export function usePlayerProfile({
    walletAddress,
    firebaseUid,
    replaceView,
    onNotification,
}: UsePlayerProfileArgs) {
    const [selectedCharacter, setSelectedCharacter] =
        useState<AppCharacter | null>(null);
    const [ownedCharacters, setOwnedCharacters] = useState<string[]>([]);
    const [playerName, setPlayerName] = useState<string>('');
    const [profileHydratedWallet, setProfileHydratedWallet] =
        useState<string | null>(null);
    // Tracks wallets we've already shown the "Welcome back" toast for in this
    // session. Without this, the hydrate effect fires once on cache-hit then
    // again when firebaseUid lands and the server profile arrives. Both go
    // through applyProfile and both would fire the toast.
    const welcomedWalletsRef = useRef<Set<string>>(new Set());

    const persistPlayerProfile = useCallback(
        (nextProfile: StoredPlayerProfilePatch = {}) => {
            if (!walletAddress) {
                return;
            }

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
            // fields the caller actually passed, not the derived fields, so we
            // do not spam setPlayerProfile on every render. ownedCharacterIds
            // stays server-derived from /users/{uid}/moonokos/*.
            const serverUpdates: {
                playerName?: string;
                selectedCharacterId?: string | null;
            } = {};
            if (nextProfile.playerName !== undefined) {
                serverUpdates.playerName = nextProfile.playerName.trim();
            }
            if (nextProfile.selectedCharacterId !== undefined) {
                serverUpdates.selectedCharacterId = nextProfile.selectedCharacterId;
            }
            if (Object.keys(serverUpdates).length > 0) {
                GameStateService.setPlayerProfile(serverUpdates).catch((err) => {
                    console.warn('setPlayerProfile failed (cache still saved):', err);
                });
            }
        },
        [ownedCharacters, playerName, selectedCharacter?.id, walletAddress]
    );

    useEffect(() => {
        let isCancelled = false;

        const applyProfile = (
            currentWalletAddress: string,
            profile: {
                playerName: string;
                ownedCharacterIds: string[];
                selectedCharacterId: string | null;
            },
            source: 'server' | 'cache'
        ) => {
            if (isCancelled) return;
            const restoredOwnedCharacters = normalizeOwnedCharacterIds(
                profile.ownedCharacterIds
            );
            // If the user owns Moonokos but has not stamped a selection yet,
            // fall back to the first owned character so they land on
            // interaction instead of being asked to pick again.
            const effectiveSelectedId =
                profile.selectedCharacterId ??
                (restoredOwnedCharacters.length > 0
                    ? restoredOwnedCharacters[0]
                    : null);
            const restoredCharacter = restoreCharacterFromId(
                effectiveSelectedId,
                restoredOwnedCharacters
            );
            if (
                source === 'server' &&
                !profile.selectedCharacterId &&
                restoredCharacter
            ) {
                GameStateService.setPlayerProfile({
                    selectedCharacterId: restoredCharacter.id,
                }).catch((err) => {
                    console.warn('default-select persist failed:', err);
                });
            }
            const hasStoredCompanion =
                restoredOwnedCharacters.length > 0 || Boolean(restoredCharacter);

            console.log(`Restored player profile (${source}):`, {
                walletAddress: currentWalletAddress,
                playerName: profile.playerName,
                ownedCharacters: restoredOwnedCharacters,
                selectedCharacterId: restoredCharacter?.id ?? null,
            });

            setPlayerName(profile.playerName);
            setOwnedCharacters(restoredOwnedCharacters);
            setSelectedCharacter(restoredCharacter);

            const alreadyWelcomed =
                welcomedWalletsRef.current.has(currentWalletAddress);
            const shouldWelcome =
                !alreadyWelcomed && profile.playerName.trim().length > 0;

            if (hasStoredCompanion) {
                replaceView(restoredCharacter ? 'interaction' : 'selection');
                if (shouldWelcome) {
                    onNotification(
                        `${WELCOME_BACK_ICON}Welcome back, ${profile.playerName}!`,
                        'success'
                    );
                    welcomedWalletsRef.current.add(currentWalletAddress);
                }
            } else if (profile.playerName.trim()) {
                replaceView('selection');
                if (shouldWelcome) {
                    onNotification(
                        `${WELCOME_BACK_ICON}Welcome back, ${profile.playerName}!`,
                        'success'
                    );
                    welcomedWalletsRef.current.add(currentWalletAddress);
                }
            } else {
                replaceView('welcome');
            }

            setProfileHydratedWallet(currentWalletAddress);
        };

        const hydrateStoredProfile = async () => {
            if (!walletAddress) {
                setProfileHydratedWallet(null);
                setPlayerName('');
                setOwnedCharacters([]);
                setSelectedCharacter(null);
                return;
            }

            // Server is the source of truth. Wait until Firebase Auth is ready
            // before calling the callable; otherwise it rejects unauthenticated.
            if (firebaseUid) {
                try {
                    const serverProfile = await GameStateService.getPlayerProfile();
                    if (isCancelled) return;
                    applyProfile(walletAddress, serverProfile, 'server');
                    // Mirror into AsyncStorage so next cold start has a warm
                    // cache for instant first-paint while still being
                    // overridden by the server on arrival.
                    void saveStoredPlayerProfile(walletAddress, {
                        version: 1,
                        playerName: serverProfile.playerName,
                        ownedCharacterIds: serverProfile.ownedCharacterIds,
                        selectedCharacterId: serverProfile.selectedCharacterId,
                        updatedAt: Date.now(),
                    });
                    return;
                } catch (err) {
                    console.warn(
                        'Server profile fetch failed, falling back to cache:',
                        err
                    );
                }
            }

            const cached = await loadStoredPlayerProfile(walletAddress);
            if (isCancelled) return;
            if (cached) {
                applyProfile(walletAddress, cached, 'cache');
                return;
            }

            // No cache. If Firebase is not ready yet, do not declare the
            // profile hydrated as "welcome"; returning users may still have
            // server-side data once Firebase lands.
            if (!firebaseUid) return;

            console.log(
                'No stored player profile for wallet:',
                walletAddress.slice(0, 8) + '...'
            );
            setPlayerName('');
            setOwnedCharacters([]);
            setSelectedCharacter(null);
            replaceView('welcome');
            setProfileHydratedWallet(walletAddress);
        };

        hydrateStoredProfile();

        return () => {
            isCancelled = true;
        };
    }, [firebaseUid, onNotification, replaceView, walletAddress]);

    useEffect(() => {
        if (!walletAddress) {
            return;
        }

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
        selectedCharacter?.id,
        walletAddress,
    ]);

    const savePlayerName = useCallback(
        (name: string, options: { trimForState?: boolean } = {}) => {
            const nextName = options.trimForState ? name.trim() : name;
            setPlayerName(nextName);
            persistPlayerProfile({ playerName: nextName });
        },
        [persistPlayerProfile]
    );

    const updatePlayerName = useCallback(
        (name: string) => {
            savePlayerName(name, { trimForState: true });
        },
        [savePlayerName]
    );

    const selectCharacter = useCallback(
        (character: AppCharacter) => {
            const nextOwnedCharacters = normalizeOwnedCharacterIds([
                ...ownedCharacters,
                character.id,
            ]);
            const restoredCharacter =
                restoreCharacterFromId(character.id, nextOwnedCharacters) ??
                character;

            setOwnedCharacters(nextOwnedCharacters);
            setSelectedCharacter(restoredCharacter);
            persistPlayerProfile({
                ownedCharacterIds: nextOwnedCharacters,
                selectedCharacterId: restoredCharacter.id,
            });

            return restoredCharacter;
        },
        [ownedCharacters, persistPlayerProfile]
    );

    const profileSettled =
        !walletAddress || profileHydratedWallet === walletAddress;
    const hydrationComplete =
        Boolean(walletAddress) && profileHydratedWallet === walletAddress;

    return {
        playerName,
        selectedCharacter,
        profileSettled,
        hydrationComplete,
        savePlayerName,
        updatePlayerName,
        selectCharacter,
    };
}
