import type { ArcadeGameId } from '../components/GamesList';

export type AppView =
    | 'welcome'
    | 'selection'
    | 'interaction'
    | 'feeding'
    | 'shop'
    | 'gallery'
    | 'arcade'
    | ArcadeGameId
    | 'inventory'
    | 'settings'
    | 'profile'
    | 'chat'
    | 'sleep'
    | 'vrf-dev';

export interface AppCharacter {
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

export interface PendingWidgetAction {
    type: 'forage-drain';
    characterId: string;
    setAt: number;
}

export type AppNotificationType = 'success' | 'error' | 'info' | 'warning';

export type AppNotificationHandler = (
    message: string,
    type: AppNotificationType,
) => void;
