export async function searchOFF(query) {
  const fields = 'product_name,brands,nutriments,code,image_small_url,serving_size,serving_quantity,serving_quantity_unit,quantity,product_quantity_unit,nutrition_data_per,categories_tags';
  const url = `https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(query)}&search_simple=1&action=process&json=1&page_size=10&fields=${fields}`;
  const r = await fetch(url);
  if (!r.ok) throw new Error('OFF search failed');
  return r.json();
}

// Returns the product object or null (never throws).
export async function lookupOFFProduct(code) {
  try {
    const r = await fetch(`https://world.openfoodfacts.org/api/v0/product/${code}.json`);
    const data = await r.json();
    if (data.status !== 1 || !data.product) return null;
    return data.product;
  } catch {
    return null;
  }
}

export function normalizeOFFNutrients(product) {
  // OFF stores nutrients per 100g in nutriments object
  const n = product.nutriments || {};
  const serving = product.serving_size || null;

  // Map OFF keys → our TARGETS keys (partial match compatible)
  // Energy: cross-validate kcal vs kJ fields. If they disagree by >20%, derive kcal from kJ
  // (catches factor-of-10 typos in the kcal field — kJ is the primary field in OFF).
  const _kcal = n['energy-kcal_100g'];
  const _kj   = n['energy-kj_100g'] || n['energy_100g'];
  let _energy;
  if (_kcal && _kj) {
    const _derived = _kj / 4.184;
    _energy = (Math.abs(_kcal - _derived) / _derived > 0.20) ? _derived : _kcal;
  } else {
    _energy = _kcal || (_kj ? _kj / 4.184 : 0);
  }
  return {
    'Energy':                       _energy,
    'Protein':                      n['proteins_100g'] || 0,
    'Carbohydrate, by difference':  n['carbohydrates_100g'] || 0,
    'Total lipid (fat)':            n['fat_100g'] || 0,
    'Fiber, total dietary':         n['fiber_100g'] || 0,
    'Sugars, added':                n['added-sugars_100g'] || 0,
    'Sodium, Na':                   n['sodium_100g'] != null ? n['sodium_100g'] * 1000 : (n['salt_100g'] ? n['salt_100g'] * 400 : 0),
    'Calcium, Ca':                  n['calcium_100g'] != null ? n['calcium_100g'] * 1000 : 0,
    'Iron, Fe':                     n['iron_100g'] != null ? n['iron_100g'] * 1000 : 0,
    'Magnesium, Mg':                n['magnesium_100g'] != null ? n['magnesium_100g'] * 1000 : 0,
    'Potassium, K':                 n['potassium_100g'] != null ? n['potassium_100g'] * 1000 : 0,
    'Zinc, Zn':                     n['zinc_100g'] != null ? n['zinc_100g'] * 1000 : 0,
    'Vitamin C, total ascorbic acid': n['vitamin-c_100g'] != null ? n['vitamin-c_100g'] * 1000 : 0,
    'Vitamin D':                    n['vitamin-d_100g'] != null ? n['vitamin-d_100g'] * 1000 * 40 : 0, // µg→IU
    'Vitamin E (alpha-tocopherol)': n['vitamin-e_100g'] != null ? n['vitamin-e_100g'] * 1000 : 0,
    'Vitamin A, RAE':               n['vitamin-a_100g'] != null ? n['vitamin-a_100g'] * 1000 * 0.001 : 0,
    'Vitamin K (phylloquinone)':    n['vitamin-k_100g'] != null ? n['vitamin-k_100g'] * 1000 * 1000 : 0,
    'Thiamin':                      n['vitamin-b1_100g'] != null ? n['vitamin-b1_100g'] * 1000 : 0,
    'Riboflavin':                   n['vitamin-b2_100g'] != null ? n['vitamin-b2_100g'] * 1000 : 0,
    'Niacin':                       n['vitamin-pp_100g'] != null ? n['vitamin-pp_100g'] * 1000 : 0,
    'Vitamin B-6':                  n['vitamin-b6_100g'] != null ? n['vitamin-b6_100g'] * 1000 : 0,
    'Vitamin B-12':                 n['vitamin-b12_100g'] != null ? n['vitamin-b12_100g'] * 1000000 : 0,
    'Folate, total':                n['folates_100g'] != null ? n['folates_100g'] * 1000000 : 0,
    'Fatty acids, total saturated': n['saturated-fat_100g'] || 0,
    'Fatty acids, total omega-3':   n['omega-3-fat_100g'] || n['alpha-linolenic-acid_100g'] || 0,
    'Sugar alcohol':               n['polyols_100g'] || 0,
    'Selenium, Se':                 n['selenium_100g'] != null ? n['selenium_100g'] * 1000000 : 0,
    'Iodine, I':                    n['iodine_100g'] != null ? n['iodine_100g'] * 1000000 : 0,
    'Manganese, Mn':                n['manganese_100g'] != null ? n['manganese_100g'] * 1000 : 0,
    'Phosphorus, P':                n['phosphorus_100g'] != null ? n['phosphorus_100g'] * 1000 : 0,
    'Pantothenic acid':             n['pantothenic-acid_100g'] != null ? n['pantothenic-acid_100g'] * 1000 : 0,
    'Histidine':                    n['histidine_100g'] || 0,
    'Isoleucine':                   n['isoleucine_100g'] || 0,
    'Leucine':                      n['leucine_100g'] || 0,
    'Lysine':                       n['lysine_100g'] || 0,
    'Methionine':                   n['methionine_100g'] || 0,
    'Cystine':                      n['cysteine_100g'] || n['cystine_100g'] || 0,
    'Phenylalanine':                n['phenylalanine_100g'] || 0,
    'Tyrosine':                     n['tyrosine_100g'] || 0,
    'Threonine':                    n['threonine_100g'] || 0,
    'Tryptophan':                   n['tryptophan_100g'] || 0,
    'Valine':                       n['valine_100g'] || 0,
  };
}

export function extractMeasuresOFF(product) {
  const servingSize = (product.serving_size || '').toLowerCase();
  const quantity = (product.quantity || '').toLowerCase();
  const isLiquid =
    /\b(ml|cl|dl|liter|litre|fl\.?\s*oz)\b/.test(servingSize + ' ' + quantity) ||
    (product.nutrition_data_per || '').toLowerCase().includes('ml') ||
    (product.product_quantity_unit || '').toLowerCase() === 'ml' ||
    (product.serving_quantity_unit || '').toLowerCase() === 'ml';
  if (isLiquid) {
    let factor = 1.0;
    const mlMatch = servingSize.match(/([\d.]+)\s*ml/);
    const servingG = parseFloat(product.serving_quantity);
    if (mlMatch && servingG > 0) factor = Math.round((servingG / parseFloat(mlMatch[1])) * 1000) / 1000;
    // ml first so it's the default selected option
    return [{ label: 'ml', factor }, { label: 'g', factor: 1 }];
  }
  return [{ label: 'g', factor: 1 }];
}
