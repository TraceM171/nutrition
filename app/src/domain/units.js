// Pure domain functions — no DOM, no fetch, no localStorage.

// Resolves a food's nutrientBasis to its gram equivalent.
// Named derived units (e.g. 'cup') are looked up in food.measures for their factor.
// Returns null for serving-mode foods (no gram equivalent).
export function resolveBasisG(foodEntry) {
  const nb = foodEntry?.nutrientBasis;
  if (!nb || !(nb.qty > 0)) return 100;
  const { qty, unit } = nb;
  if (!unit || unit === 'g') return qty;
  if (unit === 'serving') return null;
  const m = foodEntry.measures?.find(me => me.label === unit);
  return qty * (m ? m.factor : 1);
}
