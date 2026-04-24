import React, { createContext, useContext, ReactNode } from 'react';
import { useGameState } from '../hooks/useGameState';
import type {
    GameState,
    ForagedItem,
    IngredientCounts,
    CookResponse,
    RecipeProgressMap,
} from '../services/GameStateService';

interface GameStateContextType {
    state: GameState | null;
    loading: boolean;
    error: string | null;
    refresh: () => Promise<void>;
    feed: (hungerBoost: number, moodBoost: number) => Promise<GameState>;
    play: () => Promise<GameState>;
    chat: () => Promise<GameState>;
    startSleep: () => Promise<GameState>;
    endSleep: (force?: boolean) => Promise<GameState>;
    drainForaged: () => Promise<ForagedItem[]>;
    sleepRemainingMs: number;
    inventory: IngredientCounts;
    discoveredRecipes: string[];
    recipeProgress: RecipeProgressMap;
    refreshPantry: () => Promise<void>;
    cookManual: (ingredients: string[]) => Promise<CookResponse>;
    cookRecipe: (recipeId: string) => Promise<CookResponse>;
}

const GameStateContext = createContext<GameStateContextType | undefined>(undefined);

interface ProviderProps {
    characterId: string | null | undefined;
    children: ReactNode;
}

export const GameStateProvider: React.FC<ProviderProps> = ({ characterId, children }) => {
    const hook = useGameState(characterId);
    return <GameStateContext.Provider value={hook}>{children}</GameStateContext.Provider>;
};

export const useGameStateContext = (): GameStateContextType => {
    const ctx = useContext(GameStateContext);
    if (!ctx) {
        throw new Error('useGameStateContext must be used within a GameStateProvider');
    }
    return ctx;
};
