import { state, dispatch } from '../store/store.js';
import { escapeHtml } from './escape.js';
import { genId } from '../domain/id.js';
import { findNutrientVal, netCarbsFromMap, getIngNutrientMap, getDisplayName, getIngredientNutrient } from '../domain/nutrients.js';
import { effectiveAmountG as _effectiveAmountG, getRecipeWeightG as _getRecipeWeightG, getRecipeNutrientsPer100g as _getRecipeNutrientsPer100g } from '../domain/recipes.js';
import { openIngredientDetail, openCurrentRecipeDetail, setRecipeGetter } from './ingredientDetail.js';
import { openUsageModal } from './usageModal.js';
import { bringToFront, resetZ } from './uiState.js';
import { openDeleteConfirm } from './deleteConfirmModal.js';
import { showUndo } from './snackbar.js';

function effectiveAmountG(ing)         { return _effectiveAmountG(ing, state.recipes); }
function getRecipeWeightG(recipe)      { return _getRecipeWeightG(recipe, state.recipes); }
function getRecipeNutrientsPer100g(r)  { return _getRecipeNutrientsPer100g(r, state.recipes, state.foods); }

// ── Module-local state ──────────────────────────────────────────────────────
let currentEditRecipe = null;
let _dragSrcIdx = null;
let _isDraggingHandle = false;
const _recipeStack = [];  // parent recipes when navigating into sub-recipes

function getRecipeUsages(id) {
  const usages = [];
  for (const [day, meals] of Object.entries(state.plan)) {
    for (const [meal, items] of Object.entries(meals)) {
      if ((items || []).some(item => item.type === 'recipe' && item.recipeId === id))
        usages.push({ kind: 'plan', day, meal });
    }
  }
  if ((state.extraFoods || []).some(item => item.type === 'recipe' && item.recipeId === id))
    usages.push({ kind: 'extra' });
  for (const [rid, r] of Object.entries(state.recipes)) {
    if ((r.ingredients || []).some(ing => ing.type === 'recipe' && ing.recipeId === id))
      usages.push({ kind: 'recipe', id: rid, name: r.name });
  }
  return usages;
}


function _syncBackUI() {
  const cancelBtn = document.querySelector('[data-action="close-recipe-editor"]');
  if (cancelBtn) cancelBtn.textContent = _recipeStack.length ? '← Back' : 'Cancel';
}

export function getCurrentEditRecipe() { return currentEditRecipe; }

// Wire the ingredient-detail modal to always get the current recipe from here.
setRecipeGetter(() => currentEditRecipe);

// ── Open / close ────────────────────────────────────────────────────────────
export function openRecipeEditor(id) {
  const el = document.getElementById('recipe-editor');
  if (el.classList.contains('open') && currentEditRecipe && id && currentEditRecipe.id !== id) {
    // Already editing a different recipe — push current to stack and navigate into new one.
    _recipeStack.push(JSON.parse(JSON.stringify(currentEditRecipe)));
    _loadRecipe(id);
    bringToFront(el);
    return;
  }
  _recipeStack.length = 0;
  _loadRecipe(id);
  el.classList.add('open');
  bringToFront(el);
  setTimeout(() => document.getElementById('re-name').focus(), 100);
}

function _loadRecipe(id) {
  if (id && state.recipes[id]) {
    currentEditRecipe = JSON.parse(JSON.stringify(state.recipes[id]));
    document.getElementById('re-title').textContent = 'Edit Recipe';
    document.getElementById('re-delete-btn').style.display = '';
    document.getElementById('re-copy-btn').style.display   = '';
  } else {
    currentEditRecipe = { id: genId(), name: '', yields: 1, yieldUnit: 'servings', ingredients: [] };
    document.getElementById('re-title').textContent = 'New Recipe';
    document.getElementById('re-delete-btn').style.display = 'none';
    document.getElementById('re-copy-btn').style.display   = 'none';
  }
  document.getElementById('re-name').value   = currentEditRecipe.name;
  document.getElementById('re-yields').value = currentEditRecipe.yields;
  renderRecipeEditor();
  _syncBackUI();
}

export function closeRecipeEditor() {
  if (_recipeStack.length) {
    currentEditRecipe = _recipeStack.pop();
    document.getElementById('re-title').textContent = 'Edit Recipe';
    document.getElementById('re-delete-btn').style.display = '';
    document.getElementById('re-copy-btn').style.display   = '';
    document.getElementById('re-name').value   = currentEditRecipe.name;
    document.getElementById('re-yields').value = currentEditRecipe.yields;
    renderRecipeEditor();
    _syncBackUI();
    // If the search/add-ingredient modal is open, bring it back to front
    // (recipe info was opened from there; closing returns to that dialog).
    const searchEl = document.getElementById('modal');
    if (searchEl?.classList.contains('open')) bringToFront(searchEl);
    return;
  }
  const el = document.getElementById('recipe-editor');
  el.classList.remove('open');
  resetZ(el);
  _recipeStack.length = 0;
  currentEditRecipe = null;
  _syncBackUI();
}

// ── Ingredient rendering helpers ────────────────────────────────────────────
function ingMacroLine(ing, idx) {
  const n = getIngNutrientMap(ing, state.recipes, state.foods);
  if (!Object.keys(n).length) return `<div id="re-macros-${idx}" style="font-size:10px;height:14px"></div>`;
  const kcal = Math.round(getIngredientNutrient(ing, 'Energy', state.recipes, state.foods));
  const prot = getIngredientNutrient(ing, 'Protein', state.recipes, state.foods).toFixed(1);
  const carb = getIngredientNutrient(ing, 'Carbohydrate', state.recipes, state.foods).toFixed(1);
  const fat  = getIngredientNutrient(ing, 'Total lipid', state.recipes, state.foods).toFixed(1);
  return `<div id="re-macros-${idx}" data-action="ing-nutrition" data-idx="${idx}" style="font-size:10px;color:var(--text-dimmer);cursor:pointer;align-self:flex-start">${kcal} kcal · P ${prot}g · C ${carb}g · F ${fat}g</div>`;
}

function getRecipeIngMeasures(ing) {
  const unit = ing.unit || 'g';
  const qty  = ing.qty;
  if (ing.type === 'recipe') {
    const r = state.recipes[ing.recipeId];
    const rwG = r ? getRecipeWeightG(r) : 0;
    const currentServG = (r && r.yields > 0 && rwG > 0)
      ? rwG / r.yields
      : (qty > 0 && ing.amountG > 0 ? ing.amountG / qty : 100);
    return [{ label: 'serving', factor: currentServG }, { label: 'g', factor: 1 }];
  }

  const foodMeasures = state.foods?.[ing.fdcId]?.measures;
  if (foodMeasures && foodMeasures.length > 0) {
    const all = [...foodMeasures];
    const mlMeasure = all.find(m => m.label === 'ml');
    if (mlMeasure) {
      const f = mlMeasure.factor;
      if (!all.find(m => m.label === 'tbsp')) all.push({ label: 'tbsp', factor: Math.round(f * 15 * 1000) / 1000 });
      if (!all.find(m => m.label === 'tsp'))  all.push({ label: 'tsp',  factor: Math.round(f * 5  * 1000) / 1000 });
    }
    return all;
  }

  // Fallback: no stored measures — reconstruct from current unit.
  if (qty > 0 && ['ml', 'tbsp', 'tsp'].includes(unit)) {
    const unitFactor = ing.amountG / qty;
    const mlF = unit === 'ml' ? unitFactor : unit === 'tbsp' ? unitFactor / 15 : unitFactor / 5;
    return [
      { label: 'ml',   factor: mlF },
      { label: 'g',    factor: 1 },
      { label: 'tbsp', factor: mlF * 15 },
      { label: 'tsp',  factor: mlF * 5  },
    ];
  }
  return [{ label: unit, factor: qty > 0 ? ing.amountG / qty : 1 }];
}

function recipeUnitWidget(ing, i) {
  const ms = getRecipeIngMeasures(ing);
  const opts = ms.map(m =>
    `<option value="${escapeHtml(m.label)}" data-factor="${m.factor}"${m.label === (ing.unit||'g') ? ' selected' : ''}>${escapeHtml(m.label)}</option>`
  ).join('');
  const disabled = ms.length === 1 ? ' disabled' : '';
  return `<select class="unit-select" data-action="recipe-ing-unit" data-idx="${i}" style="font-size:10px;padding:3px 5px;width:46px"${disabled}>${opts}</select>`;
}

// ── Render ──────────────────────────────────────────────────────────────────
export function renderRecipeEditor() {
  if (!currentEditRecipe) return;
  const ings = currentEditRecipe.ingredients;
  let html = '';
  if (!ings.length) {
    html = '<div style="padding:24px;text-align:center;color:var(--text-dim);font-size:12px">No ingredients yet — click + Add ingredient below</div>';
  } else {
    ings.forEach((ing, i) => {
      const isRec    = ing.type === 'recipe';
      const isCustom = !isRec && String(ing.fdcId || '').startsWith('custom_');
      const badge = isRec ? `<span class="re-badge rec">REC</span>` : `<span class="re-badge food">FOOD</span>`;
      const dispName = isRec ? ing.name : (getDisplayName(ing.fdcId, state.foods, state.foodAliases) || ing.name);
      const detailTitle = isRec ? 'Open sub-recipe' : (isCustom ? 'Edit ingredient' : 'Manage food');
      const subR = isRec ? state.recipes[ing.recipeId] : null;
      const yieldsWarn = subR && !(subR.yields > 0)
        ? `<div style="font-size:10px;color:var(--warn)">⚠ Sub-recipe has no yields set — open it to fix serving size</div>`
        : '';
      html += `<div class="re-ing-row" draggable="true" data-ing-idx="${i}" style="flex-direction:column;align-items:stretch;gap:3px">
        <div style="display:flex;align-items:center;gap:8px">
          <span class="re-drag-handle" title="Drag to reorder">⠿</span>
          ${badge}
          <span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;cursor:pointer;text-decoration:underline;text-decoration-color:var(--border2);text-underline-offset:3px" title="${detailTitle}" data-action="ing-detail" data-type="${ing.type}" data-fdcid="${escapeHtml(ing.fdcId || '')}" data-idx="${i}">${escapeHtml(dispName)}</span>
          <input type="number" class="amount-input" value="${Math.round((ing.qty !== undefined ? ing.qty : ing.amountG) * 100) / 100}" min="1" style="width:65px;text-align:right"
            data-action="recipe-ing-amount" data-idx="${i}">
          ${recipeUnitWidget(ing, i)}
          <button class="chip-remove" data-action="remove-recipe-ing" data-idx="${i}" style="font-size:14px">×</button>
        </div>
        ${ingMacroLine(ing, i)}${yieldsWarn}
      </div>`;
    });
  }
  document.getElementById('re-ingredients-list').innerHTML = html;
  updateRecipeNutritionStrip();
}

export function updateRecipeNutritionStrip() {
  const strip = document.getElementById('re-nutrition-strip');
  if (!currentEditRecipe) return;
  const totalG = getRecipeWeightG(currentEditRecipe);
  if (!totalG) { strip.innerHTML = '<span style="color:var(--text-dimmer)">Add ingredients to see nutrition</span>'; return; }
  const n       = getRecipeNutrientsPer100g(currentEditRecipe);
  const kcal100 = findNutrientVal(n, 'energy');
  const prot100 = findNutrientVal(n, 'protein');
  const carb100 = netCarbsFromMap(n);
  const fat100  = findNutrientVal(n, 'lipid') || findNutrientVal(n, 'fat');
  const yields  = parseInt(document.getElementById('re-yields').value) || currentEditRecipe.yields || 1;
  const servG   = Math.round(totalG / yields);
  const scale   = servG / 100;
  const kcalS   = Math.round(kcal100 * scale);
  const protS   = prot100 * scale;
  const carbS   = carb100 * scale;
  const fatS    = fat100  * scale;
  strip.innerHTML = `
    <span><strong>${Math.round(totalG * 10) / 10}g</strong> total · <strong>${servG}g</strong>/serving</span>
    <span>per serving: <strong>${kcalS||'—'} kcal</strong></span>
    <span style="color:var(--text-dimmer)">P ${protS?protS.toFixed(1)+'g':'—'} · C ${carbS?carbS.toFixed(1)+'g':'—'} · F ${fatS?fatS.toFixed(1)+'g':'—'}</span>
  `;
}

// ── Ingredient mutations ────────────────────────────────────────────────────
export function updateRecipeIngAmount(idx, val) {
  if (!currentEditRecipe) return;
  const v = parseFloat(val);
  if (v > 0) {
    const ing = currentEditRecipe.ingredients[idx];
    if (state.foods?.[ing.fdcId]?.nutrientBasis?.unit === 'serving') {
      ing.qty = v;
    } else if (ing.type === 'recipe' && ing.unit === 'serving') {
      const r = state.recipes[ing.recipeId];
      const rwG = r ? getRecipeWeightG(r) : 0;
      const servG = (r && r.yields > 0 && rwG > 0) ? rwG / r.yields : (ing.qty > 0 && ing.amountG > 0 ? ing.amountG / ing.qty : 100);
      ing.amountG = Math.round(v * servG * 10) / 10;
      ing.qty = v;
    } else if (ing.qty !== undefined && ing.qty > 0) {
      ing.amountG = Math.round(v * (ing.amountG / ing.qty) * 10) / 10;
      ing.qty = v;
    } else {
      ing.amountG = v;
    }
  }
  updateRecipeNutritionStrip();
  const el = document.getElementById('re-macros-' + idx);
  if (el) el.outerHTML = ingMacroLine(currentEditRecipe.ingredients[idx], idx);
}

export function updateRecipeIngUnit(idx, newLabel, newFactor) {
  const ing = currentEditRecipe?.ingredients[idx];
  if (!ing) return;
  ing.qty  = Math.round(ing.amountG / parseFloat(newFactor) * 10) / 10 || 1;
  ing.unit = newLabel;
  renderRecipeEditor();
}

export function removeRecipeIngredient(idx) {
  if (!currentEditRecipe) return;
  currentEditRecipe.ingredients.splice(idx, 1);
  renderRecipeEditor();
}

function _moveIngTo(src, dst) {
  if (!currentEditRecipe) return;
  const ings = currentEditRecipe.ingredients;
  if (src === dst || src < 0 || dst < 0 || src >= ings.length || dst >= ings.length) return;
  const [item] = ings.splice(src, 1);
  ings.splice(dst, 0, item);
  renderRecipeEditor();
}

export function initIngDnd() {
  const list = document.getElementById('re-ingredients-list');
  if (!list) return;

  list.addEventListener('mousedown', e => {
    _isDraggingHandle = !!e.target.closest('.re-drag-handle');
  });

  list.addEventListener('dragstart', e => {
    if (!_isDraggingHandle) { e.preventDefault(); return; }
    const row = e.target.closest('[data-ing-idx]');
    if (!row) return;
    _dragSrcIdx = parseInt(row.dataset.ingIdx);
    e.dataTransfer.effectAllowed = 'move';
    row.classList.add('re-ing-dragging');
  });

  list.addEventListener('dragover', e => {
    const row = e.target.closest('[data-ing-idx]');
    if (!row) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    list.querySelectorAll('.re-ing-drag-over').forEach(el => el.classList.remove('re-ing-drag-over'));
    if (parseInt(row.dataset.ingIdx) !== _dragSrcIdx) row.classList.add('re-ing-drag-over');
  });

  list.addEventListener('dragleave', e => {
    if (!list.contains(e.relatedTarget))
      list.querySelectorAll('.re-ing-drag-over').forEach(el => el.classList.remove('re-ing-drag-over'));
  });

  list.addEventListener('drop', e => {
    e.preventDefault();
    const row = e.target.closest('[data-ing-idx]');
    list.querySelectorAll('.re-ing-drag-over, .re-ing-dragging').forEach(el =>
      el.classList.remove('re-ing-drag-over', 're-ing-dragging'));
    if (row && _dragSrcIdx !== null) _moveIngTo(_dragSrcIdx, parseInt(row.dataset.ingIdx));
    _dragSrcIdx = null;
  });

  list.addEventListener('dragend', () => {
    list.querySelectorAll('.re-ing-drag-over, .re-ing-dragging').forEach(el =>
      el.classList.remove('re-ing-drag-over', 're-ing-dragging'));
    _dragSrcIdx = null;
  });
}

// Called by searchModal.confirmAdd when modalCtx.mode === 'recipe'
export function addIngredientToCurrentRecipe(ing) {
  if (!currentEditRecipe) return;
  currentEditRecipe.ingredients.push(ing);
  renderRecipeEditor();
}

// ── Save / delete / copy ────────────────────────────────────────────────────
export function saveCurrentRecipe() {
  if (!currentEditRecipe) return;
  currentEditRecipe.name      = document.getElementById('re-name').value.trim() || 'Unnamed Recipe';
  currentEditRecipe.yields    = parseInt(document.getElementById('re-yields').value) || 1;
  currentEditRecipe.yieldUnit = 'servings';

  // Reject duplicate names (different id).
  const duplicateRecipe = Object.values(state.recipes).find(
    r => r.name.trim().toLowerCase() === currentEditRecipe.name.toLowerCase() && r.id !== currentEditRecipe.id
  );
  if (duplicateRecipe) {
    const nameEl = document.getElementById('re-name');
    nameEl.style.outline = '2px solid var(--warn)';
    setTimeout(() => { nameEl.style.outline = ''; }, 1800);
    alert(`A recipe named "${duplicateRecipe.name}" already exists.`);
    return;
  }

  const oldRecipe = state.recipes[currentEditRecipe.id]
    ? JSON.parse(JSON.stringify(state.recipes[currentEditRecipe.id]))
    : null;
  const savedName = currentEditRecipe.name;
  const savedId   = currentEditRecipe.id;
  dispatch({ type: 'RECIPE_SAVE', payload: currentEditRecipe });
  closeRecipeEditor();
  if (oldRecipe) {
    showUndo(`Saved "${savedName}"`, () => dispatch({ type: 'RECIPE_SAVE', payload: oldRecipe }));
  } else {
    showUndo(`Created "${savedName}"`, () => dispatch({ type: 'RECIPE_DELETE', payload: { id: savedId } }));
  }
}

export function confirmDeleteRecipe() {
  if (!currentEditRecipe) return;
  const usages = getRecipeUsages(currentEditRecipe.id);
  if (usages.length) { openUsageModal('recipe', currentEditRecipe.id, currentEditRecipe.name); return; }
  const snapshot = JSON.parse(JSON.stringify(currentEditRecipe));
  openDeleteConfirm(currentEditRecipe.name, () => {
    dispatch({ type: 'RECIPE_DELETE', payload: { id: snapshot.id } });
    closeRecipeEditor();
    showUndo(`Deleted recipe "${snapshot.name}"`, () => dispatch({ type: 'RECIPE_SAVE', payload: snapshot }));
  });
}

export function copyCurrentRecipe() {
  if (!currentEditRecipe) return;
  const copy = JSON.parse(JSON.stringify(currentEditRecipe));
  copy.id   = genId();
  copy.name = currentEditRecipe.name + ' (copy)';
  dispatch({ type: 'RECIPE_COPY', payload: copy });
  closeRecipeEditor();
  showUndo(`Copied "${currentEditRecipe.name}"`, () => dispatch({ type: 'RECIPE_DELETE', payload: { id: copy.id } }));
}

export function openIngOrRecipeDetail(idx) {
  if (!currentEditRecipe) return;
  const ing = currentEditRecipe.ingredients[idx];
  if (!ing || ing.type !== 'recipe') return;
  if (!state.recipes[ing.recipeId]) return;
  _recipeStack.push(JSON.parse(JSON.stringify(currentEditRecipe)));
  _loadRecipe(ing.recipeId);
}

export { openIngredientDetail, openCurrentRecipeDetail };
