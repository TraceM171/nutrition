export function searchCustom(query, customIngredients) {
  const q = query.toLowerCase();
  return Object.values(customIngredients).filter(c => c.name.toLowerCase().includes(q));
}
