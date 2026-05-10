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

// Legacy exact-match — only used by tests / older clients. Prefer
// `matchRecipeFromCounts` which honours the "min ingredients, more = bonus"
// rule introduced when pot capacity was made upgradeable.
function matchRecipe(ingredients) {
  return RECIPE_BY_KEY.get(ingredientKey(ingredients)) || null;
}

function countMultiset(ingredients) {
  const m = {};
  for (const ing of ingredients) {
    m[ing] = (m[ing] || 0) + 1;
  }
  return m;
}

// Min-multiset matcher. A pot matches a recipe when:
//   - every ingredient in the recipe's signature appears in the pot at >= the
//     recipe's count (the recipe defines the *minimum*), AND
//   - no ingredient appears in the pot that isn't in the recipe (extras of an
//     unrelated ingredient still mean slop).
//
// `pot` is either an array of ingredient ids or a counts dict.
function matchRecipeFromCounts(pot) {
  const counts = Array.isArray(pot) ? countMultiset(pot) : pot;
  for (const recipe of RECIPES) {
    const min = countMultiset(recipe.ingredients);
    let allowed = true;
    for (const [ing, n] of Object.entries(counts)) {
      if (!(ing in min) || n < (min[ing] || 0)) {
        // Either an extra ingredient or below-min on a recipe ingredient.
        if (!(ing in min)) {
          allowed = false;
          break;
        }
      }
    }
    if (!allowed) continue;
    let meetsMin = true;
    for (const [ing, n] of Object.entries(min)) {
      if ((counts[ing] || 0) < n) {
        meetsMin = false;
        break;
      }
    }
    if (!meetsMin) continue;
    // Also ensure no extras outside recipe ingredients.
    let hasExtras = false;
    for (const ing of Object.keys(counts)) {
      if (!(ing in min)) {
        hasExtras = true;
        break;
      }
    }
    if (hasExtras) continue;
    return recipe;
  }
  return null;
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

// Reward shape for a successful recipe cook. basePoints is the "clean" recipe
// score — the cook() handler multiplies it by per-recipe level bonus and the
// mood/hunger modifiers to arrive at player XP. Intentionally simple for v1 —
// creative can tune per-recipe values later.
//
// `usedCount` is the total ingredient count the player actually committed to
// the pot (>= recipe minimum). Extra ingredients past the recipe minimum
// scale all three reward components, capped to keep maxed-pot cooks from
// trivially outpacing the recipe-tier ordering.
function recipeRewards(recipe, usedCount) {
  const minCount = recipe.ingredients.length;
  const used = Math.max(minCount, usedCount || minCount);
  const extras = used - minCount;
  // +15% per extra ingredient, capped at +120% (i.e. ~8 extras).
  const bulk = Math.min(2.2, 1 + 0.15 * extras);
  const points = recipeTierPoints(recipe);
  return {
    hungerBoost: Math.min(
      5,
      Math.max(1, Math.ceil((minCount * bulk) / 2)),
    ),
    moodBoost: extras > 0 ? 2 : 1,
    basePoints: Math.round(points * 10 * bulk),
    bulk,
  };
}

// Reward shape when the ingredient multiset doesn't match any recipe — still
// edible, still grants a hunger tick, trivial points.
const SLOP_REWARD = Object.freeze({
  hungerBoost: 1,
  moodBoost: 0,
  basePoints: 3,
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
  countMultiset,
  matchRecipe,
  matchRecipeFromCounts,
  getRecipeById,
  recipeTierPoints,
  recipeRewards,
  isKnownIngredient,
};
