import { state, dispatch } from '../store/store.js';
import { DAYS, MEALS } from '../domain/constants.js';
import { showUndo } from './snackbar.js';
import { escapeHtml } from './escape.js';
import { config, bringToFront, resetZ } from './uiState.js';
import { populateUnitSelector, getCurrentUnit } from './unitSelector.js';
import { searchUSDA, fetchFoodDetails, extractNutrients, extractMeasuresUSDA } from '../sources/usdaSource.js';
import { searchOFF, lookupOFFProduct, normalizeOFFNutrients, extractMeasuresOFF, inferCarbBasis } from '../sources/offSource.js';
import { loadUPNG, loadZBar, decodeBarcodeFromBlob } from '../sources/barcode/decoder.js';
import { parseCronometerHTML } from '../sources/cronometerSource.js';
import { genId } from '../domain/id.js';
import { findNutrientVal } from '../domain/nutrients.js';
import { getRecipeWeightG as _getRecipeWeightG, getRecipeNutrientsPer100g as _getRecipeNutrientsPer100g, wouldCreateCycle as _wouldCreateCycle } from '../domain/recipes.js';
// Circular: recipeEditor imports from searchModal; resolved because imports are only used at call time.
import { addIngredientToCurrentRecipe, getCurrentEditRecipe, renderRecipeEditor, openRecipeEditor } from './recipeEditor.js';
import { selectCustomIng as _selectCustomIng, openCustomIngEditor } from './customIngEditor.js';
import { openFoodManageModal } from './ingredientDetail.js';

function getRecipeWeightG(r)         { return _getRecipeWeightG(r, state.recipes); }
function getRecipeNutrientsPer100g(r){ return _getRecipeNutrientsPer100g(r, state.recipes, state.foods); }
function wouldCreateCycle(parentId, candidateId) { return _wouldCreateCycle(parentId, candidateId, state.recipes); }

// ── Module-local state ──────────────────────────────────────────────────────
let modalCtx          = null;
let selectedFood      = null;
let _offSearchResults = [];
let _foodsOFFResults  = [];
let _lastMeasures     = [];
let _pendingOFFProduct = null;
let _pendingOFFFdcId   = null;

// Merges source measures with any userAdded measures from the food registry,
// puts userAdded entries first, then populates the unit selector.
function _trackMeasures(fdcId, srcMeasures) {
  _lastMeasures = srcMeasures;
  const userMeasures = (state.foods?.[fdcId]?.measures || []).filter(m => m.userAdded);
  const displayed = [...userMeasures.filter(ua => !srcMeasures.some(m => m.label === ua.label)), ...srcMeasures];
  populateUnitSelector(displayed);
}

function _finishOFFSelection(product, fdcId, carbBasis) {
  const code = fdcId.slice(4);
  const nutrients = normalizeOFFNutrients(product, carbBasis);
  const name = product.product_name || product.generic_name || `Product ${code}`;
  const brand = product.brands ? ` (${product.brands})` : '';
  const kcal = Math.round(nutrients['Energy'] || 0);
  const { tentative, assumptions } = inferCarbBasis(product);
  selectedFood = { fdcId, name: name + brand, nutrients, source: 'Open Food Facts', carbBasis, carbBasisInference: { tentative, assumptions } };
  document.getElementById('selected-food-name').textContent = selectedFood.name;
  _trackMeasures(fdcId, extractMeasuresOFF(product));
  document.getElementById('amount-row').style.display = 'flex';
  document.getElementById('search-results-wrap').innerHTML = '';
  setSelectionInfo(`${kcal} kcal/100g`, product.image_small_url || '');
}

function _showCarbBasisDialog(product, fdcId) {
  _pendingOFFProduct = product;
  _pendingOFFFdcId   = fdcId;
  const { tentative, assumptions, rawCarbs, fiber } = inferCarbBasis(product);
  const netIfNet   = rawCarbs.toFixed(1);
  const netIfTotal = Math.max(0, rawCarbs - fiber).toFixed(1);
  document.getElementById('search-results-wrap').innerHTML = `<div style="padding:16px">
    <div style="font-size:12px;font-weight:600;margin-bottom:10px">Net or total carbohydrates?</div>
    <div style="font-size:11px;color:var(--text-dim);margin-bottom:12px">
      Label shows <b>${rawCarbs}g carbs</b> · <b>${fiber}g fiber</b> per 100g
    </div>
    <div style="display:flex;flex-direction:column;gap:8px;margin-bottom:12px">
      <button class="btn${tentative === 'net' ? ' primary' : ''} sm" data-action="off-carb-basis" data-basis="net" style="justify-content:space-between;padding:8px 12px">
        <span><b>Net carbs</b> — fiber already excluded</span>
        <span style="font-size:11px;opacity:0.7">→ ${netIfNet}g net</span>
      </button>
      <button class="btn${tentative === 'total' ? ' primary' : ''} sm" data-action="off-carb-basis" data-basis="total" style="justify-content:space-between;padding:8px 12px">
        <span><b>Total carbs</b> — fiber included</span>
        <span style="font-size:11px;opacity:0.7">→ ${netIfTotal}g net</span>
      </button>
    </div>
    <div style="font-size:10px;color:var(--text-dimmer)">${escapeHtml(assumptions[0] || '')}</div>
  </div>`;
}

export function confirmCarbBasis(basis) {
  if (!_pendingOFFProduct || !_pendingOFFFdcId) return;
  const product = _pendingOFFProduct;
  const fdcId   = _pendingOFFFdcId;
  _pendingOFFProduct = null;
  _pendingOFFFdcId   = null;
  _finishOFFSelection(product, fdcId, basis);
}

function setSelectionInfo(text, imageUrl) {
  document.getElementById('selection-info-text').textContent = text || '';
  const wrap = document.getElementById('selection-image-wrap');
  if (imageUrl) {
    document.getElementById('selection-image').src = imageUrl;
    wrap.style.display = '';
  } else {
    wrap.style.display = 'none';
  }
}

// ── Modal open / close ──────────────────────────────────────────────────────
export function openModal(day, meal) {
  modalCtx = { day, meal };
  selectedFood = null;
  document.getElementById('search-input').value = '';
  document.getElementById('search-results-wrap').innerHTML = '';
  document.getElementById('amount-row').style.display = 'none';
  document.getElementById('mode-tab-recipes').style.display = '';
  const el = document.getElementById('modal');
  el.classList.add('open');
  bringToFront(el);
  switchMode('search');
  setTimeout(() => document.getElementById('search-input').focus(), 100);
}

export function openModalForExtras() {
  modalCtx = { mode: 'extra' };
  selectedFood = null;
  document.getElementById('search-input').value = '';
  document.getElementById('search-results-wrap').innerHTML = '';
  document.getElementById('amount-row').style.display = 'none';
  document.getElementById('mode-tab-recipes').style.display = '';
  const el = document.getElementById('modal');
  el.classList.add('open');
  bringToFront(el);
  switchMode('search');
  setTimeout(() => document.getElementById('search-input').focus(), 100);
}

export function closeModal() {
  const el = document.getElementById('modal');
  el.classList.remove('open');
  resetZ(el);
  modalCtx = null;
  selectedFood = null;
}

export function switchMode(mode) {
  document.getElementById('mode-search-wrap').style.display = mode === 'search' ? 'block' : 'none';
  document.getElementById('mode-cronometer-wrap').style.display = mode === 'cronometer' ? 'block' : 'none';
  document.getElementById('mode-tab-recipes').style.display = mode === 'search' ? '' : 'none';
  document.getElementById('amount-row').style.display = 'none';
  selectedFood = null;
  setSelectionInfo('');
  if (mode === 'search') {
    document.getElementById('search-results-wrap').innerHTML = '';
    setBarcodeImgStatus('', 'dim');
    setTimeout(() => document.getElementById('search-input').focus(), 50);
  } else if (mode === 'cronometer') {
    document.getElementById('crono-html-input').value = '';
    document.getElementById('crono-status').textContent = '';
    setTimeout(() => document.getElementById('crono-html-input').focus(), 50);
  } else {
    renderRecipesTab();
  }
}

export function handleCronometerImport() {
  const html = document.getElementById('crono-html-input').value.trim();
  const statusEl = document.getElementById('crono-status');
  if (!html) { statusEl.textContent = 'Paste the Cronometer page HTML first.'; statusEl.style.color = 'var(--danger)'; return; }

  statusEl.textContent = 'Parsing…';
  statusEl.style.color = 'var(--text-dim)';

  const parsed = parseCronometerHTML(html);
  if (!parsed) {
    statusEl.textContent = 'No nutrient data found. Make sure you pasted the full page HTML from a Cronometer food page.';
    statusEl.style.color = 'var(--danger)';
    return;
  }

  const name = parsed.name;
  if (!name) { statusEl.textContent = 'Food name not found in HTML.'; statusEl.style.color = 'var(--danger)'; return; }

  const id = genId();
  const crNutrientBasis = parsed.baseUnit === 'serving'
    ? { unit: 'serving', qty: 1 }
    : { unit: parsed.baseUnit || 'g', qty: 100 };
  const payload = {
    id,
    name,
    nutrients: parsed.nutrients,
    nutrientBasis: crNutrientBasis,
    source: 'cronometer',
  };
  dispatch({ type: 'CUSTOM_ING_SAVE', payload });

  // Add serving measures from Cronometer data (reverse order so first appears first in selector)
  const crBaseLabel = crNutrientBasis.unit;
  const extras = parsed.measures.filter(m => m.label !== crBaseLabel && m.label !== 'g');
  for (let i = extras.length - 1; i >= 0; i--) {
    dispatch({ type: 'FOOD_MEASURE_SET', payload: { fdcId: 'custom_' + id, label: extras[i].label, factor: extras[i].factor } });
  }

  statusEl.textContent = '';
  openCustomIngEditor(id);
}

// ── Standalone Cronometer import (from Foods tab) ───────────────────────────
export function openCronometerStandaloneModal() {
  document.getElementById('crono-sa-html-input').value = '';
  document.getElementById('crono-sa-status').textContent = '';
  const el = document.getElementById('crono-standalone-modal');
  el.classList.add('open');
  bringToFront(el);
  setTimeout(() => document.getElementById('crono-sa-html-input').focus(), 50);
}

export function closeCronometerStandaloneModal() {
  const el = document.getElementById('crono-standalone-modal');
  el.classList.remove('open');
  resetZ(el);
}

export function handleCronometerImportStandalone() {
  const html = document.getElementById('crono-sa-html-input').value.trim();
  const statusEl = document.getElementById('crono-sa-status');
  if (!html) { statusEl.textContent = 'Paste the Cronometer page HTML first.'; statusEl.style.color = 'var(--danger)'; return; }

  statusEl.textContent = 'Parsing…';
  statusEl.style.color = 'var(--text-dim)';

  const parsed = parseCronometerHTML(html);
  if (!parsed) {
    statusEl.textContent = 'No nutrient data found. Make sure you pasted the full page HTML from a Cronometer food page.';
    statusEl.style.color = 'var(--danger)';
    return;
  }

  const name = parsed.name;
  if (!name) { statusEl.textContent = 'Food name not found in HTML.'; statusEl.style.color = 'var(--danger)'; return; }

  const id = genId();
  const saNutrientBasis = parsed.baseUnit === 'serving'
    ? { unit: 'serving', qty: 1 }
    : { unit: parsed.baseUnit || 'g', qty: 100 };
  const payload = { id, name, nutrients: parsed.nutrients, nutrientBasis: saNutrientBasis, source: 'cronometer' };
  dispatch({ type: 'CUSTOM_ING_SAVE', payload });

  const saBaseLabel = saNutrientBasis.unit;
  const saExtras = parsed.measures.filter(m => m.label !== saBaseLabel && m.label !== 'g');
  for (let i = saExtras.length - 1; i >= 0; i--) {
    dispatch({ type: 'FOOD_MEASURE_SET', payload: { fdcId: 'custom_' + id, label: saExtras[i].label, factor: saExtras[i].factor } });
  }

  closeCronometerStandaloneModal();
  openCustomIngEditor(id);
}

// ── Barcode image helpers ───────────────────────────────────────────────────
function setBarcodeImgStatus(msg, type) {
  const el = document.getElementById('barcode-img-status');
  if (!el) return;
  el.textContent = msg;
  el.style.color = type === 'ok' ? 'var(--good)' : type === 'err' ? 'var(--danger)' : 'var(--text-dim)';
}

export async function handleBarcodePaste(event) {
  const items = Array.from(event.clipboardData?.items || []);
  const imageItem = items.find(i => i.type.startsWith('image/'));
  if (!imageItem) return;
  event.preventDefault();
  await decodeBarcodeFromBlob(imageItem.getAsFile(), {
    onStatus: setBarcodeImgStatus,
    onCode: code => {
      if (!code) return;
      document.getElementById('search-input').value = code;
      setBarcodeImgStatus(`✓ Decoded: ${code}`, 'ok');
      runBarcodeLookup(code, 'modal');
    },
  });
}

export async function pasteImageFromClipboard() {
  if (!navigator.clipboard?.read) {
    setBarcodeImgStatus('Use Ctrl+V while the search field is focused', 'dim');
    document.getElementById('search-input').focus();
    return;
  }
  setBarcodeImgStatus('Reading clipboard…', 'dim');
  try {
    const items = await navigator.clipboard.read();
    for (const item of items) {
      const imageType = item.types.find(t => t.startsWith('image/'));
      if (imageType) {
        const blob = await item.getType(imageType);
        await decodeBarcodeFromBlob(blob, {
          onStatus: setBarcodeImgStatus,
          onCode: code => {
            if (!code) return;
            document.getElementById('search-input').value = code;
            setBarcodeImgStatus(`✓ Decoded: ${code}`, 'ok');
            runBarcodeLookup(code, 'modal');
          },
        });
        return;
      }
    }
    setBarcodeImgStatus('No image in clipboard — copy a barcode photo first', 'err');
  } catch {
    setBarcodeImgStatus('Could not read clipboard — focus the search field and press Ctrl+V', 'dim');
    document.getElementById('search-input').focus();
  }
}

export async function handleBarcodeDrop(event) {
  event.preventDefault();
  const file = event.dataTransfer?.files?.[0];
  if (file?.type.startsWith('image/')) {
    await decodeBarcodeFromBlob(file, {
      onStatus: setBarcodeImgStatus,
      onCode: code => {
        if (!code) return;
        document.getElementById('search-input').value = code;
        setBarcodeImgStatus(`✓ Decoded: ${code}`, 'ok');
        runBarcodeLookup(code, 'modal');
      },
    });
  } else {
    setBarcodeImgStatus('Drop an image file (PNG, JPG, etc.)', 'err');
  }
}

// ── Search ──────────────────────────────────────────────────────────────────
export function triggerSearch() {
  const raw = document.getElementById('search-input').value.trim();
  const val = raw.replace(/\s/g, '');
  if (val.length < 2) {
    document.getElementById('search-results-wrap').innerHTML = '<div class="search-status">Enter at least 2 characters</div>';
    return;
  }
  if (/^\d{6,20}$/.test(val)) {
    document.getElementById('search-results-wrap').innerHTML = '<div class="search-status"><div class="loading-spinner"></div> Looking up barcode…</div>';
    runBarcodeLookup(val, 'modal');
  } else {
    document.getElementById('search-results-wrap').innerHTML = '<div class="search-status"><div class="loading-spinner"></div> Searching…</div>';
    doSearch(raw, 'modal');
  }
}

function _getInUseFdcIds() {
  const ids = new Set();
  DAYS.forEach(d => MEALS.forEach(m => {
    (state.plan?.[d]?.[m] || []).forEach(item => {
      if (item.type === 'food' && item.fdcId) ids.add(String(item.fdcId));
    });
  }));
  Object.values(state.recipes || {}).forEach(r => {
    (r.ingredients || []).forEach(ing => {
      if (ing.fdcId) ids.add(String(ing.fdcId));
    });
  });
  return ids;
}

function _searchInUseFoods(query) {
  const inUse = _getInUseFdcIds();
  const q = query.toLowerCase();
  const results = [];
  for (const fdcId of inUse) {
    const food = state.foods[fdcId];
    if (!food) continue;
    const name = state.foodAliases?.[fdcId] || food.name || '';
    if (name.toLowerCase().includes(q)) results.push({ fdcId, name, food });
  }
  return results;
}

function _localItemHtml({ fdcId, name, food }, isFoods) {
  const kcal = Math.round(findNutrientVal(food.nutrients || {}, 'energy') || 0);
  const nb = food.nutrientBasis;
  const perLabel = !nb ? '100g'
    : nb.unit === 'serving' ? escapeHtml(nb.label || 'serving')
    : `${nb.qty}${nb.unit}`;
  let badgeClass, badgeText;
  if (fdcId.startsWith('off_'))         { badgeClass = 'src-off';    badgeText = 'OFF'; }
  else if (fdcId.startsWith('custom_')) { badgeClass = 'src-custom'; badgeText = 'Custom'; }
  else                                   { badgeClass = 'src-usda';   badgeText = 'USDA'; }
  return `<div class="result-item" data-action="${isFoods ? 'foods-select-local' : 'select-local'}" data-fdc-id="${escapeHtml(fdcId)}">
    <div><div class="result-name"><span class="src-badge ${badgeClass}">${badgeText}</span>${escapeHtml(name)}</div></div>
    <div class="result-kcal">${kcal} kcal/${perLabel}</div>
  </div>`;
}

function _recipeItemHtml(id, r, isFoods) {
  const totalG = getRecipeWeightG(r);
  const servG  = Math.round(r.yields > 0 ? totalG / r.yields : totalG);
  const n      = totalG ? getRecipeNutrientsPer100g(r) : {};
  const kcal   = totalG ? Math.round(findNutrientVal(n, 'energy')) : 0;
  const kcalS  = servG ? Math.round(kcal * servG / 100) : 0;
  const action = isFoods ? 'foods-select-recipe' : 'select-recipe';
  return `<div class="result-item" data-action="${action}" data-id="${escapeHtml(id)}">
    <div>
      <div class="result-name"><span class="src-badge src-recipe">Recipe</span>${escapeHtml(r.name)}</div>
      <div class="result-cat">${r.ingredients.length} ing · ${r.yields} srv · ${servG || '?'}g/srv</div>
    </div>
    <div class="result-kcal">${kcalS ? kcalS + ' kcal/srv' : kcal ? kcal + ' kcal/100g' : '—'}</div>
  </div>`;
}

function _customIngItemHtml(id, ci, isFoods) {
  const ciFood = state.foods['custom_' + id];
  const resolvedN = ciFood?.nutrients || ci.nutrients || {};
  const kcal = Math.round(resolvedN['Energy'] || 0);
  const nb = ciFood?.nutrientBasis;
  const perLabel = !nb ? '100g'
    : nb.unit === 'serving' ? escapeHtml(nb.label || 'serving')
    : nb.unit === 'g' || nb.unit === 'ml' ? `${nb.qty}${nb.unit}`
    : `${nb.qty} ${escapeHtml(nb.unit)}`;
  const action = isFoods ? 'foods-select-custom-ing' : 'select-custom-ing';
  return `<div class="result-item" data-action="${action}" data-id="${escapeHtml(id)}">
    <div><div class="result-name"><span class="src-badge src-custom">Custom</span>${escapeHtml(ci.name)}</div></div>
    <div class="result-kcal">${kcal} kcal/${perLabel}</div>
  </div>`;
}

function _offItemHtml(p, idx, isFoods) {
  const name  = p.product_name;
  const brand = p.brands ? ` (${p.brands})` : '';
  const n     = p.nutriments || {};
  const kcal  = n['energy-kcal_100g']
    ? Math.round(n['energy-kcal_100g'])
    : n['energy_100g'] ? Math.round(n['energy_100g'] / 4.184) : '—';
  return `<div class="result-item" data-action="${isFoods ? 'foods-select-off' : 'select-off'}" data-idx="${idx}">
    <div><div class="result-name"><span class="src-badge src-off">OFF</span>${escapeHtml(name)}${escapeHtml(brand)}</div></div>
    <div class="result-kcal">${kcal} kcal/100g</div>
  </div>`;
}

function _usdaItemHtml(f, isFoods) {
  const kcal = f.foodNutrients?.find(n => n.nutrientName === 'Energy')?.value || '—';
  const cat  = f.foodCategory || f.dataType || '';
  return `<div class="result-item" data-action="${isFoods ? 'foods-select-usda' : 'select-usda'}" data-fdc-id="${f.fdcId}">
    <div><div class="result-name"><span class="src-badge src-usda">USDA</span>${escapeHtml(f.description)}</div><div class="result-cat">${escapeHtml(cat)}</div></div>
    <div class="result-kcal">${kcal} kcal/100g</div>
  </div>`;
}

const _SECTION_LABEL = 'font-size:10px;text-transform:uppercase;letter-spacing:1.5px;color:var(--text-dimmer);padding:10px 8px 4px';

export function buildResultsHtml(offProducts, usdaFoods, context, localFoods = [], matchedRecipes = [], matchedCustomIngs = []) {
  const isFoods = context === 'foods';
  const localFdcIds = new Set(localFoods.map(f => f.fdcId));

  const hasLocal    = localFoods.length > 0;
  const hasMyFoods  = matchedRecipes.length > 0 || matchedCustomIngs.length > 0;
  const hasOther    = offProducts.some(p => !p.code || !localFdcIds.has('off_' + p.code))
                   || usdaFoods.some(f => !localFdcIds.has(String(f.fdcId)));
  const needDivider = hasLocal || hasMyFoods;
  let html = '';

  if (hasLocal) {
    html += `<div style="${_SECTION_LABEL}">Used ingredients</div>`;
    localFoods.forEach(item => { html += _localItemHtml(item, isFoods); });
  }
  if (hasMyFoods) {
    html += `<div style="${_SECTION_LABEL}${hasLocal ? ';border-top:1px solid var(--border);margin-top:4px' : ''}">My Foods</div>`;
    matchedRecipes.forEach(({ id, r }) => { html += _recipeItemHtml(id, r, isFoods); });
    matchedCustomIngs.forEach(({ id, ci }) => { html += _customIngItemHtml(id, ci, isFoods); });
  }
  if (hasOther && needDivider) html += `<div style="${_SECTION_LABEL};border-top:1px solid var(--border);margin-top:4px">Other results</div>`;
  offProducts.forEach((p, idx) => {
    if (!p.code || !localFdcIds.has('off_' + p.code)) html += _offItemHtml(p, idx, isFoods);
  });
  usdaFoods.forEach(f => {
    if (!localFdcIds.has(String(f.fdcId))) html += _usdaItemHtml(f, isFoods);
  });

  return html || '<div class="search-status">No results found. Try a different term.</div>';
}

export function doLocalSearch(query, context) {
  const isFoods = context === 'foods';
  const wrap = document.getElementById(isFoods ? 'foods-search-results' : 'search-results-wrap');
  const val = query.replace(/\s/g, '');
  if (val.length < 2) {
    if (isFoods && !val.length) { wrap.style.display = 'none'; wrap.innerHTML = ''; }
    return;
  }
  if (/^\d{6,20}$/.test(val)) {
    wrap.innerHTML = '<div class="search-status">Press Enter to look up barcode</div>';
    if (isFoods) wrap.style.display = 'block';
    return;
  }
  if (isFoods) _foodsOFFResults = []; else _offSearchResults = [];
  const q = query.toLowerCase();
  const localFoods = _searchInUseFoods(query);
  const localFdcIdSet = new Set(localFoods.map(f => f.fdcId));
  const currentRecipe = getCurrentEditRecipe();
  const matchedRecipes = Object.entries(state.recipes || {})
    .filter(([id, r]) => {
      if (!r.name.toLowerCase().includes(q)) return false;
      if (!isFoods && modalCtx?.mode === 'recipe' && currentRecipe)
        return id !== currentRecipe.id && !wouldCreateCycle(currentRecipe.id, id);
      return true;
    })
    .map(([id, r]) => ({ id, r }));
  const matchedCustomIngs = Object.entries(state.customIngredients || {})
    .filter(([id, ci]) => ci.name.toLowerCase().includes(q) && !localFdcIdSet.has('custom_' + id))
    .map(([id, ci]) => ({ id, ci }));
  const hasLocal = localFoods.length > 0 || matchedRecipes.length > 0 || matchedCustomIngs.length > 0;
  wrap.innerHTML = hasLocal
    ? buildResultsHtml([], [], context, localFoods, matchedRecipes, matchedCustomIngs)
    : '<div class="search-status">No local results — press Enter to search online</div>';
  if (isFoods) wrap.style.display = 'block';
}

export async function doSearch(query, context) {
  const isFoods = context === 'foods';
  const wrap = document.getElementById(isFoods ? 'foods-search-results' : 'search-results-wrap');
  if (isFoods) _foodsOFFResults = []; else _offSearchResults = [];

  const localFoods = _searchInUseFoods(query);
  const localFdcIdSet = new Set(localFoods.map(f => f.fdcId));
  const q = query.toLowerCase();
  const currentRecipe = getCurrentEditRecipe();
  const matchedRecipes = Object.entries(state.recipes || {})
    .filter(([id, r]) => {
      if (!r.name.toLowerCase().includes(q)) return false;
      if (!isFoods && modalCtx?.mode === 'recipe' && currentRecipe)
        return id !== currentRecipe.id && !wouldCreateCycle(currentRecipe.id, id);
      return true;
    })
    .map(([id, r]) => ({ id, r }));
  const matchedCustomIngs = Object.entries(state.customIngredients || {})
    .filter(([id, ci]) => ci.name.toLowerCase().includes(q) && !localFdcIdSet.has('custom_' + id))
    .map(([id, ci]) => ({ id, ci }));

  const hasInstant = localFoods.length > 0 || matchedRecipes.length > 0 || matchedCustomIngs.length > 0;
  if (hasInstant) {
    wrap.innerHTML = buildResultsHtml([], [], context, localFoods, matchedRecipes, matchedCustomIngs)
      + '<div class="search-status" style="border-top:1px solid var(--border);padding:6px 8px;font-size:11px"><div class="loading-spinner"></div> Searching…</div>';
  }
  try {
    const [offRes, usdaRes] = await Promise.allSettled([searchOFF(query), searchUSDA(query, config.usdaKey)]);
    const offProducts = offRes.status === 'fulfilled'
      ? (offRes.value?.products || []).filter(p => p.product_name).slice(0, 10) : [];
    const usdaFoods   = usdaRes.status === 'fulfilled' ? (usdaRes.value?.foods || []).slice(0, 10) : [];
    if (isFoods) _foodsOFFResults = offProducts; else _offSearchResults = offProducts;
    wrap.innerHTML = buildResultsHtml(offProducts, usdaFoods, context, localFoods, matchedRecipes, matchedCustomIngs);
  } catch {
    const hasLocal = localFoods.length > 0 || matchedRecipes.length > 0 || matchedCustomIngs.length > 0;
    wrap.innerHTML = hasLocal
      ? buildResultsHtml([], [], context, localFoods, matchedRecipes, matchedCustomIngs)
      : '<div class="search-status">Error searching. Check your connection.</div>';
  }
}

export async function runBarcodeLookup(code, context) {
  const isFoods = context === 'foods';
  const wrap = document.getElementById(isFoods ? 'foods-search-results' : 'search-results-wrap');
  if (!code || code.length < 6) {
    wrap.innerHTML = '<div class="search-status" style="color:var(--danger)">Please enter a valid barcode (at least 6 digits)</div>';
    return;
  }
  wrap.innerHTML = '<div class="search-status"><div class="loading-spinner"></div> Looking up barcode in Open Food Facts…</div>';
  const p = await lookupOFFProduct(code);
  if (!p) {
    if (isFoods) {
      wrap.innerHTML = '<div class="search-status" style="color:var(--danger)">Barcode not found in Open Food Facts. Try searching by name.</div>';
    } else {
      wrap.innerHTML = '<div class="search-status"><div class="loading-spinner"></div> Not found in Open Food Facts, trying USDA…</div>';
      await _barcodeFallbackUSDA(code);
    }
    return;
  }
  const name  = p.product_name || p.generic_name || `Product ${code}`;
  const brand = p.brands ? ` (${p.brands})` : '';
  if (isFoods) {
    const nutrients = normalizeOFFNutrients(p);  // display-only: auto-detect, not stored
    return { name: name + brand, nutrients, source: 'off_' + code };
  }
  const fdcId = 'off_' + code;
  const savedBasis = state.foods[fdcId]?.carbBasis;
  if (savedBasis) { _finishOFFSelection(p, fdcId, savedBasis); return; }
  const fiber = (p.nutriments || {})['fiber_100g'] || 0;
  if (!fiber) { _finishOFFSelection(p, fdcId, 'total'); return; }
  _showCarbBasisDialog(p, fdcId);
}

async function _barcodeFallbackUSDA(code) {
  try {
    const r = await fetch(`https://api.nal.usda.gov/fdc/v1/foods/search?query=${code}&dataType=Branded&pageSize=5&api_key=${config.usdaKey}`);
    const data = await r.json();
    const match = (data.foods || []).find(f => f.gtinUpc === code);
    if (!match) {
      document.getElementById('search-results-wrap').innerHTML = '<div class="search-status" style="color:var(--danger)">Barcode not found in either database.<br><span style="font-size:11px">Try searching by name instead.</span></div>';
      return;
    }
    await selectFood(match.fdcId, match.description);
  } catch {
    document.getElementById('search-results-wrap').innerHTML = '<div class="search-status" style="color:var(--danger)">Barcode not found. Try searching by name instead.</div>';
  }
}

// ── Food selection ──────────────────────────────────────────────────────────

export function selectLocalFood(fdcId) {
  const food = state.foods[fdcId];
  if (!food) return;
  const name = state.foodAliases?.[fdcId] || food.name;
  selectedFood = { fdcId, name, nutrients: food.nutrients, ...(food.carbBasis ? { carbBasis: food.carbBasis } : {}) };
  document.getElementById('selected-food-name').textContent = name;
  _trackMeasures(fdcId, food.measures || [{ label: 'g', factor: 1 }]);
  document.getElementById('amount-row').style.display = 'flex';
  const kcal = Math.round(findNutrientVal(food.nutrients || {}, 'energy'));
  const nb = food.nutrientBasis;
  const perLabel = !nb ? '100g'
    : nb.unit === 'serving' ? (nb.label || 'serving')
    : `${nb.qty}${nb.unit}`;
  setSelectionInfo(`${kcal} kcal/${perLabel}`);
  document.getElementById('search-results-wrap').innerHTML = '';
}

// P15: block OFF search results with no barcode (truly no stable ID)
export function selectOFFResult(idx) {
  const p = _offSearchResults[idx];
  if (!p) return;
  if (!p.code) {
    document.getElementById('search-results-wrap').innerHTML =
      '<div class="search-status" style="color:var(--danger)">This result has no barcode — it cannot be refetched later.<br>Please pick a different result or search by barcode.</div>';
    return;
  }
  const fdcId = 'off_' + p.code;
  const savedBasis = state.foods[fdcId]?.carbBasis;
  if (savedBasis) { _finishOFFSelection(p, fdcId, savedBasis); return; }
  const fiber = (p.nutriments || {})['fiber_100g'] || 0;
  if (!fiber) { _finishOFFSelection(p, fdcId, 'total'); return; }
  _showCarbBasisDialog(p, fdcId);
}

export async function selectFood(fdcId, name) {
  const wrap = document.getElementById('search-results-wrap');
  const savedResults = wrap.innerHTML;
  wrap.innerHTML = '<div class="search-status"><div class="loading-spinner"></div> Loading nutrition data…</div>';
  try {
    const data      = await fetchFoodDetails(fdcId, config.usdaKey);
    const nutrients = extractNutrients(data);
    selectedFood = { fdcId, name: data.description || name, nutrients };
    document.getElementById('selected-food-name').textContent = selectedFood.name;
    _trackMeasures(fdcId, extractMeasuresUSDA(data));
    document.getElementById('amount-row').style.display = 'flex';
    const kcalUSDA = Math.round(findNutrientVal(nutrients, 'energy'));
    setSelectionInfo(`${kcalUSDA} kcal/100g`);
    wrap.innerHTML = savedResults;
  } catch {
    wrap.innerHTML = '<div class="search-status">Failed to load details. Try another item.</div>';
  }
}

export function selectCustomIng(id) {
  _selectCustomIng(id, { populateUnitSelector: measures => _trackMeasures('custom_' + id, measures), selectedFoodSetter: f => { selectedFood = f; } });
  if (selectedFood) {
    const kcal = Math.round(selectedFood.nutrients?.['Energy'] || 0);
    const nb = state.foods?.[selectedFood.fdcId]?.nutrientBasis;
    const perLabel = !nb ? '100g'
      : nb.unit === 'serving' ? (nb.label || 'serving')
      : nb.unit === 'g' || nb.unit === 'ml' ? `${nb.qty}${nb.unit}`
      : `${nb.qty} ${nb.unit}`;
    setSelectionInfo(`${kcal} kcal/${perLabel}`);
  }
}

export function clearSelection() {
  selectedFood = null;
  document.getElementById('amount-row').style.display = 'none';
  setSelectionInfo('');
  const searchWrap = document.getElementById('mode-search-wrap');
  if (searchWrap?.style.display === 'none') {
    // Recipes/custom-ing tab was active — restore the list.
    renderRecipesTab();
  } else {
    document.getElementById('search-input').focus();
  }
}

// ── Confirm add ─────────────────────────────────────────────────────────────
export function confirmAdd() {
  if (!selectedFood || !modalCtx) return;
  const { factor: unitFactor, label: unitLabel } = getCurrentUnit();
  const qty     = parseFloat(document.getElementById('amount-input').value) || 1;
  const amountG = Math.round(qty * unitFactor * 10) / 10;
  const unit    = unitLabel;

  if (selectedFood.type !== 'recipe' && selectedFood.fdcId && selectedFood.nutrients) {
    const entry = {
      fdcId:     selectedFood.fdcId,
      name:      selectedFood.name,
      nutrients: selectedFood.nutrients,
      measures:  _lastMeasures.length > 0 ? _lastMeasures : [{ label: 'g', factor: 1 }],
      ...(selectedFood.carbBasis          ? { carbBasis:          selectedFood.carbBasis          } : {}),
      ...(selectedFood.carbBasisInference ? { carbBasisInference: selectedFood.carbBasisInference } : {}),
    };
    dispatch({ type: 'FOODS_UPSERT', payload: { [selectedFood.fdcId]: entry } });
  }

  const isServingBased = state.foods?.[selectedFood.fdcId]?.nutrientBasis?.unit === 'serving';
  let ing;
  if (selectedFood.type === 'recipe') {
    ing = { type: 'recipe', recipeId: selectedFood.recipeId, name: selectedFood.name, amountG, unit, qty };
  } else if (isServingBased) {
    ing = { type: 'food', fdcId: selectedFood.fdcId, name: selectedFood.name, amountG: 0, unit, qty };
  } else {
    ing = { type: 'food', fdcId: selectedFood.fdcId, name: selectedFood.name, amountG, unit, qty };
  }

  if (modalCtx.mode === 'recipe') {
    addIngredientToCurrentRecipe(ing);
    closeModal();
    return;
  }
  if (modalCtx.mode === 'extra') {
    dispatch({ type: 'EXTRA_FOOD_ADD', payload: { item: ing } });
    const extraIdx = state.extraFoods.length - 1;
    closeModal();
    showUndo(`Added "${ing.name}"`, () => dispatch({ type: 'EXTRA_FOOD_REMOVE', payload: { idx: extraIdx } }));
    return;
  }
  const { day, meal } = modalCtx;
  dispatch({ type: 'PLAN_ADD_ITEM', payload: { day, meal, item: ing } });
  const planIdx = state.plan[day][meal].length - 1;
  closeModal();
  showUndo(`Added "${ing.name}"`, () => dispatch({ type: 'PLAN_REMOVE_ITEM', payload: { day, meal, idx: planIdx } }));
}

// ── Recipe / custom-ing tab inside the modal ────────────────────────────────
export function recipeAddFood() {
  const currentRecipe = getCurrentEditRecipe();
  if (!currentRecipe) return;
  modalCtx = { mode: 'recipe' };
  selectedFood = null;
  document.getElementById('search-input').value = '';
  document.getElementById('amount-row').style.display = 'none';
  const el = document.getElementById('modal');
  el.classList.add('open');
  bringToFront(el);
  switchMode('search');
  setTimeout(() => document.getElementById('search-input').focus(), 100);
}

export function renderRecipesTab() {
  const wrap = document.getElementById('search-results-wrap');
  const backBtn = '<button class="btn sm" data-action="switch-mode" data-mode="search" style="font-size:11px">← Back to Search</button>';
  const currentRecipe = getCurrentEditRecipe();
  let ids = Object.keys(state.recipes);
  if (modalCtx?.mode === 'recipe' && currentRecipe) {
    ids = ids.filter(id => id !== currentRecipe.id && !wouldCreateCycle(currentRecipe.id, id));
  }
  const cids = Object.keys(state.customIngredients);
  if (!ids.length && !cids.length) {
    wrap.innerHTML = `<div class="search-status" style="display:flex;flex-direction:column;align-items:flex-start;padding:8px">${backBtn}<span style="margin-top:10px;color:var(--text-dim)">No recipes or custom ingredients yet.</span></div>`;
    return;
  }
  let html = `<div style="padding:8px;display:flex;flex-direction:column;gap:0">${backBtn}<div style="margin-top:8px">`;
  if (ids.length) {
    ids.forEach(id => {
      const r     = state.recipes[id];
      const totalG = getRecipeWeightG(r);
      const servG  = Math.round(r.yields > 0 ? totalG / r.yields : totalG);
      const n      = totalG ? getRecipeNutrientsPer100g(r) : {};
      const kcal   = totalG ? Math.round(findNutrientVal(n, 'energy')) : 0;
      const kcalS  = servG ? Math.round(kcal * servG / 100) : 0;
      html += `<div class="result-item" data-action="select-recipe" data-id="${id}">
        <div>
          <div class="result-name">${escapeHtml(r.name)}</div>
          <div class="result-cat">${r.ingredients.length} ingredients · ${r.yields} serving${r.yields !== 1 ? 's' : ''} · ${servG||'?'}g/serving</div>
        </div>
        <div class="result-kcal">${kcalS?kcalS+' kcal/srv':kcal?kcal+' kcal/100g':'—'}</div>
      </div>`;
    });
  }
  if (cids.length) {
    html += `<div style="font-size:10px;text-transform:uppercase;letter-spacing:1.5px;color:var(--text-dimmer);padding:10px 8px 4px;${ids.length ? 'border-top:1px solid var(--border);margin-top:4px' : ''}">Custom Ingredients</div>`;
    cids.forEach(id => {
      const ci   = state.customIngredients[id];
      const ciFood = state.foods['custom_' + id];
      const resolvedN = ciFood?.nutrients || ci.nutrients || {};
      const kcal = Math.round(resolvedN['Energy'] || 0);
      const nb = ciFood?.nutrientBasis;
      const perLabel = !nb ? '100g'
        : nb.unit === 'serving' ? escapeHtml(nb.label || 'serving')
        : nb.unit === 'g' || nb.unit === 'ml' ? `${nb.qty}${nb.unit}`
        : `${nb.qty} ${escapeHtml(nb.unit)}`;
      html += `<div class="result-item" data-action="select-custom-ing" data-id="${id}">
        <div><div class="result-name">${escapeHtml(ci.name)}</div></div>
        <div class="result-kcal">${kcal} kcal/${perLabel}</div>
      </div>`;
    });
  }
  html += '</div></div>';
  wrap.innerHTML = html;
}

export function selectRecipeForMeal(recipeId) {
  const r = state.recipes[recipeId];
  if (!r) return;
  const totalG = getRecipeWeightG(r);
  const servG  = r.yields > 0 ? Math.round(totalG / r.yields) : totalG || 100;
  selectedFood = { type: 'recipe', recipeId, name: r.name };
  document.getElementById('selected-food-name').textContent = r.name;
  const measures = servG > 0
    ? [{ label: 'serving', factor: servG }, { label: 'g', factor: 1 }]
    : [{ label: 'g', factor: 1 }];
  _trackMeasures(null, measures);
  document.getElementById('amount-row').style.display = 'flex';
  const n    = totalG ? getRecipeNutrientsPer100g(r) : {};
  const kcal = Math.round(findNutrientVal(n, 'energy') * servG / 100);
  setSelectionInfo(`${r.yields} serving${r.yields !== 1 ? 's' : ''} · 1 serving ≈ ${servG}g${kcal ? ' · ' + kcal + ' kcal/serving' : ''}`);
  document.getElementById('search-results-wrap').innerHTML = '';
}

export function openFoodManageFromSearch() {
  if (!selectedFood) return;
  if (selectedFood.type === 'recipe') { openRecipeEditor(selectedFood.recipeId); return; }
  if (selectedFood.fdcId?.startsWith('custom_')) { openCustomIngEditor(selectedFood.fdcId.slice(7)); return; }
  openFoodManageModal(null, selectedFood.fdcId, selectedFood);
}

export function refreshSearchModalUnits() {
  if (!selectedFood || selectedFood.type === 'recipe') return;
  const userMeasures = (state.foods?.[selectedFood.fdcId]?.measures || []).filter(m => m.userAdded);
  const displayed = [...userMeasures.filter(ua => !_lastMeasures.some(m => m.label === ua.label)), ..._lastMeasures];
  populateUnitSelector(displayed);
}

export function getFoodsOFFResults() { return _foodsOFFResults; }
