// Recipes are permanent knowledge; each cooked portion keeps its own level.
export const RECIPES = {
  bakedPotato: { name: '炭烤地瓜', style: 'roast', ingredients: { sweetPotato: 1 }, satiety: [42, 52, 62], price: 0 },
  grilledCorn: { name: '香烤玉米', style: 'corn', ingredients: { corn: 1 }, satiety: [40, 50, 60], price: 0 },
  gardenSoup: { name: '田园浓汤', style: 'soup', ingredients: { tomato: 1, pumpkin: 1 }, satiety: [72, 84, 96], price: 15 },
  fruitSalad: { name: '海岛果蔬沙拉', style: 'salad', ingredients: { pineapple: 1, tomato: 1 }, satiety: [70, 82, 94], price: 15 },
  crabStew: { name: '沙蟹玉米煲', style: 'crab', ingredients: { crab: 1, corn: 1 }, satiety: [82, 91, 100], price: 25 },
  reefGrill: { name: '香煎珊瑚鱼', style: 'fish', ingredients: { reefFish: 1 }, satiety: [58, 72, 86], price: 25 },
  lobsterPot: { name: '鲜虾南瓜锅', style: 'lobster', ingredients: { lobster: 1, pumpkin: 1 }, satiety: [86, 93, 100], price: 40 },
  jackPlatter: { name: '银鲹田园拼盘', style: 'platter', ingredients: { silverJack: 1, tomato: 1 }, satiety: [88, 94, 100], price: 40 },
};
export const DISHES = Object.fromEntries(Object.entries(RECIPES).flatMap(([recipeId, recipe]) =>
  recipe.satiety.map((satiety, index) => [`meal_${recipeId}_${index + 1}`, {
    recipeId, name: recipe.name, style: recipe.style, level: index + 1, satiety,
  }])));
const count = (value) => Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
export function normalizeCooking(value) {
  return Object.fromEntries(Object.entries(RECIPES).map(([id, recipe]) => [id, {
    level: Math.max(recipe.price === 0 ? 1 : 0, Math.min(3, count(value?.[id]?.level))),
    cooked: Math.min(1000000, count(value?.[id]?.cooked)),
  }]));
}
export function recipeQuote(state, id) {
  const recipe = RECIPES[id];
  if (!recipe) return { ok: false, reason: 'invalid-recipe' };
  const knowledge = state.cooking?.[id] || { level: recipe.price === 0 ? 1 : 0, cooked: 0 };
  const level = knowledge.level;
  const ingredients = Object.entries(recipe.ingredients).map(([itemId, quantity]) => ({
    itemId, quantity, owned: state.inventory[itemId] || 0,
  }));
  const result = { recipe, level, cooked: knowledge.cooked, ingredients,
    itemId: `meal_${id}_${level || 1}`, satiety: recipe.satiety[Math.max(0, level - 1)],
    nextSatiety: level < 3 ? recipe.satiety[level] : null,
    upgradeCost: level === 1 ? 15 : 30, requiredCooks: level === 1 ? 3 : 8 };
  if (!level) return { ...result, ok: false, reason: 'locked' };
  if (ingredients.some((entry) => entry.owned < entry.quantity)) return { ...result, ok: false, reason: 'ingredients' };
  const used = Object.values(state.inventory).reduce((sum, n) => sum + n, 0);
  if (used - ingredients.reduce((sum, entry) => sum + entry.quantity, 0) + 1 > state.backpackCapacity)
    return { ...result, ok: false, reason: 'capacity' };
  return { ...result, ok: true };
}
export function learnRecipe(state, id) {
  const recipe = RECIPES[id];
  if (!recipe) return { ok: false, reason: 'invalid-recipe' };
  if (state.cooking[id].level) return { ok: false, reason: 'known' };
  if (state.gold < recipe.price) return { ok: false, reason: 'gold' };
  state.gold -= recipe.price;
  state.cooking[id].level = 1;
  return { ok: true, level: 1 };
}
export function upgradeRecipe(state, id) {
  const quote = recipeQuote(state, id);
  if (!quote.recipe) return quote;
  if (!quote.level) return { ok: false, reason: 'locked' };
  if (quote.level === 3) return { ok: false, reason: 'max-level' };
  if (quote.cooked < quote.requiredCooks) return { ok: false, reason: 'practice' };
  if (state.gold < quote.upgradeCost) return { ok: false, reason: 'gold' };
  state.gold -= quote.upgradeCost;
  state.cooking[id].level++;
  return { ok: true, level: state.cooking[id].level, satiety: quote.nextSatiety };
}
export function prepareDish(state, id) {
  const quote = recipeQuote(state, id);
  if (!quote.ok) return quote;
  for (const { itemId, quantity } of quote.ingredients) {
    state.inventory[itemId] -= quantity;
    if (!state.inventory[itemId]) delete state.inventory[itemId];
  }
  state.inventory[quote.itemId] = (state.inventory[quote.itemId] || 0) + 1;
  state.cooking[id].cooked++;
  return { ok: true, itemId: quote.itemId, dish: DISHES[quote.itemId] };
}
export function edibleDishCount(state) {
  return Object.keys(DISHES).reduce((sum, id) => sum + (state.inventory[id] || 0), 0);
}
