// Central asset manifest. Every static image used by the app should be
// reached through this module — components import a typed reference (e.g.
// `Menu.chat`) instead of a literal path. Renaming or moving an asset then
// becomes a one-line change here, not a hunt across N components.
//
// Metro statically analyzes require() at build time, so the requires must
// stay as plain string literals (no template strings, no dynamic paths).

import type { IngredientId } from '../services/RecipeCatalog';

// Anim GIFs use a `-anim` suffix to avoid colliding with the still PNG when
// Android Gradle Plugin folds the asset path into a resource name (it strips
// extensions and lowercases — without the suffix, `LYRA.png` and `LYRA.gif`
// both fold to `assets_images_characters_lyra` and the build fails at
// :app:mergeReleaseResources with "Duplicate resources".
// Sleep poses are added per-character as art lands. Characters without
// their own sleep PNG fall back to LYRA's pose (see getCharacterSleep) —
// keeps the sleep screen visually coherent (sleep theme + closed eyes)
// rather than reusing the awake still, which reads as "the moonoko is
// just standing there in the dark."
export const Characters = {
    ARO: {
        still: require('../../assets/images/characters/ARO.png'),
        anim: require('../../assets/images/characters/ARO-anim.gif'),
        sleep: require('../../assets/images/characters/ARO-sleep.png'),
    },
    LYRA: {
        still: require('../../assets/images/characters/LYRA.png'),
        anim: require('../../assets/images/characters/LYRA-anim.gif'),
        sleep: require('../../assets/images/characters/LYRA-sleep.png'),
    },
    ORION: {
        still: require('../../assets/images/characters/ORION.png'),
        anim: require('../../assets/images/characters/ORION-anim.gif'),
        sleep: require('../../assets/images/characters/ORION-sleep.png'),
    },
    SIRIUS: {
        still: require('../../assets/images/characters/SIRIUS.png'),
        anim: require('../../assets/images/characters/SIRIUS-anim.gif'),
        sleep: require('../../assets/images/characters/SIRIUS-sleep.png'),
    },
    ZANIAH: {
        still: require('../../assets/images/characters/ZANIAH.png'),
        anim: require('../../assets/images/characters/ZANIAH-anim.gif'),
        sleep: require('../../assets/images/characters/ZANIAH-sleep.png'),
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

// Sleep pose lookup — falls back to LYRA's sleep pose when the requested
// character doesn't have its own sleep art yet (currently SIRIUS/ZANIAH).
// Reusing the awake still here would break the sleep-theme look; LYRA's
// pose at least keeps the closed-eyes/sleeping silhouette consistent.
export const getCharacterSleep = (id: string | null | undefined) => {
    const c = Characters[normalizeId(id)];
    return ('sleep' in c ? c.sleep : null) ?? Characters.LYRA.sleep;
};

// `Ingredients.*` is the namespaced grab-bag — useful when a screen wants a
// specific sprite by name. The recipe/cooking system uses `getIngredientArt`
// below instead, which keys off the IngredientId union and falls back when
// art hasn't landed yet.
export const Ingredients = {
    bacon: require('../../assets/images/ingredients/bacon.png'),
    banana: require('../../assets/images/ingredients/banana.png'),
    bread: require('../../assets/images/ingredients/bread.png'),
    carrot: require('../../assets/images/ingredients/carrot.png'),
    egg: require('../../assets/images/ingredients/egg.png'),
    gouda: require('../../assets/images/ingredients/gouda.png'),
    lettuce: require('../../assets/images/ingredients/lettuce.png'),
    milk: require('../../assets/images/ingredients/milk.png'),
    oat: require('../../assets/images/ingredients/oat.png'),
    potato: require('../../assets/images/ingredients/potato.png'),
    rice: require('../../assets/images/ingredients/rice.png'),
    strawberry: require('../../assets/images/ingredients/strawberry.png'),
    tofu: require('../../assets/images/ingredients/tofu.png'),
    tomato: require('../../assets/images/ingredients/tomato.png'),
    tuna: require('../../assets/images/ingredients/tuna.png'),
    // Legacy placeholder retained as the star_dust stand-in until the real
    // ultra-rare sprite drops. Removing it would break getIngredientArt for
    // the only IngredientId without dedicated art.
    pinkSugar: require('../../assets/images/ingredients/pink-sugar.png'),
} as const;

// Real ingredient art keyed by RecipeCatalog.IngredientId. star_dust currently
// reuses the pink-sugar placeholder until the dedicated sprite lands.
//
// Backed by a Map so untrusted runtime ids (server payloads, IngredientCounts
// keys) can't accidentally hit prototype-chain properties like `toString`.
// The entry tuple is typed as `[IngredientId, ...]` so a typo'd key is a
// compile error without forcing IngredientId casts at call sites.
const INGREDIENT_ART = new Map<string, ReturnType<typeof require>>([
    ['bacon', Ingredients.bacon],
    ['banana', Ingredients.banana],
    ['bread', Ingredients.bread],
    ['carrot', Ingredients.carrot],
    ['egg', Ingredients.egg],
    ['gouda', Ingredients.gouda],
    ['lettuce', Ingredients.lettuce],
    ['milk', Ingredients.milk],
    ['oat', Ingredients.oat],
    ['potato', Ingredients.potato],
    ['rice', Ingredients.rice],
    ['strawberry', Ingredients.strawberry],
    ['tofu', Ingredients.tofu],
    ['tomato', Ingredients.tomato],
    ['tuna', Ingredients.tuna],
    ['star_dust', Ingredients.pinkSugar],
] satisfies [IngredientId, ReturnType<typeof require>][]);

export function getIngredientArt(id: string) {
    // Fallback to pink-sugar for unknown ids — same surface the star_dust
    // placeholder uses, so a typo or stale server id still renders something
    // instead of breaking the slot.
    return INGREDIENT_ART.get(id) ?? Ingredients.pinkSugar;
}

// Recipe dish art keyed by Recipe.id. All 14 v1 recipes have art; ids
// outside the catalog fall back to the pink-sugar placeholder so a stale
// recipe id from server state can't crash the renderer.
const RECIPE_ART = new Map<string, ReturnType<typeof require>>([
    ['babana_bred', require('../../assets/images/recipes/babana_bred.png')],
    ['burdger', require('../../assets/images/recipes/burdger.png')],
    ['dont_ask', require('../../assets/images/recipes/dont_ask.png')],
    ['eggtato', require('../../assets/images/recipes/eggtato.png')],
    ['healthy_era', require('../../assets/images/recipes/healthy_era.png')],
    ['hoshi_boba', require('../../assets/images/recipes/hoshi_boba.png')],
    ['hoshi_tato', require('../../assets/images/recipes/hoshi_tato.png')],
    ['maki_chan', require('../../assets/images/recipes/maki_chan.png')],
    ['miso_nori', require('../../assets/images/recipes/miso_nori.png')],
    ['oat_and_cheese', require('../../assets/images/recipes/oat_and_cheese.png')],
    ['oatmaxxing', require('../../assets/images/recipes/oatmaxxing.png')],
    ['turboslayer_9000', require('../../assets/images/recipes/turboslayer_9000.png')],
    ['veggeta', require('../../assets/images/recipes/veggeta.png')],
    ['wobble', require('../../assets/images/recipes/wobble.png')],
]);

export function getRecipeArt(id: string) {
    return RECIPE_ART.get(id) ?? Ingredients.pinkSugar;
}

// Recipe-card backgrounds. Common = mint, Rare = rainbow gradient. Selected
// per-recipe by FeedingPage (rule lives there, not here, so the art module
// stays catalog-agnostic).
export const RecipeCards = {
    common: require('../../assets/images/ui/menu-cards/common.png'),
    rare: require('../../assets/images/ui/menu-cards/rare.png'),
} as const;

// Per-SKU shop card art. Keyed off the shopCatalog.ts item ids so a
// missing entry maps cleanly to the catalog's STUB_IMAGE fallback.
export const ShopItems = {
    boxIngredientsCommon: require('../../assets/images/ui/shop-items/ingredient-box-common.png'),
    boxIngredientsUncommon: require('../../assets/images/ui/shop-items/ingredient-box-uncommon.png'),
    boxIngredientsRare: require('../../assets/images/ui/shop-items/ingredient-box-rare.png'),
    seasonPass: require('../../assets/images/ui/shop-items/lunar-pass.png'),
    satelliteDish: require('../../assets/images/ui/shop-items/satellite-dish.png'),
    sfPackSmall: require('../../assets/images/ui/shop-items/shards-pack-small.png'),
    sfPackMedium: require('../../assets/images/ui/shop-items/shards-pack-medium.png'),
    sfPackLarge: require('../../assets/images/ui/shop-items/shards-pack-large.png'),
    starterPack: require('../../assets/images/ui/shop-items/starter-pack.png'),
    carryCapacity: require('../../assets/images/ui/shop-items/carry-capacity.png'),
    potSize: require('../../assets/images/ui/shop-items/pot-size.png'),
    promoPack: require('../../assets/images/ui/shop-items/promo-pack-1.png'),
    snoozeSeed: require('../../assets/images/ui/shop-items/snooze-seed.png'),
    starberry: require('../../assets/images/ui/shop-items/starberry.png'),
    moonokoBall: require('../../assets/images/ui/shop-items/moonoko-ball.png'),
} as const;

export const Backgrounds = {
    screen: require('../../assets/images/ui/backgrounds/screen-bg.png'),
    cooking: require('../../assets/images/ui/backgrounds/cooking-bg-base.png'),
    cookingBanner: require('../../assets/images/ui/backgrounds/cooking-bg-top.png'),
    cookingBottom: require('../../assets/images/ui/backgrounds/cooking-bg-bottom.png'),
    arcade: require('../../assets/images/ui/backgrounds/arcade-bg-base.png'),
    arcadeBanner: require('../../assets/images/ui/backgrounds/arcade-bg-top.png'),
    arcadeBottom: require('../../assets/images/ui/backgrounds/arcade-bg-bottom.png'),
    sleep: require('../../assets/images/ui/backgrounds/sleep-bg.png'),
    shop: require('../../assets/images/ui/backgrounds/shop-bg-base.png'),
    shopBanner: require('../../assets/images/ui/backgrounds/shop-bg-v2.gif'),
    shopBannerShadow: require('../../assets/images/ui/backgrounds/shop-bg-shadow.png'),
    shopBottom: require('../../assets/images/ui/backgrounds/shop-bg-bottom.png'),
    settings: require('../../assets/images/ui/backgrounds/settings-bg.jpg'),
} as const;

// Sleep-screen chrome — pillow the moonoko sleeps on, the alarm row's
// painted box, and the wake-up button sprite. Authored together so the
// screen reads as one cohesive scene rather than RN-default UI on top of
// art.
export const Sleep = {
    pillow: require('../../assets/images/sleep/pillow.png'),
    alarmBox: require('../../assets/images/sleep/alarm-box.png'),
    wakeupButton: require('../../assets/images/sleep/wakeup-button.png'),
} as const;

// In-app stat readouts use the larger "life" star sprites; the home-screen
// widget uses a separate, simpler set of empty/filled stars optimized for
// launcher rendering. Both live under ui/stars/ but the widget module
// imports them directly to keep its bundle independent.
export const Stars = {
    lifeEmpty: require('../../assets/images/ui/stars/star-life.png'),
    lifeFilled: require('../../assets/images/ui/stars/star-life-3.png'),
    // Currency sprite for Star Fragments — distinct from the yellow stat-rating
    // stars (lifeFilled / star-filled) used by the home-screen widget.
    // Originally hot-linked from Google Drive; pulled local in 2026-05-01.
    fragment: require('../../assets/images/ui/stars/star-fragment.png'),
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

// 54-frame button-strip animation. Frames 1–18 are the left-button press
// cycle, 19–36 center, 37–54 right; frame 1 == frame 54 == idle. Each frame
// is a 674×1500 PNG matching the casing's dimensions, with everything except
// the bottom button row alpha-cleared — overlaying it on the casing with the
// same `cover` resize gives pixel-perfect alignment regardless of screen
// aspect.
const ButtonStrips = [
    require('../../assets/images/ui/chrome/buttons/strip_01.png'),
    require('../../assets/images/ui/chrome/buttons/strip_02.png'),
    require('../../assets/images/ui/chrome/buttons/strip_03.png'),
    require('../../assets/images/ui/chrome/buttons/strip_04.png'),
    require('../../assets/images/ui/chrome/buttons/strip_05.png'),
    require('../../assets/images/ui/chrome/buttons/strip_06.png'),
    require('../../assets/images/ui/chrome/buttons/strip_07.png'),
    require('../../assets/images/ui/chrome/buttons/strip_08.png'),
    require('../../assets/images/ui/chrome/buttons/strip_09.png'),
    require('../../assets/images/ui/chrome/buttons/strip_10.png'),
    require('../../assets/images/ui/chrome/buttons/strip_11.png'),
    require('../../assets/images/ui/chrome/buttons/strip_12.png'),
    require('../../assets/images/ui/chrome/buttons/strip_13.png'),
    require('../../assets/images/ui/chrome/buttons/strip_14.png'),
    require('../../assets/images/ui/chrome/buttons/strip_15.png'),
    require('../../assets/images/ui/chrome/buttons/strip_16.png'),
    require('../../assets/images/ui/chrome/buttons/strip_17.png'),
    require('../../assets/images/ui/chrome/buttons/strip_18.png'),
    require('../../assets/images/ui/chrome/buttons/strip_19.png'),
    require('../../assets/images/ui/chrome/buttons/strip_20.png'),
    require('../../assets/images/ui/chrome/buttons/strip_21.png'),
    require('../../assets/images/ui/chrome/buttons/strip_22.png'),
    require('../../assets/images/ui/chrome/buttons/strip_23.png'),
    require('../../assets/images/ui/chrome/buttons/strip_24.png'),
    require('../../assets/images/ui/chrome/buttons/strip_25.png'),
    require('../../assets/images/ui/chrome/buttons/strip_26.png'),
    require('../../assets/images/ui/chrome/buttons/strip_27.png'),
    require('../../assets/images/ui/chrome/buttons/strip_28.png'),
    require('../../assets/images/ui/chrome/buttons/strip_29.png'),
    require('../../assets/images/ui/chrome/buttons/strip_30.png'),
    require('../../assets/images/ui/chrome/buttons/strip_31.png'),
    require('../../assets/images/ui/chrome/buttons/strip_32.png'),
    require('../../assets/images/ui/chrome/buttons/strip_33.png'),
    require('../../assets/images/ui/chrome/buttons/strip_34.png'),
    require('../../assets/images/ui/chrome/buttons/strip_35.png'),
    require('../../assets/images/ui/chrome/buttons/strip_36.png'),
    require('../../assets/images/ui/chrome/buttons/strip_37.png'),
    require('../../assets/images/ui/chrome/buttons/strip_38.png'),
    require('../../assets/images/ui/chrome/buttons/strip_39.png'),
    require('../../assets/images/ui/chrome/buttons/strip_40.png'),
    require('../../assets/images/ui/chrome/buttons/strip_41.png'),
    require('../../assets/images/ui/chrome/buttons/strip_42.png'),
    require('../../assets/images/ui/chrome/buttons/strip_43.png'),
    require('../../assets/images/ui/chrome/buttons/strip_44.png'),
    require('../../assets/images/ui/chrome/buttons/strip_45.png'),
    require('../../assets/images/ui/chrome/buttons/strip_46.png'),
    require('../../assets/images/ui/chrome/buttons/strip_47.png'),
    require('../../assets/images/ui/chrome/buttons/strip_48.png'),
    require('../../assets/images/ui/chrome/buttons/strip_49.png'),
    require('../../assets/images/ui/chrome/buttons/strip_50.png'),
    require('../../assets/images/ui/chrome/buttons/strip_51.png'),
    require('../../assets/images/ui/chrome/buttons/strip_52.png'),
    require('../../assets/images/ui/chrome/buttons/strip_53.png'),
    require('../../assets/images/ui/chrome/buttons/strip_54.png'),
] as const;

export const Chrome = {
    casing: require('../../assets/images/ui/chrome/casing.png'),
    buttonStrips: ButtonStrips,
} as const;

export const Forage = {
    bag: require('../../assets/images/ui/forage/forage-bag.png'),
} as const;

export const Frames = {
    statBack: require('../../assets/images/ui/frames/stat-back.png'),
    username: require('../../assets/images/ui/frames/username.png'),
    iconSelect: require('../../assets/images/ui/frames/icon-select.png'),
    iconSelectDim: require('../../assets/images/ui/frames/icon-select-dim.png'),
    casingCommon: require('../../assets/images/ui/frames/casing-common.png'),
    casingUncommon: require('../../assets/images/ui/frames/casing-mint.png'),
    casingRare: require('../../assets/images/ui/frames/casing-blue.png'),
    casingEpic: require('../../assets/images/ui/frames/casing-pink.png'),
    casingLegendary: require('../../assets/images/ui/frames/casing-yellow.png'),
} as const;

export const Logos = {
    clean: require('../../assets/images/logos/logo-clean.png'),
    final: require('../../assets/images/logos/logo-final.png'),
    star: require('../../assets/images/logos/hoshino-star.png'),
    starAnim: require('../../assets/images/logos/hoshino-star-anim.gif'),
} as const;

// Room cosmetics for the decoratable Room page. Sub-grouped by where they
// can land: `frame` is the outer container (always rendered), `walls` is the
// wall-band background, `decals` are wall-mounted, `floor` items sit on the
// brick band, and `minis` are character figurines that live on the floor.
// New cosmetic drops slot into one of these sub-groups so the layout schema
// can stay narrow without touching the editor.
export const Rooms = {
    frame: {
        default: require('../../assets/images/rooms/room-bg.png'),
    },
    walls: {
        blue: require('../../assets/images/rooms/backwall.png'),
    },
    decals: {
        cobweb: require('../../assets/images/rooms/cobweb.png'),
        porthole: require('../../assets/images/rooms/porthole-window.png'),
        bloodsplatter: require('../../assets/images/rooms/bloodsplatter.png'),
    },
    floor: {
        placemat: require('../../assets/images/rooms/placemat.png'),
    },
    minis: {
        aro: require('../../assets/images/rooms/aro-mini.png'),
    },
} as const;

// One-offs that don't fit the namespaces above. Add new entries to a proper
// namespace if a category emerges; this bucket is a smell, not a target.
export const Misc = {
    eyes: require('../../assets/images/ui/eyes.png'),
} as const;
