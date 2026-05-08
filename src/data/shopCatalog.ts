// Shop catalog. Three top-level tabs (Deals / Consumables / Accessories);
// each tab has subcategories used as section headers. Items priced in
// star fragments can be purchased today; items priced in USD are gated on
// IAP integration and render as "Coming Soon" in the UI until then.
//
// Item ids must be stable — they're used as inventory keys (ingredients
// match RecipeCatalog.IngredientId so purchased ingredients land in the
// cooking inventory).

import type { ImageSourcePropType } from 'react-native';
import { ItemCategory, ItemRarity, type MarketplaceItem } from '../services/MarketplaceService';
import { Ingredients, ShopItems } from '../assets';

export type ShopTab = 'deals' | 'consumables' | 'accessories';

export type ShopCurrency = 'starFragments' | 'usd';

export type ShopItemStatus =
    | 'available'      // purchasable now
    | 'iap-pending'    // blocked on IAP integration; render as Coming Soon
    | 'asset-pending'  // art not yet but logic ready (e.g. daily-spin); still tappable
    | 'effect-pending'; // server-side effect not wired; block purchase to avoid SF-burn

export interface ShopItem extends MarketplaceItem {
    tab: ShopTab;
    subcategory: string;
    currency: ShopCurrency;
    priceUsd?: number;
    status: ShopItemStatus;
    image: ImageSourcePropType;
    durationLabel?: string; // e.g. "1 week", "24h" — shown beneath title for time-limited items
    summary?: string;       // short bullet shown on the card
}

// Generic stub image for items that don't yet have dedicated art. Reuses an
// existing sprite so we don't ship a broken-image placeholder; the card's
// "Coming Soon" overlay carries the real signal that the item isn't live.
const STUB_IMAGE: ImageSourcePropType = Ingredients.pinkSugar;

const dealsItems: ShopItem[] = [
    {
        id: 'season-pass',
        name: 'Season Pass',
        description: 'AI chat credits, dream diary, accessories, 1 exclusive Moonoko',
        imageUrl: '',
        category: ItemCategory.UTILITY,
        rarity: ItemRarity.LEGENDARY,
        priceSOL: 0,
        priceStarFragments: 0,
        inStock: true,
        tab: 'deals',
        subcategory: 'Season Pass',
        currency: 'usd',
        priceUsd: 9.99,
        status: 'iap-pending',
        image: ShopItems.seasonPass,
        summary: 'AI credits · diary · exclusive Moonoko',
    },
    {
        id: 'bundle-starter',
        name: 'Starter Pack',
        description: 'A bundle of starting essentials',
        imageUrl: '',
        category: ItemCategory.UTILITY,
        rarity: ItemRarity.RARE,
        priceSOL: 0,
        priceStarFragments: 0,
        inStock: true,
        tab: 'deals',
        subcategory: 'Bundles',
        currency: 'usd',
        status: 'iap-pending',
        image: ShopItems.starterPack,
    },
    {
        id: 'bundle-themed',
        name: 'Themed Bundle',
        description: 'Rotating themed bundle',
        imageUrl: '',
        category: ItemCategory.UTILITY,
        rarity: ItemRarity.EPIC,
        priceSOL: 0,
        priceStarFragments: 0,
        inStock: true,
        tab: 'deals',
        subcategory: 'Bundles',
        currency: 'usd',
        status: 'iap-pending',
        image: ShopItems.promoPack,
    },
    {
        id: 'bundle-bargain',
        name: 'Bargain Bundle',
        description: 'Discounted assortment',
        imageUrl: '',
        category: ItemCategory.UTILITY,
        rarity: ItemRarity.UNCOMMON,
        priceSOL: 0,
        priceStarFragments: 0,
        inStock: true,
        tab: 'deals',
        subcategory: 'Bundles',
        currency: 'usd',
        status: 'iap-pending',
        image: ShopItems.promoPack,
    },
    {
        id: 'star-fragments-small',
        name: 'Shard Pack · S',
        description: '500 Shards',
        imageUrl: '',
        category: ItemCategory.UTILITY,
        rarity: ItemRarity.COMMON,
        priceSOL: 0,
        priceStarFragments: 0,
        inStock: true,
        tab: 'deals',
        subcategory: 'Shards',
        currency: 'usd',
        priceUsd: 0.99,
        status: 'iap-pending',
        image: ShopItems.sfPackSmall,
        summary: '500 fragments',
    },
    {
        id: 'star-fragments-medium',
        name: 'Shard Pack · M',
        description: '3000 Shards',
        imageUrl: '',
        category: ItemCategory.UTILITY,
        rarity: ItemRarity.UNCOMMON,
        priceSOL: 0,
        priceStarFragments: 0,
        inStock: true,
        tab: 'deals',
        subcategory: 'Shards',
        currency: 'usd',
        priceUsd: 4.99,
        status: 'iap-pending',
        image: ShopItems.sfPackMedium,
        summary: '3,000 fragments',
    },
    {
        id: 'star-fragments-large',
        name: 'Shard Pack · L',
        description: '7000 Shards',
        imageUrl: '',
        category: ItemCategory.UTILITY,
        rarity: ItemRarity.RARE,
        priceSOL: 0,
        priceStarFragments: 0,
        inStock: true,
        tab: 'deals',
        subcategory: 'Shards',
        currency: 'usd',
        priceUsd: 9.99,
        status: 'iap-pending',
        image: ShopItems.sfPackLarge,
        summary: '7,000 fragments',
    },
    {
        id: 'hackathon-special',
        name: 'Hackathon Special',
        description: 'Free 10,000 Shards — hackathon demo grant.',
        imageUrl: '',
        category: ItemCategory.UTILITY,
        rarity: ItemRarity.LEGENDARY,
        priceSOL: 0,
        priceStarFragments: 0,
        inStock: true,
        tab: 'deals',
        subcategory: 'Shards',
        currency: 'starFragments',
        status: 'asset-pending',
        image: ShopItems.promoPack,
        summary: '10,000 fragments — free!',
    },
    {
        id: 'daily-spin',
        name: 'Daily Spin',
        description: 'A free pull on the Moonoko wheel — once every 24h',
        imageUrl: '',
        category: ItemCategory.UTILITY,
        rarity: ItemRarity.UNCOMMON,
        priceSOL: 0,
        priceStarFragments: 0,
        inStock: true,
        tab: 'deals',
        subcategory: 'Daily Spin',
        currency: 'starFragments',
        status: 'asset-pending',
        image: ShopItems.moonokoBall,
        durationLabel: '24h cooldown',
        summary: 'Free pull on the Moonoko wheel',
    },
    {
        id: 'upgrade-carry',
        name: 'Carry Capacity',
        description: 'Moonoko carries +5 more ingredients when foraging',
        imageUrl: '',
        category: ItemCategory.UTILITY,
        rarity: ItemRarity.RARE,
        priceSOL: 0,
        priceStarFragments: 750,
        inStock: true,
        tab: 'deals',
        subcategory: 'Upgrades',
        currency: 'starFragments',
        status: 'available',
        image: ShopItems.carryCapacity,
        summary: '+5 forage slots',
    },
    {
        id: 'upgrade-inventory',
        name: 'Inventory Size',
        description: 'Larger ingredient inventory cap',
        imageUrl: '',
        category: ItemCategory.UTILITY,
        rarity: ItemRarity.RARE,
        priceSOL: 0,
        priceStarFragments: 750,
        inStock: true,
        tab: 'deals',
        subcategory: 'Upgrades',
        currency: 'starFragments',
        status: 'available',
        image: ShopItems.potSize,
        summary: '+50 pantry slots',
    },
];

const consumablesItems: ShopItem[] = [
    {
        id: 'box-ingredients-common',
        name: 'Ingredient Box · Common',
        description: 'A box of 5 random common-tier ingredients',
        imageUrl: '',
        category: ItemCategory.INGREDIENT,
        rarity: ItemRarity.COMMON,
        priceSOL: 0,
        priceStarFragments: 30,
        inStock: true,
        tab: 'consumables',
        subcategory: 'Ingredient Boxes',
        currency: 'starFragments',
        status: 'available',
        image: ShopItems.boxIngredientsCommon,
        summary: '5 random common',
    },
    {
        id: 'box-ingredients-uncommon',
        name: 'Ingredient Box · Uncommon',
        description: 'A box of 5 random uncommon-tier ingredients',
        imageUrl: '',
        category: ItemCategory.INGREDIENT,
        rarity: ItemRarity.UNCOMMON,
        priceSOL: 0,
        priceStarFragments: 60,
        inStock: true,
        tab: 'consumables',
        subcategory: 'Ingredient Boxes',
        currency: 'starFragments',
        status: 'available',
        image: ShopItems.boxIngredientsUncommon,
        summary: '5 random uncommon',
    },
    {
        id: 'box-ingredients-rare',
        name: 'Ingredient Box · Rare',
        description: 'A box of 3 random rare-tier ingredients',
        imageUrl: '',
        category: ItemCategory.INGREDIENT,
        rarity: ItemRarity.RARE,
        priceSOL: 0,
        priceStarFragments: 65,
        inStock: true,
        tab: 'consumables',
        subcategory: 'Ingredient Boxes',
        currency: 'starFragments',
        status: 'available',
        image: ShopItems.boxIngredientsRare,
        summary: '3 random rare',
    },
    {
        id: 'moonoko-spin',
        name: 'Moonoko Spin',
        description: 'A pull on the Moonoko gacha',
        imageUrl: '',
        category: ItemCategory.UTILITY,
        rarity: ItemRarity.RARE,
        priceSOL: 0,
        priceStarFragments: 200,
        inStock: true,
        tab: 'consumables',
        subcategory: 'Gacha',
        currency: 'starFragments',
        status: 'effect-pending',
        image: ShopItems.moonokoBall,
        summary: 'Roll for a new Moonoko',
    },
    {
        id: 'booster-mood',
        name: 'Mood Booster',
        description: 'Instantly +2 mood',
        imageUrl: '',
        category: ItemCategory.POWERUP,
        rarity: ItemRarity.UNCOMMON,
        priceSOL: 0,
        priceStarFragments: 40,
        inStock: true,
        tab: 'consumables',
        subcategory: 'Boosters',
        currency: 'starFragments',
        status: 'available',
        image: ShopItems.starberry,
    },
    {
        id: 'booster-sleep',
        name: 'Sleep Booster',
        description: 'Instantly +2 energy',
        imageUrl: '',
        category: ItemCategory.POWERUP,
        rarity: ItemRarity.UNCOMMON,
        priceSOL: 0,
        priceStarFragments: 40,
        inStock: true,
        tab: 'consumables',
        subcategory: 'Boosters',
        currency: 'starFragments',
        status: 'available',
        image: ShopItems.snoozeSeed,
    },
    {
        id: 'booster-hunger',
        name: 'Hunger Booster',
        description: 'Instantly +2 hunger',
        imageUrl: '',
        category: ItemCategory.POWERUP,
        rarity: ItemRarity.UNCOMMON,
        priceSOL: 0,
        priceStarFragments: 40,
        inStock: true,
        tab: 'consumables',
        subcategory: 'Boosters',
        currency: 'starFragments',
        status: 'available',
        image: STUB_IMAGE,
    },
    {
        id: 'sleeping-camp',
        name: 'Sleeping Camp',
        description: 'Moonoko forages 20% faster and carries 50% more · 1 week',
        imageUrl: '',
        category: ItemCategory.UTILITY,
        rarity: ItemRarity.EPIC,
        priceSOL: 0,
        priceStarFragments: 1500,
        inStock: true,
        tab: 'consumables',
        subcategory: 'Camps',
        currency: 'starFragments',
        status: 'available',
        image: ShopItems.satelliteDish,
        durationLabel: '1 week',
        summary: '+50% carry · +20% forage speed',
    },
];

const accessoriesItems: ShopItem[] = [
    {
        id: 'casing-default',
        name: 'Casing',
        description: 'A device casing for your Hoshino',
        imageUrl: '',
        category: ItemCategory.COSMETIC,
        rarity: ItemRarity.UNCOMMON,
        priceSOL: 0,
        priceStarFragments: 300,
        inStock: true,
        tab: 'accessories',
        subcategory: 'Casings',
        currency: 'starFragments',
        status: 'effect-pending',
        image: STUB_IMAGE,
    },
    {
        id: 'sticker-pack-1',
        name: 'Sticker Pack',
        description: 'A pack of decorative stickers',
        imageUrl: '',
        category: ItemCategory.COSMETIC,
        rarity: ItemRarity.COMMON,
        priceSOL: 0,
        priceStarFragments: 100,
        inStock: true,
        tab: 'accessories',
        subcategory: 'Stickers',
        currency: 'starFragments',
        status: 'effect-pending',
        image: STUB_IMAGE,
    },
    {
        id: 'furniture-placemat',
        name: 'Placemat',
        description: 'A placemat for your room',
        imageUrl: '',
        category: ItemCategory.COSMETIC,
        rarity: ItemRarity.COMMON,
        priceSOL: 0,
        priceStarFragments: 120,
        inStock: true,
        tab: 'accessories',
        subcategory: 'Furniture',
        currency: 'starFragments',
        status: 'effect-pending',
        image: Ingredients.pinkSugar,
    },
];

export const SHOP_CATALOG: ShopItem[] = [
    ...dealsItems,
    ...consumablesItems,
    ...accessoriesItems,
];

export const SHOP_TABS: { id: ShopTab; label: string }[] = [
    { id: 'deals', label: 'Deals' },
    { id: 'consumables', label: 'Consumables' },
    { id: 'accessories', label: 'Accessories' },
];

export function itemsForTab(tab: ShopTab): ShopItem[] {
    return SHOP_CATALOG.filter((item) => item.tab === tab);
}

export function groupBySubcategory(items: ShopItem[]): { subcategory: string; items: ShopItem[] }[] {
    const order: string[] = [];
    const map = new Map<string, ShopItem[]>();
    for (const item of items) {
        if (!map.has(item.subcategory)) {
            map.set(item.subcategory, []);
            order.push(item.subcategory);
        }
        map.get(item.subcategory)!.push(item);
    }
    return order.map((subcategory) => ({ subcategory, items: map.get(subcategory)! }));
}
