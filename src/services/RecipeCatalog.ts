// Recipe catalog for the cooking system.
//
// User tosses ingredients into the pot; the server-side feed call receives
// the resulting meal id. If the ingredient multiset matches a recipe exactly,
// it's that dish. Otherwise it's slop — still food, but lower xp.
//
// Ingredient ids must stay in sync with the foraging pool in
// backend/firebase/functions/game-state-engine.js and the labels in
// src/components/ForagePopOut.tsx.

export type IngredientId =
    // common
    | 'egg'
    | 'lettuce'
    | 'potato'
    | 'rice'
    | 'carrot'
    // uncommon
    | 'banana'
    | 'strawberry'
    | 'tomato'
    | 'tofu'
    | 'oat'
    | 'bread'
    // rare
    | 'bacon'
    | 'milk'
    | 'tuna'
    | 'gouda'
    // ultra rare
    | 'star_dust';

export interface Recipe {
    id: string;
    name: string;
    ingredients: IngredientId[];
}

// 14 v1 recipes. Ingredient order is canonical (sorted alphabetically); the
// match helper sorts user input the same way so order doesn't matter in the pot.
export const RECIPES: Recipe[] = [
    { id: 'eggtato', name: 'Eggtato', ingredients: ['egg', 'potato'] },
    { id: 'wobble', name: 'Wobble', ingredients: ['egg', 'strawberry'] },
    { id: 'veggeta', name: 'Veggeta', ingredients: ['carrot', 'rice', 'tofu'] },
    {
        id: 'miso_nori',
        name: 'Miso Nori',
        ingredients: ['carrot', 'egg', 'lettuce', 'potato', 'tofu'],
    },
    {
        id: 'healthy_era',
        name: 'Healthy Era',
        ingredients: ['carrot', 'egg', 'lettuce', 'potato', 'tofu', 'tomato'],
    },
    { id: 'maki_chan', name: 'Maki-chan', ingredients: ['lettuce', 'rice', 'tuna'] },
    { id: 'oat_and_cheese', name: 'Oat & Cheese', ingredients: ['gouda', 'oat'] },
    { id: 'oatmaxxing', name: 'Oatmaxxing', ingredients: ['milk', 'oat', 'strawberry'] },
    {
        id: 'babana_bred',
        name: 'Babana Bred',
        ingredients: ['banana', 'egg', 'milk', 'oat'],
    },
    {
        id: 'hoshi_boba',
        name: 'Hoshi Boba',
        ingredients: ['banana', 'milk', 'rice', 'strawberry'],
    },
    {
        id: 'burdger',
        name: 'Burdger',
        ingredients: ['bacon', 'bread', 'lettuce', 'tomato'],
    },
    {
        id: 'dont_ask',
        name: "Don't Ask..",
        ingredients: ['bacon', 'star_dust', 'tuna'],
    },
    {
        id: 'hoshi_tato',
        name: 'Hoshi Tato',
        ingredients: ['banana', 'egg', 'milk', 'star_dust', 'strawberry'],
    },
    {
        id: 'turboslayer_9000',
        name: 'TURBOSLAYER9000',
        ingredients: ['bacon', 'bread', 'gouda', 'lettuce', 'star_dust'],
    },
];

export const INGREDIENT_LABELS: Record<IngredientId, string> = {
    egg: 'Egg',
    lettuce: 'Lettuce',
    potato: 'Potato',
    rice: 'Rice',
    carrot: 'Carrot',
    banana: 'Banana',
    strawberry: 'Strawberry',
    tomato: 'Tomato',
    tofu: 'Tofu',
    oat: 'Oat',
    bread: 'Bread',
    bacon: 'Bacon',
    milk: 'Milk',
    tuna: 'Tuna',
    gouda: 'Gouda',
    star_dust: 'Star Dust',
};

export type IngredientTier = 'common' | 'uncommon' | 'rare' | 'ultra_rare';

export const INGREDIENT_TIER: Record<IngredientId, IngredientTier> = {
    egg: 'common',
    lettuce: 'common',
    potato: 'common',
    rice: 'common',
    carrot: 'common',
    banana: 'uncommon',
    strawberry: 'uncommon',
    tomato: 'uncommon',
    tofu: 'uncommon',
    oat: 'uncommon',
    bread: 'uncommon',
    bacon: 'rare',
    milk: 'rare',
    tuna: 'rare',
    gouda: 'rare',
    star_dust: 'ultra_rare',
};

export function ingredientLabel(id: string): string {
    return (INGREDIENT_LABELS as Record<string, string>)[id] || id;
}

// Canonical key for multiset matching. Sorting means ingredient order in the
// pot doesn't matter; duplicates are preserved so (egg, egg) ≠ (egg).
export function ingredientKey(ingredients: readonly string[]): string {
    return [...ingredients].sort().join('|');
}

const RECIPE_BY_KEY: ReadonlyMap<string, Recipe> = new Map(
    RECIPES.map((r) => [ingredientKey(r.ingredients), r])
);

// Exact-multiset match against the catalog. Returns null for slop.
export function matchRecipe(ingredients: readonly string[]): Recipe | null {
    return RECIPE_BY_KEY.get(ingredientKey(ingredients)) ?? null;
}
