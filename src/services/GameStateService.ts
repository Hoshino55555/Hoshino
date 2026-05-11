import { httpsCallable } from 'firebase/functions';
import { functions } from '../config/firebase';

export interface MealClaims {
    dateKey: string;
    breakfast: boolean;
    lunch: boolean;
    dinner: boolean;
}

export type ForageTier = 'common' | 'uncommon' | 'rare' | 'ultra_rare';
export type ForageSource = 'awake' | 'sleep';

export interface ForagedItem {
    id: string;
    ingredient: string;
    tier: ForageTier;
    tickMs: number;
    slot: number;
    source: ForageSource;
}

export interface GameState {
    characterId: string;
    hunger: number;
    mood: number;
    energy: number;
    lastResolvedAt: number;
    sleepStartedAt: number | null;
    timezone: string;
    mealBonusClaimed: MealClaims;
    totalFeedings: number;
    totalPlays: number;
    totalSleeps: number;
    level: number;
    experience: number;
    moodDecayProgressMs?: number;
    energyDecayProgressMs?: number;
    foragedItems?: ForagedItem[];
    lastForagedAt?: number;
    foragedRecapDateKey?: string;
}

interface StateResponse {
    state: GameState;
}

const callGetGameState = httpsCallable<
    { characterId: string; timezone?: string },
    StateResponse
>(functions, 'getGameState');

const callSetTimezone = httpsCallable<
    { characterId: string; timezone: string },
    StateResponse
>(functions, 'setTimezone');

const callFeedMoonoko = httpsCallable<
    { characterId: string; hungerBoost: number; moodBoost: number; timezone?: string },
    StateResponse
>(functions, 'feedMoonoko');

const callRecordPlay = httpsCallable<{ characterId: string; won: boolean }, StateResponse>(
    functions,
    'recordPlay'
);

const callRecordChat = httpsCallable<{ characterId: string }, StateResponse>(
    functions,
    'recordChat'
);

const callStartSleep = httpsCallable<{ characterId: string }, StateResponse>(
    functions,
    'startSleep'
);

const callEndSleep = httpsCallable<
    { characterId: string; force?: boolean },
    StateResponse
>(functions, 'endSleep');

const callDrainForaged = httpsCallable<
    { characterId: string },
    { state: GameState; drained: ForagedItem[] }
>(functions, 'drainForaged');

export type BoosterStat = 'mood' | 'energy' | 'hunger';
export type BoosterSkuId = 'booster-mood' | 'booster-sleep' | 'booster-hunger';

export interface BoosterCounts {
    [skuId: string]: number;
}

const callApplyBooster = httpsCallable<
    { skuId: BoosterSkuId; qty?: number; requestId: string },
    {
        newBalance: number;
        boosters: BoosterCounts;
        skuId: BoosterSkuId;
        qty: number;
        priceSF: number;
        totalCost: number;
        replayed: boolean;
    }
>(functions, 'applyBooster');

const callConsumeBooster = httpsCallable<
    { characterId: string; skuId: BoosterSkuId; requestId: string },
    {
        boosters: BoosterCounts;
        state: GameState;
        stat: BoosterStat;
        skuId: BoosterSkuId;
        replayed: boolean;
    }
>(functions, 'consumeBooster');

// Dev-only: clears mealBonusClaimed flags so feeding flow can be retested
// without waiting for the next game-day rollover. Server gates against
// production; client-side gate is __DEV__ at the call site.
const callDevResetMealClaims = httpsCallable<
    { characterId: string },
    StateResponse
>(functions, 'devResetMealClaims');

const callExchangePrivyToken = httpsCallable<
    { privyAccessToken: string },
    { firebaseToken: string; uid: string }
>(functions, 'exchangePrivyToken');

export interface IngredientCounts {
    [ingredientId: string]: number;
}

export interface RecipeProgressMap {
    [recipeId: string]: number;
}

export interface CookingProfile {
    discoveredRecipes: string[];
    recipeProgress: RecipeProgressMap;
}

export type CookMode = 'manual' | 'recipe';

export interface CookResult {
    kind: 'recipe' | 'slop';
    recipeId: string | null;
    recipeName: string | null;
    firstDiscovery: boolean;
    hungerBoost: number;
    moodBoost: number;
    basePoints: number;
    xp: number;
    level: number;
    recipeProgress: number | null;
    moodMult: number;
    hungerMult: number;
    ingredientsUsed: string[];
}

export interface CookResponse {
    state: GameState;
    inventory: { counts: IngredientCounts };
    cooking: CookingProfile;
    result: CookResult;
}

interface CookRequest {
    characterId: string;
    mode: CookMode;
    ingredients?: string[];
    recipeId?: string;
    timezone?: string;
}

const callCook = httpsCallable<CookRequest, CookResponse>(functions, 'cook');

const callGetInventory = httpsCallable<Record<string, never>, { counts: IngredientCounts }>(
    functions,
    'getInventory'
);

const callGetCookingProfile = httpsCallable<Record<string, never>, CookingProfile>(
    functions,
    'getCookingProfile'
);

export interface PlayerProfile {
    playerName: string;
    ownedCharacterIds: string[];
    selectedCharacterId: string | null;
}

const callGetPlayerProfile = httpsCallable<Record<string, never>, PlayerProfile>(
    functions,
    'getPlayerProfile'
);

const callSetPlayerProfile = httpsCallable<
    { playerName?: string; selectedCharacterId?: string | null },
    PlayerProfile
>(functions, 'setPlayerProfile');

function localTimezone(): string {
    try {
        return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
    } catch {
        return 'UTC';
    }
}

export const GameStateService = {
    async exchangePrivyToken(privyAccessToken: string): Promise<{ firebaseToken: string; uid: string }> {
        const res = await callExchangePrivyToken({ privyAccessToken });
        return res.data;
    },

    async getState(characterId: string): Promise<GameState> {
        const res = await callGetGameState({ characterId, timezone: localTimezone() });
        return res.data.state;
    },

    async setTimezone(characterId: string, tz: string): Promise<GameState> {
        const res = await callSetTimezone({ characterId, timezone: tz });
        return res.data.state;
    },

    async feed(
        characterId: string,
        hungerBoost: number,
        moodBoost: number
    ): Promise<GameState> {
        const res = await callFeedMoonoko({
            characterId,
            hungerBoost,
            moodBoost,
            timezone: localTimezone(),
        });
        return res.data.state;
    },

    async play(characterId: string, won: boolean = false): Promise<GameState> {
        const res = await callRecordPlay({ characterId, won });
        return res.data.state;
    },

    async chat(characterId: string): Promise<GameState> {
        const res = await callRecordChat({ characterId });
        return res.data.state;
    },

    async startSleep(characterId: string): Promise<GameState> {
        const res = await callStartSleep({ characterId });
        return res.data.state;
    },

    async endSleep(characterId: string, force = false): Promise<GameState> {
        const res = await callEndSleep({ characterId, force });
        return res.data.state;
    },

    async drainForaged(
        characterId: string
    ): Promise<{ state: GameState; drained: ForagedItem[] }> {
        const res = await callDrainForaged({ characterId });
        return res.data;
    },

    async applyBooster(
        skuId: BoosterSkuId,
        qty: number = 1,
        requestId: string
    ): Promise<{
        newBalance: number;
        boosters: BoosterCounts;
        skuId: BoosterSkuId;
        qty: number;
        priceSF: number;
        totalCost: number;
        replayed: boolean;
    }> {
        const res = await callApplyBooster({ skuId, qty, requestId });
        return res.data;
    },

    async consumeBooster(
        characterId: string,
        skuId: BoosterSkuId,
        requestId: string
    ): Promise<{
        boosters: BoosterCounts;
        state: GameState;
        stat: BoosterStat;
        skuId: BoosterSkuId;
        replayed: boolean;
    }> {
        const res = await callConsumeBooster({ characterId, skuId, requestId });
        return res.data;
    },

    async devResetMealClaims(characterId: string): Promise<GameState> {
        const res = await callDevResetMealClaims({ characterId });
        return res.data.state;
    },

    async getInventory(): Promise<IngredientCounts> {
        const res = await callGetInventory({});
        return res.data.counts || {};
    },

    async getCookingProfile(): Promise<CookingProfile> {
        const res = await callGetCookingProfile({});
        return {
            discoveredRecipes: res.data.discoveredRecipes || [],
            recipeProgress: res.data.recipeProgress || {},
        };
    },

    async cookManual(characterId: string, ingredients: string[]): Promise<CookResponse> {
        const res = await callCook({
            characterId,
            mode: 'manual',
            ingredients,
            timezone: localTimezone(),
        });
        return res.data;
    },

    async cookRecipe(
        characterId: string,
        recipeId: string,
        ingredients?: string[]
    ): Promise<CookResponse> {
        const res = await callCook({
            characterId,
            mode: 'recipe',
            recipeId,
            ingredients,
            timezone: localTimezone(),
        });
        return res.data;
    },

    async getPlayerProfile(): Promise<PlayerProfile> {
        const res = await callGetPlayerProfile({});
        return res.data;
    },

    async setPlayerProfile(
        updates: { playerName?: string; selectedCharacterId?: string | null }
    ): Promise<PlayerProfile> {
        const res = await callSetPlayerProfile(updates);
        return res.data;
    },
};

export const SLEEP_REQUIRED_MS = 8 * 60 * 60 * 1000;
