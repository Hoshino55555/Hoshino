export interface Character {
    id: string;
    name: string;
    description: string;
    image: string;
    baseStats?: {
        mood: number;
        hunger: number;
        energy: number;
    };
    specialAbility?: string;
    nftMint?: string | null;
}


