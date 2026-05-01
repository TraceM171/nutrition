import { state } from '../store/store.js';
import { findNutrientVal } from '../domain/nutrients.js';
import { normalizeOFFNutrients } from '../sources/offSource.js';
import { extractNutrients, fetchFoodDetails } from '../sources/usdaSource.js';
import { decodeBarcodeFromBlob } from '../sources/barcode/decoder.js';
import { config } from './uiState.js';
import { escapeHtml } from './escape.js';
import { showNutritionDetail } from './ingredientDetail.js';
import { doSearch, runBarcodeLookup, getFoodsOFFResults } from './searchModal.js';

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
  if (!result) return; // runBarcodeLookup already set the "not found" message
  const totals = {};
  Object.keys(state.targets).forEach(k => { totals[k] = findNutrientVal(result.nutrients, k); });
  showNutritionDetail(result.name, '100g · Open Food Facts · % of daily target', totals, null);
  wrap.style.display = 'none';
  wrap.innerHTML = '';
}

export function foodsSelectOFFResult(idx) {
  const p = getFoodsOFFResults()[idx];
  if (!p) return;
  const name     = p.product_name + (p.brands ? ` (${p.brands})` : '');
  const nutrients = normalizeOFFNutrients(p);
  const totals   = {};
  Object.keys(state.targets).forEach(k => { totals[k] = findNutrientVal(nutrients, k); });
  document.getElementById('foods-search-results').style.display = 'none';
  showNutritionDetail(name, '100g · Open Food Facts · % of daily target', totals, null);
}

export async function foodsSelectFood(fdcId) {
  const wrap = document.getElementById('foods-search-results');
  const savedResults = wrap.innerHTML;
  wrap.innerHTML = '<div class="search-status"><div class="loading-spinner"></div> Loading nutrition data…</div>';
  try {
    const data      = await fetchFoodDetails(fdcId, config.usdaKey);
    const nutrients = extractNutrients(data);
    const totals    = {};
    Object.keys(state.targets).forEach(k => { totals[k] = findNutrientVal(nutrients, k); });
    const label = data.description;
    wrap.innerHTML = savedResults;
    wrap.style.display = 'none';
    showNutritionDetail(label, '100g · USDA · % of daily target', totals, null);
  } catch {
    wrap.innerHTML = '<div class="search-status">Failed to load details. Try another item.</div>';
  }
}

export function foodsSelectLocalFood(fdcId) {
  const food = state.foods[fdcId];
  if (!food) return;
  const name = state.foodAliases?.[fdcId] || food.name;
  const nutrients = food.nutrients || {};
  const totals = {};
  Object.keys(state.targets).forEach(k => { totals[k] = findNutrientVal(nutrients, k); });
  document.getElementById('foods-search-results').style.display = 'none';
  showNutritionDetail(name, '100g · % of daily target', totals, null);
}
