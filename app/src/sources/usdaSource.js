async function fetchWithRetry(url, maxRetries = 3) {
  let delay = 1000;
  let lastErr;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const r = await fetch(url);
      if (r.status !== 503 && r.status !== 429) return r;
      lastErr = new Error(`HTTP ${r.status}`);
    } catch (e) {
      lastErr = e;
    }
    if (attempt < maxRetries) await new Promise(res => setTimeout(res, delay));
    delay *= 2;
  }
  throw lastErr;
}

export async function searchUSDA(query, apiKey) {
  const url = `https://api.nal.usda.gov/fdc/v1/foods/search?query=${encodeURIComponent(query)}&dataType=SR%20Legacy,Foundation,Branded&pageSize=20&api_key=${apiKey}`;
  const r = await fetchWithRetry(url);
  if (!r.ok) throw new Error('Search failed');
  return r.json();
}

export async function fetchFoodDetails(fdcId, apiKey) {
  const url = `https://api.nal.usda.gov/fdc/v1/food/${fdcId}?api_key=${apiKey}`;
  const r = await fetchWithRetry(url);
  if (!r.ok) throw new Error('Fetch failed');
  return r.json();
}

export function extractNutrients(foodData) {
  const out = {};
  let omega3 = 0;
  let omega6 = 0;
  let vitaminB12 = 0;
  let folateVal = null;
  let folateSource = null;
  let vitaminETot = 0;

  const nutrients = foodData.foodNutrients || [];

  nutrients.forEach(n => {
    const name = n.nutrient?.name || n.name;
    const unit = (n.nutrient?.unitName || '').toUpperCase();
    const val = n.amount ?? n.value ?? 0;

    if (!name) return;
    if (name === 'Energy' && unit === 'KJ') return;

    out[name] = val;

    // detect omega-3: includes 'n-3' OR is 'PUFA 18:3' (ALA)
    if (name.includes('n-3') || name === 'PUFA 18:3') {
      omega3 += val;
    }
    // detect omega-6: includes 'n-6' OR is 'PUFA 18:2' (linoleic acid)
    if (name.includes('n-6') || name === 'PUFA 18:2') {
      omega6 += val;
    }

    // Vitamin B-12: sum natural + fortification forms
    if (name === 'Vitamin B-12' || name === 'Vitamin B-12, added') {
      vitaminB12 += val;
    }

    // Folate: prefer DFE (Dietary Folate Equivalent, official standard) > total > food
    if (name === 'Folate, DFE' && folateSource !== 'DFE') {
      folateVal = val;
      folateSource = 'DFE';
    } else if (name === 'Folate, total' && (folateSource === null || folateSource === 'food')) {
      folateVal = val;
      folateSource = 'total';
    } else if (name === 'Folate, food' && folateSource === null) {
      folateVal = val;
      folateSource = 'food';
    }

    // Vitamin E: aggregate all tocopherol forms (alpha, beta, gamma, delta)
    if (name === 'Vitamin E (alpha-tocopherol)' || name === 'Vitamin E, added' ||
        name === 'Tocopherol, beta' || name === 'Tocopherol, gamma' || name === 'Tocopherol, delta') {
      vitaminETot += val;
    }
  });

  // add aggregated values
  if (omega3 > 0) {
    out['Fatty acids, total omega-3'] = omega3;
  }
  if (omega6 > 0) {
    out['Fatty acids, total omega-6'] = omega6;
  }
  if (vitaminB12 > 0) {
    out['Vitamin B-12'] = vitaminB12;
  }
  if (folateVal !== null && folateVal > 0) {
    out['Folate'] = folateVal;
  }
  if (vitaminETot > 0) {
    out['Vitamin E'] = vitaminETot;
  }

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
  // gramWeight / amount: USDA stores total gram weight for `amount` of the portion unit.
  // e.g. amount=0.5, modifier="cup", gramWeight=62.5 → 125 g/cup. Verified against
  // known values (1 cup all-purpose flour ≈ 125 g, 1 tbsp olive oil ≈ 13.5 g).
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
