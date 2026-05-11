import { useEffect } from 'react';

import { useGameStateContext } from '../contexts/GameStateContext';
import type { AppCharacter } from '../types/AppTypes';
import { pushMoonokoSnapshot } from './widgetService';

interface Props {
    selectedCharacter: AppCharacter | null;
}

export default function WidgetSnapshotController({ selectedCharacter }: Props) {
    const { state: gameState } = useGameStateContext();

    useEffect(() => {
        if (!selectedCharacter || !gameState) return;
        const avatarKey = selectedCharacter.image.replace(/\.gif$/i, '');
        const pendingFinds = (gameState.foragedItems ?? []).filter(
            (f) => f.source !== 'sleep'
        );
        // gameState stats are on a 0..5 scale. Widget contract is 0..100.
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
            // it (widget shows 0). The forage interaction does not depend on it.
            fragments: 0,
            isSleeping: gameState.sleepStartedAt != null,
            foragedCount: pendingFinds.length,
            mealBonusClaimed: gameState.mealBonusClaimed,
            timezone: gameState.timezone,
        }).catch(() => {});
    }, [
        selectedCharacter,
        gameState?.characterId,
        gameState?.mood,
        gameState?.hunger,
        gameState?.energy,
        gameState?.level,
        gameState?.sleepStartedAt,
        gameState?.foragedItems,
        gameState?.mealBonusClaimed,
        gameState?.timezone,
    ]);

    return null;
}
