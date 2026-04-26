// Pure domain functions — no globals, no DOM, no fetch.
import { effectiveAmountG, getRecipeNutrientsPer100g } from './recipes.js';

export function findNutrientVal(n, partialKey) {
  const lk = partialKey.toLowerCase();
  let firstMatch = null;
  for (const k of Object.keys(n)) {
    if (k.toLowerCase().includes(lk)) {
      if (firstMatch === null) firstMatch = n[k];
      if (n[k] !== 0) return n[k];
    }
  }
  return firstMatch ?? 0;
}

// Net carbs = total carbs − fiber − sugar alcohols (per-100g nutrient map)
export function netCarbsFromMap(n) {
  return Math.max(0,
    findNutrientVal(n, 'carbohydrate') -
    findNutrientVal(n, 'fiber') -
    findNutrientVal(n, 'sugar alcohol')
  );
}

export function getNutrientVal(ingredient, key) {
  const n = ingredient.nutrients || {};
  const lk = key.toLowerCase();
  const isServing = ingredient.servingMode;
  const servings = isServing ? (ingredient.qty || 1) : 0;
  let firstMatch = null;
  for (const k of Object.keys(n)) {
    if (k.toLowerCase().includes(lk)) {
      if (firstMatch === null) firstMatch = n[k];
      if (n[k] !== 0) return isServing ? n[k] * servings : (n[k] * ingredient.amountG) / 100;
    }
  }
  if (firstMatch !== null) return isServing ? firstMatch * servings : (firstMatch * ingredient.amountG) / 100;
  return 0;
}

export function getIngredientNutrient(ingredient, targetKey, recipes) {
  if (targetKey === 'Carbohydrate') {
    if (ingredient.type === 'recipe') {
      const r = recipes[ingredient.recipeId];
      if (!r) return 0;
      return netCarbsFromMap(getRecipeNutrientsPer100g(r, recipes)) * effectiveAmountG(ingredient, recipes) / 100;
    }
    return Math.max(0,
      getNutrientVal(ingredient, 'Carbohydrate') -
      getNutrientVal(ingredient, 'Fiber') -
      getNutrientVal(ingredient, 'sugar alcohol')
    );
  }
  if (ingredient.type === 'recipe') {
    const r = recipes[ingredient.recipeId];
    if (!r) return 0;
    const n = getRecipeNutrientsPer100g(r, recipes);
    const lk = targetKey.toLowerCase();
    let firstMatch = null;
    for (const k of Object.keys(n)) {
      if (k.toLowerCase().includes(lk)) {
        if (firstMatch === null) firstMatch = n[k];
        if (n[k] !== 0) return (n[k] * effectiveAmountG(ingredient, recipes)) / 100;
      }
    }
    return firstMatch !== null ? (firstMatch * effectiveAmountG(ingredient, recipes)) / 100 : 0;
  }
  return getNutrientVal(ingredient, targetKey);
}

export function fmt(val, unit) {
  if (!val && val !== 0) return '—';
  if (unit === 'kcal' || unit === 'IU') return Math.round(val).toLocaleString() + ' ' + unit;
  if (Math.abs(val) < 10) return val.toFixed(1) + ' ' + unit;
  return Math.round(val) + ' ' + unit;
}

export function getPct(key, val, targets) {
  const t = targets[key];
  if (!t) return 0;
  const ref = t.val || t.max;
  if (!ref) return 0;
  return Math.round((val / ref) * 100);
}

export function getStatus(key, val, targets, macroKeys) {
  const t = targets[key];
  if (!t) return 'ok';
  if (macroKeys.includes(key)) {
    const pct = val / t.val * 100;
    if (pct < 90) return 'low';
    if (pct <= 110) return 'ok';
    return 'high';
  }
  if (t.max && val > t.max) return 'high';
  if (t.val > 0 && val < t.val) return 'low';
  return 'ok';
}
