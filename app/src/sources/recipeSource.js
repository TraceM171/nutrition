export function searchRecipes(query, recipes) {
  const q = query.toLowerCase();
  return Object.values(recipes).filter(r => r.name.toLowerCase().includes(q));
}
