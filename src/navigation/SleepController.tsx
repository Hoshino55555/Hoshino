import React, { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import MorningRecapModal, {
    MorningRecapDeltas,
} from '../components/MorningRecapModal';
import SleepConfirmationModal from '../components/SleepConfirmationModal';
import SleepScreen from '../components/SleepScreen';
import { useGameStateContext } from '../contexts/GameStateContext';
import { cancelSleepAlarm, scheduleSleepAlarm } from '../services/AlarmService';
import { SLEEP_REQUIRED_MS } from '../services/GameStateService';
import type { ForagedItem } from '../services/GameStateService';
import MusicService from '../services/MusicService';
import type {
    AppCharacter,
    AppNotificationHandler,
    AppView,
} from '../types/AppTypes';

interface SleepControllerProps {
    currentView: AppView;
    transitionTo: (view: AppView) => void;
    selectedCharacter: AppCharacter | null;
    sleepModalVisible: boolean;
    setSleepModalVisible: (v: boolean) => void;
    playerName: string;
    onNotification: AppNotificationHandler;
}

// Mirrors server's localDateKey (game-state-engine.js): YYYY-MM-DD in the
// caller's timezone. Used by the cold-launch recap trigger to compare against
// the server-tracked foragedRecapDateKey without a callable round-trip.
function clientLocalDateKey(timezone: string, ms: number): string {
    try {
        return new Intl.DateTimeFormat('en-CA', {
            timeZone: timezone,
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
        }).format(new Date(ms));
    } catch {
        return new Date(ms).toISOString().slice(0, 10);
    }
}

// Sleep is App-level navigation: a first-class route managed by the App's
// iris transition, not an in-place overlay inside MoonokoInteraction.
// SleepController owns the entire sleep state machine: server callables,
// optimistic flags, alarm scheduling, recap, and its UI surfaces
// (modal, SleepScreen, MorningRecapModal) from a single place. It lives
// inside GameStateProvider so it can use useGameStateContext directly.
export default function SleepController({
    currentView,
    transitionTo,
    selectedCharacter,
    sleepModalVisible,
    setSleepModalVisible,
    playerName,
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
    // Bumps SleepScreen's wakeRequested prop to trigger its onWake. Used
    // when something other than the in-screen Wake button initiates the
    // wake (re-tap of the menu sleep button while already sleeping).
    const [wakeRequested, setWakeRequested] = useState(false);
    const [pickedWakeAtMs, setPickedWakeAtMs] = useState<number | null>(null);
    const [recapState, setRecapState] = useState<{
        deltas?: MorningRecapDeltas;
        items: ForagedItem[];
    } | null>(null);
    // Per-character latch: once we've shown a cold-launch recap (or dismissed
    // one), we don't want the effect to re-fire on every gameState refresh
    // before the server's foragedRecapDateKey/foragedItems have caught up.
    // Resets when the active character changes.
    const coldLaunchHandledRef = useRef<string | null>(null);

    const isSleeping =
        (serverSleeping || pendingStartSleep) && !pendingEndSleep;

    // Reset optimistic flags when the active character changes. A startSleep
    // in flight on character A shouldn't keep us on the sleep route after
    // the user swaps to character B.
    useEffect(() => {
        setPendingStartSleep(false);
        setPendingEndSleep(false);
        setWakeRequested(false);
        coldLaunchHandledRef.current = null;
    }, [selectedCharacter?.id]);

    // Cold-launch morning recap: if the user slept and hasn't seen today's
    // recap yet (foragedRecapDateKey lags todayKey), show it as the first
    // thing they see, even if they killed the app and re-opened hours past
    // wake-time. The wake-button path (handleWake) sets recapState directly
    // with computed deltas; this path has no preWake snapshot, so we render
    // greeting + items only.
    useEffect(() => {
        if (!gameState) return;
        if (recapState) return;
        // Skip during any in-flight sleep transition. handleWake owns the
        // recap-with-deltas path; we don't want this effect racing it and
        // dropping a no-deltas modal in front of a fresh wake.
        if (isSleeping || pendingEndSleep || pendingStartSleep) return;
        if (coldLaunchHandledRef.current === gameState.characterId) return;

        const tz = gameState.timezone || 'UTC';
        const todayKey = clientLocalDateKey(tz, Date.now());
        if (gameState.foragedRecapDateKey === todayKey) return;

        const sleepItems = (gameState.foragedItems ?? []).filter(
            (f) => f.source === 'sleep',
        );
        if (sleepItems.length === 0) return;

        coldLaunchHandledRef.current = gameState.characterId;
        setRecapState({ items: sleepItems });
    }, [gameState, recapState, isSleeping, pendingEndSleep, pendingStartSleep]);

    // Clear pendingEndSleep only when serverSleeping actually transitions
    // true to false (i.e. endSleep landed). Without the transition guard, the
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

    // Background-music lifecycle: kick the loop off once on mount, then
    // duck it whenever the moonoko is sleeping so the sleep screen feels
    // genuinely quiet. The service hydrates SettingsService internally so
    // the initial gain matches the user's saved slider value.
    useEffect(() => {
        MusicService.getInstance().start();
    }, []);

    useEffect(() => {
        MusicService.getInstance().setPaused(isSleeping);
    }, [isSleeping]);

    // Drive the route from sleep state. Two automatic paths:
    //   (a) cold-launch with serverSleeping -> route to 'sleep'.
    //   (b) sleep ends (server cleared sleepStartedAt) -> route off 'sleep'.
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
                // Only show the recap on a real full-rest wake. Force-wake
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
                e?.message || 'Failed to end sleep - try again',
                'error',
            );
        }
    }, [endSleep, gameState, onNotification]);

    return (
        <>
            <SleepConfirmationModal
                visible={sleepModalVisible}
                character={selectedCharacter}
                playerName={playerName}
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
                                `Test alarm scheduled (${res.reason} - 60s)`,
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
                    playerName={playerName}
                    onDismiss={() => {
                        setRecapState(null);
                        coldLaunchHandledRef.current = selectedCharacter?.id ?? null;
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
