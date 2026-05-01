import { state, dispatch } from '../store/store.js';
import { escapeHtml } from './escape.js';
import { ui, bringToFront, resetZ } from './uiState.js';
import { MACRO_KEYS, NUTRIENT_SECTIONS } from '../domain/constants.js';
import { getIngredientNutrient as _getIngredientNutrient, getDisplayName } from '../domain/nutrients.js';
import { getRecipeWeightG as _getRecipeWeightG } from '../domain/recipes.js';
import { renderSummaryStrip, renderNutrientGrid } from './nutrientGrid.js';
// getCurrentEditRecipe imported lazily via getter to avoid circular dep
let _getRecipe = null;
export function setRecipeGetter(fn) { _getRecipe = fn; }

function getIngredientNutrient(ing, key) { return _getIngredientNutrient(ing, key, state.recipes, state.foods); }

// ── Food manage modal state ─────────────────────────────────────────────────
let _managedIngIdx = null;
let _managedFdcId  = null;

export function openFoodManageModal(idx, fdcId) {
  _managedIngIdx = idx;
  _managedFdcId  = fdcId;
  const food    = state.foods[fdcId];
  const isCustom = fdcId?.startsWith('custom_');
  const fdcEsc  = escapeHtml(fdcId);

  document.getElementById('fm-title').textContent = food?.name || fdcId;

  let actHtml = '';
  if (!isCustom) {
    actHtml += `<div style="font-size:12px;color:var(--text-dim);line-height:1.5;margin-bottom:10px">This food comes from an external database and cannot be edited directly. Fork it to create a local custom ingredient you can fully override.</div>`;
    actHtml += `<button class="btn sm primary" data-action="food-fork" data-fdcid="${fdcEsc}" style="width:100%">⎇ Fork as custom ingredient</button>`;
    actHtml += `<button class="btn sm" data-action="food-refresh" data-fdcid="${fdcEsc}" style="width:100%;margin-top:6px">↻ Refresh from source</button>`;
  }

  if (fdcId?.startsWith('off_')) {
    const curBasis = food?.carbBasis || 'net';
    actHtml += `<div style="margin-top:10px;padding-top:10px;border-top:1px solid var(--border);display:flex;align-items:center;justify-content:space-between;font-size:11px;color:var(--text-dim)">
      <span>Carb basis: <b>${curBasis}</b></span>
      <button class="btn sm" data-action="fm-carb-basis-dialog" data-fdcid="${fdcEsc}" style="font-size:10px;padding:2px 8px">Change…</button>
    </div>`;
  }

  const fakeIng = { fdcId, amountG: 100 };
  const kcal = Math.round(getIngredientNutrient(fakeIng, 'Energy'));
  const prot = getIngredientNutrient(fakeIng, 'Protein').toFixed(1);
  const carb = getIngredientNutrient(fakeIng, 'Carbohydrate').toFixed(1);
  const fat  = getIngredientNutrient(fakeIng, 'Total lipid').toFixed(1);
  if (kcal || +prot || +carb || +fat) {
    actHtml += `<div data-action="fm-view-nutrition" role="button" style="margin-top:12px;cursor:pointer;padding:8px 10px;border:1px solid var(--border);border-radius:6px;display:flex;align-items:center;justify-content:space-between;gap:8px">
      <div style="font-size:11px;color:var(--text-dim)">${kcal} kcal &nbsp;·&nbsp; P ${prot}g &nbsp;·&nbsp; C ${carb}g &nbsp;·&nbsp; F ${fat}g <span style="font-size:10px;color:var(--text-dimmer)">per 100g</span></div>
      <span style="font-size:13px;color:var(--text-dim)">→</span>
    </div>`;
  }

  document.getElementById('fm-actions').innerHTML = actHtml;
  const fmEl = document.getElementById('food-manage-modal');
  fmEl.classList.add('open');
  bringToFront(fmEl);
}

export function closeFoodManageModal() {
  const el = document.getElementById('food-manage-modal');
  el.classList.remove('open');
  resetZ(el);
  _managedIngIdx = null;
  _managedFdcId  = null;
}

export function refreshFoodManageModal() {
  if (_managedFdcId !== null) openFoodManageModal(_managedIngIdx, _managedFdcId);
}

export function openIngDetailFromManage() {
  const idx = _managedIngIdx;
  closeFoodManageModal();
  if (idx !== null) openIngredientDetail(idx);
}

export function openFoodNutritionDetailFromManage() {
  const fdcId = _managedFdcId;
  closeFoodManageModal();
  if (fdcId) openFoodNutritionDetail(fdcId);
}

export function openFoodNutritionDetail(fdcId) {
  const food = state.foods[fdcId];
  if (!food) return;
  const totals = {};
  Object.keys(state.targets).forEach(k => { totals[k] = getIngredientNutrient({ fdcId, amountG: 100 }, k); });
  showNutritionDetail(food.name, 'per 100g · % of daily target shown on bars', totals, null);
}

export function showNutritionDetail(title, sub, totals, recipeForBlame) {
  ui.blameDetailRecipe = recipeForBlame || null;
  document.getElementById('ing-detail-title').textContent = title;
  document.getElementById('ing-detail-sub').textContent   = sub;
  const renameEl = document.getElementById('ing-detail-rename');
  if (renameEl) renameEl.style.display = 'none';

  const clickAttr = recipeForBlame ? 'rkey' : null;
  let html = renderSummaryStrip(totals, state.targets, MACRO_KEYS, { clickAttr, mode: 'daily', style: 'margin-bottom:20px' });
  html += renderNutrientGrid(totals, state.targets, MACRO_KEYS, NUTRIENT_SECTIONS, { clickAttr, mode: 'daily', padding: '20px', disabledTargets: state.disabledTargets || [] });
  if (recipeForBlame) html += `<div style="font-size:10px;color:var(--text-dimmer);padding:8px 20px 4px;text-align:right">click any nutrient to see what's contributing →</div>`;

  document.getElementById('ing-detail-body').innerHTML = html;
  const idEl = document.getElementById('ing-detail-modal');
  idEl.classList.add('open');
  bringToFront(idEl);
}

export function openIngredientDetail(idx) {
  const recipe = _getRecipe?.();
  if (!recipe) return;
  const ing = recipe.ingredients[idx];
  if (!ing) return;
  const totals = {};
  Object.keys(state.targets).forEach(k => { totals[k] = getIngredientNutrient(ing, k); });
  const recipeCtx = ing.type === 'recipe' ? state.recipes[ing.recipeId] : null;
  const dispName = ing.type === 'recipe' ? ing.name : (getDisplayName(ing.fdcId, state.foods, state.foodAliases) || ing.name);
  showNutritionDetail(
    dispName,
    `${Math.round((ing.qty !== undefined ? ing.qty : ing.amountG) * 100) / 100}${ing.unit || 'g'} · % of daily target shown on bars`,
    totals,
    recipeCtx,
  );
}

export function openCurrentRecipeDetail() {
  const recipe = _getRecipe?.();
  if (!recipe) return;
  const totalG = _getRecipeWeightG(recipe, state.recipes);
  const yields = recipe.yields || 1;
  const servG  = totalG > 0 ? Math.round(totalG / yields) : 100;
  const totals = {};
  Object.keys(state.targets).forEach(k => {
    totals[k] = _getIngredientNutrient({ type: 'recipe', recipeId: recipe.id, amountG: servG }, k, state.recipes, state.foods);
  });
  const subLabel = totalG > 0
    ? `${servG}g/serving · % of daily target shown on bars`
    : 'per serving · % of daily target shown on bars';
  showNutritionDetail(`${recipe.name} (per serving)`, subLabel, totals, recipe);
}

export function closeIngDetail() {
  ui.blameDetailRecipe = null;
  const el = document.getElementById('ing-detail-modal');
  el.classList.remove('open');
  resetZ(el);
}

export function closeIngDetailIfBg(e) {
  if (e.target === document.getElementById('ing-detail-modal')) closeIngDetail();
}

// Re-normalizes carbs for an OFF food when the user corrects the carb basis.
// Reverse-engineers the label carb value from stored totals + old basis, then applies new basis.
export function changeFoodCarbBasis(fdcId, basis) {
  const food = state.foods[fdcId];
  if (!food) return;
  const storedCarbs = food.nutrients?.['Carbohydrate, by difference'] || 0;
  const fiber       = food.nutrients?.['Fiber, total dietary'] || 0;
  const oldBasis    = food.carbBasis || 'net';
  const rawCarbs    = oldBasis === 'total' ? storedCarbs : Math.max(0, storedCarbs - fiber);
  const newTotal    = basis === 'net' ? rawCarbs + fiber : rawCarbs;
  dispatch({ type: 'FOODS_UPSERT', payload: { [fdcId]: { ...food, nutrients: { ...food.nutrients, 'Carbohydrate, by difference': Math.max(0, newTotal) }, carbBasis: basis } } });
}
