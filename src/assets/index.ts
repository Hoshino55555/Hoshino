// Central asset manifest. Every static image used by the app should be
// reached through this module — components import a typed reference (e.g.
// `Menu.chat`) instead of a literal path. Renaming or moving an asset then
// becomes a one-line change here, not a hunt across N components.
//
// Metro statically analyzes require() at build time, so the requires must
// stay as plain string literals (no template strings, no dynamic paths).

import type { IngredientId } from '../services/RecipeCatalog';

export const Characters = {
    ARO: {
        still: require('../../assets/images/characters/ARO.png'),
        anim: require('../../assets/images/characters/ARO.gif'),
    },
    LYRA: {
        still: require('../../assets/images/characters/LYRA.png'),
        anim: require('../../assets/images/characters/LYRA.gif'),
    },
    ORION: {
        still: require('../../assets/images/characters/ORION.png'),
        anim: require('../../assets/images/characters/ORION.gif'),
    },
    SIRIUS: {
        still: require('../../assets/images/characters/SIRIUS.png'),
        anim: require('../../assets/images/characters/SIRIUS.gif'),
    },
    ZANIAH: {
        still: require('../../assets/images/characters/ZANIAH.png'),
        anim: require('../../assets/images/characters/ZANIAH.gif'),
    },
} as const;

// Character IDs are uppercase across the codebase (NFT metadata, server
// payloads, asset filenames) — keep that contract here. Helpers accept
// either an id (`LYRA`) or a filename (`lyra.gif`), normalize case, and
// fall back to LYRA on unknown/empty input.
export type CharacterId = keyof typeof Characters;

const normalizeId = (id: string | null | undefined): CharacterId =>
    (id ?? '').replace(/\.(gif|png)$/i, '').toUpperCase() as CharacterId;

export const getCharacterStill = (id: string | null | undefined) =>
    Characters[normalizeId(id)]?.still ?? Characters.LYRA.still;

export const getCharacterAnim = (id: string | null | undefined) =>
    Characters[normalizeId(id)]?.anim ?? Characters.LYRA.anim;

// `Ingredients.*` is the namespaced grab-bag — useful when a screen wants a
// specific sprite by name. The recipe/cooking system uses `getIngredientArt`
// below instead, which keys off the IngredientId union and falls back when
// art hasn't landed yet.
export const Ingredients = {
    miraBerry: require('../../assets/images/ingredients/mira-berry.png'),
    novaEgg: require('../../assets/images/ingredients/nova-egg.png'),
    pinkSugar: require('../../assets/images/ingredients/pink-sugar.png'),
    gouda: require('../../assets/images/ingredients/gouda.png'),
    lettuce: require('../../assets/images/ingredients/lettuce.png'),
    potato: require('../../assets/images/ingredients/potato.png'),
    rice: require('../../assets/images/ingredients/rice.png'),
    tomato: require('../../assets/images/ingredients/tomato.png'),
} as const;

// Real ingredient art keyed by RecipeCatalog.IngredientId. Filled in as
// art drops; ids without entries fall back via `getIngredientArt` to a
// celestial placeholder so the cooking/forage UI never shows a broken slot.
//
// Backed by a Map so untrusted runtime ids (server payloads, IngredientCounts
// keys) can't accidentally hit prototype-chain properties like `toString`.
// The entry tuple is typed as `[IngredientId, ...]` so a typo'd key is a
// compile error without forcing IngredientId casts at call sites.
const INGREDIENT_ART = new Map<string, ReturnType<typeof require>>([
    ['gouda', Ingredients.gouda],
    ['lettuce', Ingredients.lettuce],
    ['potato', Ingredients.potato],
    ['rice', Ingredients.rice],
    ['tomato', Ingredients.tomato],
] satisfies [IngredientId, ReturnType<typeof require>][]);

const INGREDIENT_PLACEHOLDERS = [
    Ingredients.miraBerry,
    Ingredients.novaEgg,
    Ingredients.pinkSugar,
];

// Stable hash → placeholder index. Same id always maps to the same
// placeholder so the UI doesn't reshuffle on every render.
function placeholderForId(id: string) {
    let h = 0;
    for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
    return INGREDIENT_PLACEHOLDERS[Math.abs(h) % INGREDIENT_PLACEHOLDERS.length];
}

export function getIngredientArt(id: string) {
    return INGREDIENT_ART.get(id) ?? placeholderForId(id);
}

export const Backgrounds = {
    screen: require('../../assets/images/ui/backgrounds/screen-bg.png'),
    cooking: require('../../assets/images/ui/backgrounds/cooking-bg.png'),
    arcade: require('../../assets/images/ui/backgrounds/arcade-bg.png'),
} as const;

// In-app stat readouts use the larger "life" star sprites; the home-screen
// widget uses a separate, simpler set of empty/filled stars optimized for
// launcher rendering. Both live under ui/stars/ but the widget module
// imports them directly to keep its bundle independent.
export const Stars = {
    lifeEmpty: require('../../assets/images/ui/stars/star-life.png'),
    lifeFilled: require('../../assets/images/ui/stars/star-life-3.png'),
} as const;

export const Menu = {
    chat: require('../../assets/images/ui/menu/chat.png'),
    feed: require('../../assets/images/ui/menu/feed.png'),
    gallery: require('../../assets/images/ui/menu/gallery.png'),
    games: require('../../assets/images/ui/menu/games.png'),
    shop: require('../../assets/images/ui/menu/shop.png'),
    settings: require('../../assets/images/ui/menu/settings.png'),
    inventory: require('../../assets/images/ui/menu/backpack.png'),
    sleep: require('../../assets/images/ui/menu/sleepzzzz.png'),
} as const;

export const Chrome = {
    casing: require('../../assets/images/ui/chrome/casing.png'),
    button: require('../../assets/images/ui/chrome/button.png'),
} as const;

export const Logos = {
    clean: require('../../assets/images/logos/logo-clean.png'),
    final: require('../../assets/images/logos/logo-final.png'),
    star: require('../../assets/images/logos/hoshino-star.png'),
    starAnim: require('../../assets/images/logos/hoshino-star.gif'),
} as const;

// One-offs that don't fit the namespaces above. Add new entries to a proper
// namespace if a category emerges; this bucket is a smell, not a target.
export const Misc = {
    eyes: require('../../assets/images/ui/eyes.png'),
} as const;
