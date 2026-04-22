import { httpsCallable } from 'firebase/functions';
import { functions } from '../config/firebase';

export interface MealClaims {
    dateKey: string;
    breakfast: boolean;
    lunch: boolean;
    dinner: boolean;
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

const callRecordPlay = httpsCallable<{ characterId: string }, StateResponse>(
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

const callExchangePrivyToken = httpsCallable<
    { privyAccessToken: string },
    { firebaseToken: string; uid: string }
>(functions, 'exchangePrivyToken');

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

    async play(characterId: string): Promise<GameState> {
        const res = await callRecordPlay({ characterId });
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
};

export const SLEEP_REQUIRED_MS = 8 * 60 * 60 * 1000;
