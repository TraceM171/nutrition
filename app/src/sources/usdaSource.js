export async function searchUSDA(query, apiKey) {
  const url = `https://api.nal.usda.gov/fdc/v1/foods/search?query=${encodeURIComponent(query)}&dataType=SR%20Legacy,Foundation,Branded&pageSize=20&api_key=${apiKey}`;
  const r = await fetch(url);
  if (!r.ok) throw new Error('Search failed');
  return r.json();
}

export async function fetchFoodDetails(fdcId, apiKey) {
  const url = `https://api.nal.usda.gov/fdc/v1/food/${fdcId}?api_key=${apiKey}`;
  const r = await fetch(url);
  if (!r.ok) throw new Error('Fetch failed');
  return r.json();
}

export function extractNutrients(foodData) {
  const out = {};
  const nutrients = foodData.foodNutrients || [];
  nutrients.forEach(n => {
    const name = n.nutrient?.name || n.name;
    const unit = (n.nutrient?.unitName || '').toUpperCase();
    const val = n.amount ?? n.value ?? 0;
    if (!name) return;
    if (name === 'Energy' && unit === 'KJ') return;
    out[name] = val;
  });
  return out;
}

export function extractMeasuresUSDA(foodData) {
  const ssu = (foodData.servingSizeUnit || '').toLowerCase();
  const isLiquid = ssu === 'ml' || ssu === 'milliliter' || ssu === 'milliliters';
  const measures = isLiquid
    ? [{ label: 'ml', factor: 1 }, { label: 'g', factor: 1 }]
    : [{ label: 'g', factor: 1 }];
  const seen = new Set(['g', 'ml']);
  (foodData.foodMeasures || []).forEach(m => {
    const label = m.disseminationText;
    const grams = m.gramWeight;
    if (label && grams > 0 && !seen.has(label)) {
      seen.add(label);
      measures.push({ label, factor: grams });
    }
  });
  (foodData.foodPortions || []).forEach(p => {
    const label = p.modifier;
    const grams = p.gramWeight;
    const amount = p.amount || 1;
    if (label && grams > 0 && !seen.has(label)) {
      seen.add(label);
      measures.push({ label, factor: grams / amount });
    }
  });
  return measures;
}
