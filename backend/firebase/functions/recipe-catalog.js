// Authoritative recipe catalog for server-side match + xp reward.
//
// Twin of src/services/RecipeCatalog.ts — both must stay in sync. The server
// is authoritative: the client may compute `matchRecipe` locally for UI hints,
// but every cook() call is re-matched here before any inventory deduction or
// discovery write.

const INGREDIENT_TIER = {
  // common
  egg: 'common',
  lettuce: 'common',
  potato: 'common',
  rice: 'common',
  carrot: 'common',
  // uncommon
  banana: 'uncommon',
  strawberry: 'uncommon',
  tomato: 'uncommon',
  tofu: 'uncommon',
  oat: 'uncommon',
  bread: 'uncommon',
  // rare
  bacon: 'rare',
  milk: 'rare',
  tuna: 'rare',
  gouda: 'rare',
  // ultra rare
  star_dust: 'ultra_rare',
};

const TIER_POINTS = { common: 1, uncommon: 2, rare: 3, ultra_rare: 5 };

const RECIPES = [
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
  { id: 'babana_bred', name: 'Babana Bred', ingredients: ['banana', 'egg', 'milk', 'oat'] },
  { id: 'hoshi_boba', name: 'Hoshi Boba', ingredients: ['banana', 'milk', 'rice', 'strawberry'] },
  { id: 'burdger', name: 'Burdger', ingredients: ['bacon', 'bread', 'lettuce', 'tomato'] },
  { id: 'dont_ask', name: "Don't Ask..", ingredients: ['bacon', 'star_dust', 'tuna'] },
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

// Sorted-join key for multiset matching. Order doesn't matter; duplicates do.
function ingredientKey(ingredients) {
  return [...ingredients].sort().join('|');
}

const RECIPE_BY_KEY = new Map(RECIPES.map((r) => [ingredientKey(r.ingredients), r]));
const RECIPE_BY_ID = new Map(RECIPES.map((r) => [r.id, r]));

function matchRecipe(ingredients) {
  return RECIPE_BY_KEY.get(ingredientKey(ingredients)) || null;
}

function getRecipeById(id) {
  return RECIPE_BY_ID.get(id) || null;
}

// Sum of constituent tier points — used as both a "how complex is this" signal
// and the xp scaling factor for a successful cook.
function recipeTierPoints(recipe) {
  return recipe.ingredients.reduce((sum, ing) => {
    const tier = INGREDIENT_TIER[ing];
    return sum + (tier ? TIER_POINTS[tier] : 0);
  }, 0);
}

// Reward shape for a successful recipe cook. Intentionally simple for v1 —
// creative can tune per-recipe values later.
function recipeRewards(recipe) {
  const points = recipeTierPoints(recipe);
  return {
    hungerBoost: Math.min(3, Math.max(1, Math.ceil(recipe.ingredients.length / 2))),
    moodBoost: 1,
    xp: points * 10, // 2 commons → 20 xp, ultra-rare combos → 100+
  };
}

// Reward shape when the ingredient multiset doesn't match any recipe — still
// edible, still grants a hunger tick, trivial xp.
const SLOP_REWARD = Object.freeze({
  hungerBoost: 1,
  moodBoost: 0,
  xp: 3,
});

function isKnownIngredient(id) {
  return Object.prototype.hasOwnProperty.call(INGREDIENT_TIER, id);
}

module.exports = {
  RECIPES,
  INGREDIENT_TIER,
  TIER_POINTS,
  SLOP_REWARD,
  ingredientKey,
  matchRecipe,
  getRecipeById,
  recipeTierPoints,
  recipeRewards,
  isKnownIngredient,
};
