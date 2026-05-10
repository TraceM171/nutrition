import { state, dispatch } from '../store/store.js';
import { normalizeOFFNutrients, inferCarbBasis, extractMeasuresOFF } from '../sources/offSource.js';
import { extractNutrients, fetchFoodDetails, extractMeasuresUSDA } from '../sources/usdaSource.js';
import { decodeBarcodeFromBlob } from '../sources/barcode/decoder.js';
import { getRecipeNutrientsPer100g as _getRecipeNutrientsPer100g } from '../domain/recipes.js';
import { config } from './uiState.js';
import { escapeHtml } from './escape.js';
import { openFoodManageModal } from './ingredientDetail.js';
import { openRecipeEditor } from './recipeEditor.js';
import { openCustomIngEditor } from './customIngEditor.js';
import { doSearch, doLocalSearch, runBarcodeLookup, getFoodsOFFResults } from './searchModal.js';

export function restoreFoodsSearch() {
  const wrap = document.getElementById('foods-search-results');
  if (wrap && wrap.innerHTML.trim()) wrap.style.display = 'block';
}

export function foodsClearSearch() {
  const input = document.getElementById('foods-search-input');
  const wrap  = document.getElementById('foods-search-results');
  input.value = '';
  wrap.style.display = 'none';
  wrap.innerHTML = '';
  const btn = document.getElementById('foods-search-clear-btn');
  if (btn) btn.style.display = 'none';
  input.focus();
}

export async function foodsHandlePaste(event) {
  const items = Array.from(event.clipboardData?.items || []);
  const imageItem = items.find(i => i.type.startsWith('image/'));
  if (imageItem) {
    event.preventDefault();
    const wrap = document.getElementById('foods-search-results');
    wrap.style.display = 'block';
    wrap.innerHTML = '<div class="search-status"><div class="loading-spinner"></div> Decoding barcode image…</div>';
    await decodeBarcodeFromBlob(imageItem.getAsFile(), {
      onStatus: () => {},
      onCode: async code => {
        if (!code) {
          wrap.innerHTML = '<div class="search-status" style="color:var(--danger)">Could not decode barcode — try a clearer image or type the number manually</div>';
          return;
        }
        document.getElementById('foods-search-input').value = code;
        wrap.innerHTML = '<div class="search-status"><div class="loading-spinner"></div> Looking up barcode…</div>';
        await _handleFoodsBarcode(code);
      },
    });
    return;
  }
  setTimeout(() => foodsTriggerSearch(), 50);
}

export function foodsLocalSearch() {
  const raw = document.getElementById('foods-search-input').value.trim();
  const val = raw.replace(/\s/g, '');
  const wrap = document.getElementById('foods-search-results');
  if (val.length < 2) {
    if (!val.length) { wrap.style.display = 'none'; wrap.innerHTML = ''; }
    return;
  }
  if (/^\d{6,20}$/.test(val)) {
    wrap.style.display = 'block';
    wrap.innerHTML = '<div class="search-status">Press Enter to look up barcode</div>';
    return;
  }
  doLocalSearch(raw, 'foods');
}

export function foodsTriggerSearch() {
  const raw  = document.getElementById('foods-search-input').value.trim();
  const val  = raw.replace(/\s/g, '');
  const wrap = document.getElementById('foods-search-results');
  wrap.style.display = 'block';
  if (val.length < 2) {
    wrap.innerHTML = '<div class="search-status">Enter at least 2 characters</div>';
    return;
  }
  if (/^\d{6,20}$/.test(val)) {
    wrap.innerHTML = '<div class="search-status"><div class="loading-spinner"></div> Looking up barcode in Open Food Facts…</div>';
    _handleFoodsBarcode(val);
  } else {
    wrap.innerHTML = '<div class="search-status"><div class="loading-spinner"></div> Searching USDA + Open Food Facts…</div>';
    doSearch(raw, 'foods');
  }
}

async function _handleFoodsBarcode(code) {
  const wrap   = document.getElementById('foods-search-results');
  const result = await runBarcodeLookup(code, 'foods');
  if (!result) return;
  const fdcId = result.source; // 'off_' + code
  if (!state.foods[fdcId]) {
    dispatch({ type: 'FOODS_UPSERT', payload: { [fdcId]: { fdcId, name: result.name, nutrients: result.nutrients, source: 'Open Food Facts' } } });
  }
  wrap.style.display = 'none';
  wrap.innerHTML = '';
  openFoodManageModal(null, fdcId);
}

export function foodsSelectOFFResult(idx) {
  const p = getFoodsOFFResults()[idx];
  if (!p || !p.code) return;
  const fdcId = 'off_' + p.code;
  const wrap = document.getElementById('foods-search-results');
  wrap.style.display = 'none';
  if (!state.foods[fdcId]) {
    const { tentative, assumptions } = inferCarbBasis(p);
    const nutrients = normalizeOFFNutrients(p, tentative);
    const name = (p.product_name || p.generic_name || `Product ${p.code}`) + (p.brands ? ` (${p.brands})` : '');
    dispatch({ type: 'FOODS_UPSERT', payload: { [fdcId]: { fdcId, name, nutrients, source: 'Open Food Facts', carbBasis: tentative, carbBasisInference: { tentative, assumptions }, measures: extractMeasuresOFF(p) } } });
  }
  openFoodManageModal(null, fdcId);
}

export async function foodsSelectFood(fdcId) {
  const wrap = document.getElementById('foods-search-results');
  const savedResults = wrap.innerHTML;
  wrap.innerHTML = '<div class="search-status"><div class="loading-spinner"></div> Loading nutrition data…</div>';
  try {
    const data      = await fetchFoodDetails(fdcId, config.usdaKey);
    const nutrients = extractNutrients(data);
    dispatch({ type: 'FOODS_UPSERT', payload: { [fdcId]: { fdcId, name: data.description, nutrients, measures: extractMeasuresUSDA(data) } } });
    wrap.innerHTML = savedResults;
    wrap.style.display = 'none';
    openFoodManageModal(null, fdcId);
  } catch {
    wrap.innerHTML = '<div class="search-status">Failed to load details. Try another item.</div>';
  }
}

export function foodsSelectLocalFood(fdcId) {
  document.getElementById('foods-search-results').style.display = 'none';
  if (fdcId.startsWith('custom_')) {
    openCustomIngEditor(fdcId.slice(7));
  } else {
    openFoodManageModal(null, fdcId);
  }
}

export function foodsSelectRecipe(id) {
  document.getElementById('foods-search-results').style.display = 'none';
  openRecipeEditor(id);
}

export function foodsSelectCustomIng(id) {
  document.getElementById('foods-search-results').style.display = 'none';
  openCustomIngEditor(id);
}
