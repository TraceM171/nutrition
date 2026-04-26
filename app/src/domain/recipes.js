// Pure domain functions — no globals, no DOM, no fetch.
// All functions take an explicit `recipes` map to avoid global coupling.

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

export function getRecipeNutrientsPer100g(recipe, recipes, visited = new Set()) {
  if (visited.has(recipe.id)) return {};
  visited.add(recipe.id);
  const totalG = getRecipeWeightG(recipe, recipes);
  if (!totalG) return {};
  const sums = {};
  recipe.ingredients.forEach(ing => {
    let n;
    if (ing.type === 'recipe') {
      const sub = recipes[ing.recipeId];
      if (!sub) return;
      n = getRecipeNutrientsPer100g(sub, recipes, new Set(visited));
      const amtG = effectiveAmountG(ing, recipes);
      for (const k of Object.keys(n))
        sums[k] = (sums[k] || 0) + (n[k] * amtG) / 100;
    } else if (ing.servingMode) {
      n = ing.nutrients || {};
      const qty = ing.qty || 1;
      for (const k of Object.keys(n))
        sums[k] = (sums[k] || 0) + n[k] * qty;
    } else {
      n = ing.nutrients || {};
      const amtG = effectiveAmountG(ing, recipes);
      for (const k of Object.keys(n))
        sums[k] = (sums[k] || 0) + (n[k] * amtG) / 100;
    }
  });
  const per100g = {};
  for (const k of Object.keys(sums)) per100g[k] = (sums[k] / totalG) * 100;
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
