// Pure domain functions — no globals, no DOM, no fetch.
// All functions take an explicit `recipes` map to avoid global coupling.
// `foods` registry (FoodId → Food) is optional; when absent, falls back to ing.nutrients.
import { resolveBasisG } from './units.js';

export function effectiveAmountG(ing, recipes) {
  if (ing.type === 'recipe' && ing.unit === 'serving' && (ing.qty || 0) > 0) {
    const r = recipes[ing.recipeId];
    if (r && r.yields > 0) return ing.qty * getRecipeWeightG(r, recipes) / r.yields;
  }
  return ing.amountG || 0;
}

export function getRecipeWeightG(recipe, recipes) {
  return recipe.ingredients.reduce((s, i) => s + effectiveAmountG(i, recipes), 0);
}

// Memoization: keyed on recipe.id × _memoVersion.
// Call invalidateRecipeMemo() whenever state changes (e.g., in a store subscriber).
let _memoVersion = 0;
const _memoCache = new Map(); // recipeId → { version, result }

export function invalidateRecipeMemo() {
  _memoVersion++;
}

export function getRecipeNutrientsPer100g(recipe, recipes, foods, visited = new Set()) {
  if (visited.has(recipe.id)) return {};

  const cached = _memoCache.get(recipe.id);
  if (cached && cached.version === _memoVersion) return cached.result;

  visited.add(recipe.id);
  const totalG = getRecipeWeightG(recipe, recipes);
  if (!totalG) {
    _memoCache.set(recipe.id, { version: _memoVersion, result: {} });
    return {};
  }
  const sums = {};
  recipe.ingredients.forEach(ing => {
    let n;
    if (ing.type === 'recipe') {
      const sub = recipes[ing.recipeId];
      if (!sub) return;
      n = getRecipeNutrientsPer100g(sub, recipes, foods, new Set(visited));
      const amtG = effectiveAmountG(ing, recipes);
      for (const k of Object.keys(n))
        sums[k] = (sums[k] || 0) + (n[k] * amtG) / 100;
    } else {
      const foodEntry = foods?.[ing.fdcId];
      n = foodEntry?.nutrients || ing.nutrients || {};
      if (foodEntry?.nutrientBasis?.unit === 'serving') {
        const qty = ing.qty || 1;
        for (const k of Object.keys(n))
          sums[k] = (sums[k] || 0) + n[k] * qty;
      } else {
        const amtG = effectiveAmountG(ing, recipes);
        const basisQty = resolveBasisG(foodEntry) ?? 100;
        for (const k of Object.keys(n))
          sums[k] = (sums[k] || 0) + (n[k] * amtG) / basisQty;
      }
    }
  });
  const per100g = {};
  for (const k of Object.keys(sums)) per100g[k] = (sums[k] / totalG) * 100;

  _memoCache.set(recipe.id, { version: _memoVersion, result: per100g });
  return per100g;
}

export function wouldCreateCycle(parentId, candidateId, recipes, visited = new Set()) {
  if (candidateId === parentId) return true;
  if (visited.has(candidateId)) return false;
  visited.add(candidateId);
  const r = recipes[candidateId];
  if (!r) return false;
  return r.ingredients.some(i =>
    i.type === 'recipe' && wouldCreateCycle(parentId, i.recipeId, recipes, visited)
  );
}
