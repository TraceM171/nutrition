// Maps Cronometer food-editor nutrient names → canonical names compatible with
// the nutrient key convention used throughout this app (partial-match via .includes()).
const CRONO_MAP = {
  'Energy':                 'Energy',
  'Total Carbs':            'Carbohydrate, by difference',
  'Fiber':                  'Fiber, total dietary',
  'Sugars':                 'Total Sugars',
  'Starch':                 'Starch',
  'Fat':                    'Total lipid (fat)',
  'Saturated':              'Fatty acids, total saturated',
  'Monounsaturated':        'Fatty acids, total monounsaturated',
  'Polyunsaturated':        'Fatty acids, total polyunsaturated',
  'Omega-3':                'Fatty acids, total omega-3',
  'Omega-6':                'Fatty acids, total omega-6',
  'Trans-Fats':             'Fatty acids, total trans',
  'Cholesterol':            'Cholesterol',
  'Protein':                'Protein',
  'Alanine':                'Alanine',
  'Arginine':               'Arginine',
  'Aspartic acid':          'Aspartic acid',
  'Cystine':                'Cystine',
  'Glutamic acid':          'Glutamic acid',
  'Glycine':                'Glycine',
  'Histidine':              'Histidine',
  'Isoleucine':             'Isoleucine',
  'Leucine':                'Leucine',
  'Lysine':                 'Lysine',
  'Methionine':             'Methionine',
  'Phenylalanine':          'Phenylalanine',
  'Proline':                'Proline',
  'Serine':                 'Serine',
  'Threonine':              'Threonine',
  'Tryptophan':             'Tryptophan',
  'Tyrosine':               'Tyrosine',
  'Valine':                 'Valine',
  'B1 (Thiamine)':          'Thiamin',
  'B2 (Riboflavin)':        'Riboflavin',
  'B3 (Niacin)':            'Niacin',
  'B5 (Pantothenic Acid)':  'Pantothenic acid',
  'B6 (Pyridoxine)':        'Vitamin B-6',
  'B12 (Cobalamin)':        'Vitamin B-12',
  'Choline':                'Choline, total',
  'Folate':                 'Folate, total',
  'Lutein+Zeaxanthin':      'Lutein + zeaxanthin',
  'Vitamin A':              'Vitamin A, RAE',
  'Vitamin C':              'Vitamin C, total ascorbic acid',
  'Vitamin D':              'Vitamin D (D2 + D3)',
  'Vitamin E':              'Vitamin E (alpha-tocopherol)',
  'Beta Tocopherol':        'Tocopherol, beta',
  'Gamma Tocopherol':       'Tocopherol, gamma',
  'Delta Tocopherol':       'Tocopherol, delta',
  'Vitamin K':              'Vitamin K (phylloquinone)',
  'Calcium':                'Calcium, Ca',
  'Chromium':               'Chromium, Cr',
  'Copper':                 'Copper, Cu',
  'Fluoride':               'Fluoride, F',
  'Iodine':                 'Iodine, I',
  'Iron':                   'Iron, Fe',
  'Magnesium':              'Magnesium, Mg',
  'Manganese':              'Manganese, Mn',
  'Molybdenum':             'Molybdenum, Mo',
  'Phosphorus':             'Phosphorus, P',
  'Potassium':              'Potassium, K',
  'Selenium':               'Selenium, Se',
  'Sodium':                 'Sodium, Na',
  'Zinc':                   'Zinc, Zn',
};

/**
 * Parse a saved Cronometer food-editor page HTML string.
 * Returns { name, nutrients, measures } per 100 g, or null if no nutrient data found.
 * name may be null if the food title element is not present in the saved page.
 *
 * Cronometer diary pages embed multiple stacked food-editor panels (recipe → sub-recipe →
 * ingredient). Inactive panels are wrapped in `display:none` / `aria-hidden="true"`. We pick
 * the first visible panel (the one the user is currently viewing) and scope all table queries
 * to it. Falls back to the last panel if no visibility marker is found.
 */
export function parseCronometerHTML(htmlString) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(htmlString, 'text/html');

  // Find all food panels — each anchored by an .icon-star element.
  // Cronometer hides inactive panels via `display:none` / `aria-hidden="true"` on the
  // immediate parent wrapper. Pick the first visible panel; fall back to last.
  const allStars = [...doc.querySelectorAll('.icon-star')];
  if (allStars.length === 0) return null;
  let targetStar = allStars[allStars.length - 1];
  for (const star of allStars) {
    const panel   = star.closest('.foods-pages');
    const wrapper = panel?.parentElement;
    if (!wrapper) continue;
    if (wrapper.getAttribute('aria-hidden') === 'true') continue;
    if (wrapper.style.display === 'none') continue;
    targetStar = star;
    break;
  }

  // Name is in the sibling div immediately after the icon-star wrapper
  const nameEl = targetStar.closest('div')?.nextElementSibling;
  const name = nameEl ? nameEl.textContent.trim() : null;

  // Determine the next panel's star (if any) to bound the table search
  const targetIdx = allStars.indexOf(targetStar);
  const nextStar  = allStars[targetIdx + 1]; // undefined when last panel

  // Only consider crono-tables that fall within this panel's DOM range
  const FOLLOWING = Node.DOCUMENT_POSITION_FOLLOWING;
  const PRECEDING = Node.DOCUMENT_POSITION_PRECEDING;
  const panelTables = [...doc.querySelectorAll('table.crono-table')].filter(t => {
    if (!(targetStar.compareDocumentPosition(t) & FOLLOWING)) return false;
    if (nextStar && !(nextStar.compareDocumentPosition(t) & PRECEDING)) return false;
    return true;
  });

  // Detect serving amount from nutrition label.
  // Formats observed in the wild:
  //   "Per N × label — Mg"  — named measure; gram weight in trailing "— Mg"
  //                           (e.g. "Per 1 × 2 sausages — 100g")
  //   "Per N × ml"          — liquid measure, no trailing gram (e.g. "Per 250 × ml")
  //   "Per Ng/Nml"          — compact form (e.g. "Per 1g", "Per 100ml")
  //   "Per N Serving(s)"    — serving-based display; no gram equivalent available
  //   "Per Serving"         — default serving; gram value in "Serving Size: … — Ng"
  let serveAmount = 100;
  let baseUnit = 'g';
  for (const d of doc.querySelectorAll('div')) {
    if (d.children.length > 0) continue;
    if (!(targetStar.compareDocumentPosition(d) & FOLLOWING)) continue;
    if (nextStar && !(nextStar.compareDocumentPosition(d) & PRECEDING)) continue;
    const text = d.textContent.trim();
    // Any "Per …" line with a trailing "— Ng/ml" → that gram value is authoritative
    const mTrail = text.match(/^Per\b[-—×x\s\d.,\w]*[-—]\s*([\d.]+)\s*(g|ml)\s*$/i);
    if (mTrail) {
      const n = parseFloat(mTrail[1]);
      if (n > 0) serveAmount = n;
      baseUnit = mTrail[2].toLowerCase() === 'ml' ? 'ml' : 'g';
      break;
    }
    // "Per N × ml" liquid without trailing gram (e.g. "Per 250 × ml")
    const m1 = text.match(/^Per\s+([\d.]+)\s*[×x]\s*(ml)\s*$/i);
    if (m1) {
      const n = parseFloat(m1[1]);
      if (n > 0) serveAmount = n;
      baseUnit = 'ml';
      break;
    }
    // "Per Ng" / "Per Nml" compact form (e.g. "Per 1g", "Per 100ml")
    const m2 = text.match(/^Per\s+([\d.]+)\s*(g|ml)\s*$/i);
    if (m2) {
      const n = parseFloat(m2[1]);
      if (n > 0) serveAmount = n;
      baseUnit = m2[2].toLowerCase() === 'ml' ? 'ml' : 'g';
      break;
    }
    // "Serving Size: label — Ng" (when column shows "Per Serving")
    const m3 = text.match(/Serving Size:.*?[-—]\s*([\d.]+)\s*(g|ml)\s*$/i);
    if (m3) {
      const n = parseFloat(m3[1]);
      if (n > 0) serveAmount = n;
      baseUnit = m3[2].toLowerCase() === 'ml' ? 'ml' : 'g';
      break;
    }
    // "Serving Size Ng" / "Serving Size Nml" (compact, no colon or dash)
    const m4 = text.match(/^Serving\s+Size\s+([\d.]+)\s*(g|ml)\s*$/i);
    if (m4) {
      const n = parseFloat(m4[1]);
      if (n > 0) serveAmount = n;
      baseUnit = m4[2].toLowerCase() === 'ml' ? 'ml' : 'g';
      break;
    }
    // "Per N Serving(s)" — nutrient data is per serving, no gram basis available
    if (/^Per\s+[\d.]+\s+Servings?\s*$/i.test(text)) {
      baseUnit = 'serving';
      break;
    }
  }
  // serving-based: nutrients are already per 1 serving; no scaling needed
  const scale = baseUnit === 'serving' ? 1 : (100 / serveAmount);

  const nutrients = {};
  const seen = new Set(['g']);
  const measures = [{ label: 'g', factor: 1 }];

  for (const table of panelTables) {
    // nutrition-editor-table shows DRI targets, not food nutrient values — skip it
    if (table.classList.contains('nutrition-editor-table')) continue;

    const headers = Array.from(table.querySelectorAll('tr.table-header td'))
      .map(h => h.textContent.trim());

    // Serving sizes table: columns include "Grams" and "Measure"
    if (headers.includes('Grams') && headers.includes('Measure')) {
      for (const row of table.querySelectorAll('tr:not(.table-header)')) {
        const cells = row.querySelectorAll('td');
        if (cells.length < 3) continue;
        const label  = cells[1]?.textContent.trim();
        const grams  = Math.round(parseFloat(cells[2]?.textContent.trim()) * 1000) / 1000;
        if (label && !isNaN(grams) && grams > 0 && !seen.has(label) && !/^\d+(\.\d+)?\s*g$/i.test(label)) {
          seen.add(label);
          measures.push({ label, factor: grams });
        }
      }
      continue;
    }

    // Nutrient data tables: rows with gwt-HTML name + gwt-Label value
    for (const row of table.querySelectorAll('tr:not(.table-header):not(.noval)')) {
      const cells = row.querySelectorAll('td');
      if (cells.length < 2) continue;
      const nameEl = cells[0].querySelector('.gwt-HTML');
      if (!nameEl) continue;
      // &nbsp; (U+00A0) is used for indentation — strip it along with whitespace
      const rawName = nameEl.textContent.replace(/[ \s]+/g, ' ').trim();
      if (!rawName) continue;
      const valEl = cells[1].querySelector('.gwt-Label');
      if (!valEl) continue;
      const val = parseFloat(valEl.textContent.trim().replace(/^[<>≤≥]\s*/, ''));
      if (isNaN(val)) continue;
      const canonical = CRONO_MAP[rawName];
      if (canonical) nutrients[canonical] = Math.round(val * scale * 10000) / 10000;
    }
  }

  if (Object.keys(nutrients).length === 0) return null;
  return { name, nutrients, measures, baseUnit };
}
