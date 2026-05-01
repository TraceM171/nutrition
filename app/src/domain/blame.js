// Pure domain functions — no globals, no DOM, no fetch.
import { getNutrientVal, getIngredientNutrient, getDisplayName } from './nutrients.js';
import { effectiveAmountG, getRecipeWeightG } from './recipes.js';

export function buildBlameNode(ing, nutrientKey, scaleFactor, recipes, foods, aliases) {
  if (scaleFactor === undefined) scaleFactor = 1;
  if (ing.type === 'food') {
    const base = getNutrientVal(ing, nutrientKey, foods);
    return { name: getDisplayName(ing.fdcId, foods, aliases) || ing.name, isRecipe: false, value: base * scaleFactor, children: null };
  }
  if (ing.type === 'recipe') {
    const r = recipes[ing.recipeId];
    if (!r) return { name: ing.name, isRecipe: true, value: 0, children: null };
    const baseAmtG = effectiveAmountG(ing, recipes);
    const recipeWeightG = getRecipeWeightG(r, recipes);
    const fraction = recipeWeightG > 0 ? baseAmtG / recipeWeightG : 0;
    const base = getIngredientNutrient(ing, nutrientKey, recipes, foods);
    const children = r.ingredients
      .map(sub => buildBlameNode(sub, nutrientKey, fraction * scaleFactor, recipes, foods, aliases))
      .filter(n => n.value > 0.0005)
      .sort((a, b) => b.value - a.value);
    return { name: ing.name, isRecipe: true, value: base * scaleFactor, children: children.length ? children : null };
  }
  return { name: '?', isRecipe: false, value: 0, children: null };
}

export function getDayBlameTree(day, nutrientKey, plan, meals, recipes, foods, aliases) {
  const mealNodes = [];
  meals.forEach(meal => {
    const ings = plan[day][meal] || [];
    if (!ings.length) return;
    const items = ings
      .map(ing => buildBlameNode(ing, nutrientKey, 1, recipes, foods, aliases))
      .filter(n => n.value > 0.0005)
      .sort((a, b) => b.value - a.value);
    const mealTotal = items.reduce((s, n) => s + n.value, 0);
    if (mealTotal > 0.0005) mealNodes.push({ name: meal, isMeal: true, value: mealTotal, children: items });
  });
  return mealNodes.sort((a, b) => b.value - a.value);
}

export function getWeeklyBlameTree(nutrientKey, plan, days, meals, recipes, foods, extraFoods = [], aliases) {
  const filledDays = days.filter(d => meals.some(m => (plan[d][m] || []).length > 0));
  const dayNodes = [];
  filledDays.forEach(day => {
    const mealNodes = getDayBlameTree(day, nutrientKey, plan, meals, recipes, foods, aliases);
    const dayTotal = mealNodes.reduce((s, m) => s + m.value, 0);
    if (dayTotal > 0.0005) {
      dayNodes.push({ name: day, isMeal: true, value: dayTotal, children: mealNodes.length ? mealNodes : null });
    }
  });
  if (extraFoods.length) {
    const items = extraFoods
      .map(ing => buildBlameNode(ing, nutrientKey, 1 / 7, recipes, foods, aliases))
      .filter(n => n.value > 0.0005)
      .sort((a, b) => b.value - a.value);
    const extraTotal = items.reduce((s, n) => s + n.value, 0);
    if (extraTotal > 0.0005) {
      dayNodes.push({ name: 'Extra Foods (÷7)', isMeal: true, value: extraTotal, children: items.length ? items : null });
    }
  }
  return dayNodes.sort((a, b) => b.value - a.value);
}
