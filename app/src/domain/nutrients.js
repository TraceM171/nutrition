// Pure domain functions — no globals, no DOM, no fetch.
import { effectiveAmountG, getRecipeNutrientsPer100g } from './recipes.js';
import { resolveBasisG } from './units.js';

export function getDisplayName(fdcId, foods, aliases) {
  return aliases?.[fdcId] ?? foods?.[fdcId]?.name ?? fdcId;
}

export function resolveForkedNutrients(ci, foods, forkBasisG = null) {
  const backedFood = foods[ci.backedByFdcId];
  const base = backedFood?.nutrients ?? {};
  const backedBasisG = resolveBasisG(backedFood);  // null for serving-based
  if (forkBasisG === null) {
    forkBasisG = resolveBasisG({
      nutrientBasis: ci.nutrientBasis,
      measures: foods['custom_' + ci.id]?.measures,
    });
  }
  // Scale only when both bases are gram-resolvable and differ.
  const scale = (backedBasisG && forkBasisG && backedBasisG !== forkBasisG)
    ? forkBasisG / backedBasisG
    : 1;
  const scaledBase = scale === 1
    ? base
    : Object.fromEntries(Object.entries(base).map(([k, v]) => [k, v * scale]));
  return { ...scaledBase, ...(ci.nutrientOverrides || {}) };
}

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

// Net carbs = total carbs − fiber − sugar alcohols (per-100g nutrient map).
// Assumes all three nutrients share the same basis — valid because the schema stores
// one nutrientBasis per food and getRecipeNutrientsPer100g always outputs per-100g.
export function netCarbsFromMap(n) {
  return Math.max(0,
    findNutrientVal(n, 'carbohydrate') -
    findNutrientVal(n, 'fiber') -
    findNutrientVal(n, 'sugar alcohol')
  );
}

// `foods` registry (FoodId → Food) optional; falls back to ing.nutrients for v2 data.
export function getNutrientVal(ingredient, key, foods) {
  const n = ingredient.nutrients || foods?.[ingredient.fdcId]?.nutrients || {};
  const foodEntry = foods?.[ingredient.fdcId];
  const isServing = foodEntry?.nutrientBasis?.unit === 'serving';
  const servings = isServing ? (ingredient.qty || 1) : 0;
  const basisQty = isServing ? 1 : (resolveBasisG(foodEntry) ?? 100);
  const lk = key.toLowerCase();
  let firstMatch = null;
  for (const k of Object.keys(n)) {
    if (k.toLowerCase().includes(lk)) {
      if (firstMatch === null) firstMatch = n[k];
      if (n[k] !== 0) return isServing ? n[k] * servings : (n[k] * ingredient.amountG) / basisQty;
    }
  }
  if (firstMatch !== null) return isServing ? firstMatch * servings : (firstMatch * ingredient.amountG) / basisQty;
  return 0;
}

export function getIngredientNutrient(ingredient, targetKey, recipes, foods) {
  if (targetKey === 'Carbohydrate') {
    if (ingredient.type === 'recipe') {
      const r = recipes[ingredient.recipeId];
      if (!r) return 0;
      return netCarbsFromMap(getRecipeNutrientsPer100g(r, recipes, foods)) * effectiveAmountG(ingredient, recipes) / 100;
    }
    return Math.max(0,
      getNutrientVal(ingredient, 'Carbohydrate', foods) -
      getNutrientVal(ingredient, 'Fiber', foods) -
      getNutrientVal(ingredient, 'sugar alcohol', foods)
    );
  }
  if (ingredient.type === 'recipe') {
    const r = recipes[ingredient.recipeId];
    if (!r) return 0;
    const n = getRecipeNutrientsPer100g(r, recipes, foods);
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
  return getNutrientVal(ingredient, targetKey, foods);
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

// Returns the per-100g nutrient map for any ingredient type (P11: dispatch on type).
export function getIngNutrientMap(ing, recipes, foods) {
  if (ing.type === 'recipe') {
    const r = recipes[ing.recipeId];
    return r ? getRecipeNutrientsPer100g(r, recipes, foods) : {};
  }
  return ing.nutrients || foods?.[ing.fdcId]?.nutrients || {};
}
