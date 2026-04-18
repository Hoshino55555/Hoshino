export type Rarity = 'Common' | 'Rare' | 'Epic' | 'Legendary';

export interface Moonoko {
    id: string;
    name: string;
    description: string;
    imageBase: string;
    element: string;
    baseStats: {
        mood: number;
        hunger: number;
        energy: number;
    };
    rarity: Rarity;
    specialAbility: string;
}

export const MOONOKOS: Moonoko[] = [
    {
        id: 'lyra',
        name: 'Lyra',
        description: "Lyra lives for attention, anime, and being just a little unhinged. She'll flirt, cry, and roast you in the same breath. Don't leave her on read — ever.",
        imageBase: 'LYRA',
        element: 'Celestial',
        baseStats: { mood: 4, hunger: 3, energy: 3 },
        rarity: 'Common',
        specialAbility: 'Healing Aura - Recovers faster when resting',
    },
    {
        id: 'orion',
        name: 'Orion',
        description: "A dramatic starboy with too many feelings and a quiet grudge. Sometimes you'll catch him in a corner, blasting Lil Peep like it's a coping mechanism. Don't ask, he won't tell.",
        imageBase: 'ORION',
        element: 'Cosmic',
        baseStats: { mood: 3, hunger: 4, energy: 3 },
        rarity: 'Rare',
        specialAbility: 'Night Vision - Gains energy during nighttime',
    },
    {
        id: 'aro',
        name: 'Aro',
        description: "A chaotic little menace. Loud, unhinged, and always ready to play. Share a secret and he'll turn it into his favorite joke for weeks.",
        imageBase: 'ARO',
        element: 'Stellar',
        baseStats: { mood: 5, hunger: 2, energy: 3 },
        rarity: 'Epic',
        specialAbility: 'Star Power - Mood boosts last longer',
    },
    {
        id: 'sirius',
        name: 'Sirius',
        description: "A robot cat who thinks he's hilarious. Loves making dad jokes about AI and insists you call him \"Hey Sirius\". But don't worry, he's still learning emotions… kind of.",
        imageBase: 'SIRIUS',
        element: 'Stellar',
        baseStats: { mood: 5, hunger: 3, energy: 4 },
        rarity: 'Legendary',
        specialAbility: 'Stellar Radiance - Boosts all stats when mood is at maximum',
    },
    {
        id: 'zaniah',
        name: 'Zaniah',
        description: "If she's moody, don't ask — it's either Mercury retrograde or you're a Scorpio. Or both. Let her vibe it out, she's in her healing era.",
        imageBase: 'ZANIAH',
        element: 'Celestial',
        baseStats: { mood: 4, hunger: 3, energy: 5 },
        rarity: 'Legendary',
        specialAbility: 'Stellar Resonance - Amplifies all abilities during stellar events',
    },
];

export const MOONOKOS_BY_ID: Record<string, Moonoko> = Object.fromEntries(
    MOONOKOS.map((m) => [m.id, m])
);

export interface GameCharacter {
    id: string;
    name: string;
    description: string;
    image: string;
    element: string;
    baseStats: { mood: number; hunger: number; energy: number };
    rarity: Rarity;
    specialAbility: string;
    nftMint?: string | null;
}

export const toGameCharacter = (
    m: Moonoko,
    ownedIds: string[],
    variant: 'gif' | 'png' = 'png'
): GameCharacter => ({
    id: m.id,
    name: m.name,
    description: m.description,
    image: `${m.imageBase}.${variant}`,
    element: m.element,
    baseStats: m.baseStats,
    rarity: m.rarity,
    specialAbility: m.specialAbility,
    nftMint: ownedIds.includes(m.id) ? `mint_address_${m.id}` : null,
});

export const getGameCharacters = (
    ownedIds: string[],
    variant: 'gif' | 'png' = 'png'
): GameCharacter[] => MOONOKOS.map((m) => toGameCharacter(m, ownedIds, variant));
