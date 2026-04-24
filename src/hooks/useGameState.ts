import { useCallback, useEffect, useRef, useState } from 'react';
import {
    GameStateService,
    type GameState,
    type ForagedItem,
    type IngredientCounts,
    type CookResponse,
    SLEEP_REQUIRED_MS,
} from '../services/GameStateService';
import { useFirebaseAuth } from '../contexts/FirebaseAuthContext';

interface UseGameStateResult {
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
    sleepRemainingMs: number; // 0 if not sleeping or finished
    // Cooking surfaces
    inventory: IngredientCounts;
    discoveredRecipes: string[];
    refreshPantry: () => Promise<void>;
    cookManual: (ingredients: string[]) => Promise<CookResponse>;
    cookRecipe: (recipeId: string) => Promise<CookResponse>;
}

export function useGameState(characterId: string | null | undefined): UseGameStateResult {
    const { firebaseUid, ready } = useFirebaseAuth();
    const [state, setState] = useState<GameState | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [tick, setTick] = useState(0);
    const [inventory, setInventory] = useState<IngredientCounts>({});
    const [discoveredRecipes, setDiscoveredRecipes] = useState<string[]>([]);
    const inFlightRef = useRef<Promise<void> | null>(null);

    const load = useCallback(async () => {
        if (!characterId || !firebaseUid) return;
        if (inFlightRef.current) return inFlightRef.current;
        const p = (async () => {
            setLoading(true);
            try {
                const next = await GameStateService.getState(characterId);
                setState(next);
                setError(null);
            } catch (e: any) {
                setError(e?.message || 'Failed to load state');
            } finally {
                setLoading(false);
                inFlightRef.current = null;
            }
        })();
        inFlightRef.current = p;
        return p;
    }, [characterId, firebaseUid]);

    useEffect(() => {
        if (!ready || !firebaseUid || !characterId) return;
        load();
    }, [ready, firebaseUid, characterId, load]);

    // Re-resolve every minute so on-screen stats reflect decay/meal windows
    // without user action. Cheap: one callable, server is authoritative.
    useEffect(() => {
        if (!ready || !firebaseUid || !characterId) return;
        const id = setInterval(() => load(), 60000);
        return () => clearInterval(id);
    }, [ready, firebaseUid, characterId, load]);

    // Local tick while sleeping so the countdown updates.
    useEffect(() => {
        if (!state?.sleepStartedAt) return;
        const id = setInterval(() => setTick((t) => t + 1), 1000);
        return () => clearInterval(id);
    }, [state?.sleepStartedAt]);

    const feed = useCallback(
        async (hungerBoost: number, moodBoost: number) => {
            if (!characterId) throw new Error('No character selected');
            const next = await GameStateService.feed(characterId, hungerBoost, moodBoost);
            setState(next);
            return next;
        },
        [characterId]
    );

    const play = useCallback(async () => {
        if (!characterId) throw new Error('No character selected');
        const next = await GameStateService.play(characterId);
        setState(next);
        return next;
    }, [characterId]);

    const chat = useCallback(async () => {
        if (!characterId) throw new Error('No character selected');
        const next = await GameStateService.chat(characterId);
        setState(next);
        return next;
    }, [characterId]);

    const startSleep = useCallback(async () => {
        if (!characterId) throw new Error('No character selected');
        const next = await GameStateService.startSleep(characterId);
        setState(next);
        return next;
    }, [characterId]);

    const endSleep = useCallback(
        async (force = false) => {
            if (!characterId) throw new Error('No character selected');
            const next = await GameStateService.endSleep(characterId, force);
            setState(next);
            return next;
        },
        [characterId]
    );

    const drainForaged = useCallback(async () => {
        if (!characterId) throw new Error('No character selected');
        const { state: next, drained } = await GameStateService.drainForaged(characterId);
        setState(next);
        // Forage drain writes ingredients into the pantry doc — refresh local mirror.
        try {
            const counts = await GameStateService.getInventory();
            setInventory(counts);
        } catch {
            // Non-fatal: the drain already succeeded, the mirror just lags a tick.
        }
        return drained;
    }, [characterId]);

    const refreshPantry = useCallback(async () => {
        if (!firebaseUid) return;
        try {
            const [counts, profile] = await Promise.all([
                GameStateService.getInventory(),
                GameStateService.getCookingProfile(),
            ]);
            setInventory(counts);
            setDiscoveredRecipes(profile.discoveredRecipes);
        } catch (e: any) {
            setError(e?.message || 'Failed to load pantry');
        }
    }, [firebaseUid]);

    useEffect(() => {
        if (!ready || !firebaseUid) return;
        refreshPantry();
    }, [ready, firebaseUid, refreshPantry]);

    const cookManual = useCallback(
        async (ingredients: string[]) => {
            if (!characterId) throw new Error('No character selected');
            const res = await GameStateService.cookManual(characterId, ingredients);
            setState(res.state);
            setInventory(res.inventory.counts);
            setDiscoveredRecipes(res.cooking.discoveredRecipes);
            return res;
        },
        [characterId]
    );

    const cookRecipe = useCallback(
        async (recipeId: string) => {
            if (!characterId) throw new Error('No character selected');
            const res = await GameStateService.cookRecipe(characterId, recipeId);
            setState(res.state);
            setInventory(res.inventory.counts);
            setDiscoveredRecipes(res.cooking.discoveredRecipes);
            return res;
        },
        [characterId]
    );

    let sleepRemainingMs = 0;
    if (state?.sleepStartedAt) {
        const elapsed = Date.now() - state.sleepStartedAt;
        sleepRemainingMs = Math.max(0, SLEEP_REQUIRED_MS - elapsed);
    }
    // Silence unused-var lint for tick; its job is to force rerender.
    void tick;

    return {
        state,
        loading,
        error,
        refresh: load as () => Promise<void>,
        feed,
        play,
        chat,
        startSleep,
        endSleep,
        drainForaged,
        sleepRemainingMs,
        inventory,
        discoveredRecipes,
        refreshPantry,
        cookManual,
        cookRecipe,
    };
}
