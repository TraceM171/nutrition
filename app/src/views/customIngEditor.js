import { state, dispatch } from '../store/store.js';
import { escapeHtml } from './escape.js';
import { genId } from '../domain/id.js';
import { resolveBasisG } from '../domain/units.js';
import { copyCustomIng } from './recipesView.js';
import { openUsageModal } from './usageModal.js';
import { openDeleteConfirm } from './deleteConfirmModal.js';
import { showUndo } from './snackbar.js';
import { bringToFront, resetZ } from './uiState.js';
import { openFoodNutritionDetail, changeFoodCarbBasis, setForkEditorOpener } from './ingredientDetail.js';
setForkEditorOpener(openCustomIngEditorForFork);

// Fields available in the optional micros section of the custom ingredient editor.
const CUSTOM_ING_MICRO_FIELDS = [
  { section: 'Other', fields: [
    { key: 'Fiber, total dietary',        label: 'Fiber',        unit: 'g'  },
    { key: 'Sugars, added',               label: 'Added Sugar',  unit: 'g'  },
    { key: 'Fatty acids, total omega-3',  label: 'Omega-3',      unit: 'g'  },
  ]},
  { section: 'Key Minerals', fields: [
    { key: 'Sodium, Na',    label: 'Sodium',     unit: 'mg' },
    { key: 'Calcium, Ca',   label: 'Calcium',    unit: 'mg' },
    { key: 'Iron, Fe',      label: 'Iron',       unit: 'mg' },
    { key: 'Magnesium, Mg', label: 'Magnesium',  unit: 'mg' },
    { key: 'Potassium, K',  label: 'Potassium',  unit: 'mg' },
    { key: 'Zinc, Zn',      label: 'Zinc',       unit: 'mg' },
    { key: 'Selenium, Se',  label: 'Selenium',   unit: 'µg' },
    { key: 'Iodine, I',     label: 'Iodine',     unit: 'µg' },
    { key: 'Manganese, Mn', label: 'Manganese',  unit: 'mg' },
    { key: 'Phosphorus, P', label: 'Phosphorus', unit: 'mg' },
  ]},
  { section: 'Vitamins', fields: [
    { key: 'Vitamin A, RAE',                 label: 'Vitamin A',      unit: 'µg' },
    { key: 'Vitamin C, total ascorbic acid', label: 'Vitamin C',      unit: 'mg' },
    { key: 'Vitamin D',                      label: 'Vitamin D',      unit: 'IU' },
    { key: 'Vitamin E (alpha-tocopherol)',    label: 'Vitamin E',      unit: 'mg' },
    { key: 'Vitamin K (phylloquinone)',       label: 'Vitamin K',      unit: 'µg' },
    { key: 'Thiamin',                         label: 'B1 Thiamine',    unit: 'mg' },
    { key: 'Riboflavin',                      label: 'B2 Riboflavin',  unit: 'mg' },
    { key: 'Niacin',                          label: 'B3 Niacin',      unit: 'mg' },
    { key: 'Pantothenic acid',                label: 'B5 Pantothenic', unit: 'mg' },
    { key: 'Vitamin B-6',                     label: 'B6',             unit: 'mg' },
    { key: 'Vitamin B-12',                    label: 'B12',            unit: 'µg' },
    { key: 'Folate, total',                   label: 'Folate',         unit: 'µg' },
  ]},
  { section: 'Amino Acids', fields: [
    { key: 'Histidine',     label: 'Histidine',     unit: 'g' },
    { key: 'Isoleucine',    label: 'Isoleucine',    unit: 'g' },
    { key: 'Leucine',       label: 'Leucine',       unit: 'g' },
    { key: 'Lysine',        label: 'Lysine',        unit: 'g' },
    { key: 'Methionine',    label: 'Methionine',    unit: 'g' },
    { key: 'Cystine',       label: 'Cystine',       unit: 'g' },
    { key: 'Phenylalanine', label: 'Phenylalanine', unit: 'g' },
    { key: 'Tyrosine',      label: 'Tyrosine',      unit: 'g' },
    { key: 'Threonine',     label: 'Threonine',     unit: 'g' },
    { key: 'Tryptophan',    label: 'Tryptophan',    unit: 'g' },
    { key: 'Valine',        label: 'Valine',        unit: 'g' },
  ]},
];

let _editingCustomIngId = null;
let _forkSourceFdcId   = null;  // set when opening editor via Fork
let _prevBasisG        = null;  // grams equivalent of current basis, for rescaling

function getCustomIngUsages(id) {
  const fdcId = 'custom_' + id;
  const usages = [];
  for (const [day, meals] of Object.entries(state.plan)) {
    for (const [meal, items] of Object.entries(meals)) {
      if ((items || []).some(item => item.fdcId === fdcId))
        usages.push({ kind: 'plan', day, meal });
    }
  }
  if ((state.extraFoods || []).some(item => item.fdcId === fdcId))
    usages.push({ kind: 'extra' });
  for (const [rid, r] of Object.entries(state.recipes)) {
    if ((r.ingredients || []).some(ing => ing.fdcId === fdcId))
      usages.push({ kind: 'recipe', id: rid, name: r.name });
  }
  return usages;
}


function _fieldInput(key, val, backedVal, step, placeholder, isForked) {
  const overrideSet = isForked && val !== '';
  const phText      = isForked && backedVal !== '' ? escapeHtml(String(backedVal)) : escapeHtml(placeholder);
  const resetBtn    = overrideSet
    ? `<button data-action="cie-reset-key" data-key="${escapeHtml(key)}" title="Reset to inherited value" style="background:none;border:none;color:var(--text-dimmer);cursor:pointer;font-size:11px;padding:0 2px;flex-shrink:0">✕</button>`
    : '';
  return `<div style="display:flex;align-items:center;gap:3px">
    <input class="tgt-input" type="number" data-cie-key="${escapeHtml(key)}" min="0" step="${escapeHtml(step)}" placeholder="${phText}" value="${val}" style="width:100%;${isForked && !overrideSet ? 'opacity:0.55' : ''}">
    ${resetBtn}
  </div>`;
}

function _getBasis(ci) {
  if (ci?.nutrientBasis) return ci.nutrientBasis;
  if (ci?.backedByFdcId && state.foods[ci.backedByFdcId]?.measures?.some(m => m.label === 'ml'))
    return { qty: 100, unit: 'ml' };
  return { qty: 100, unit: 'g' };
}

function _getUserMeasure(fdcId) {
  return state.foods?.[fdcId]?.measures?.find(m => m.userAdded) || null;
}


function _currentFoodMeasures() {
  if (_editingCustomIngId) return state.foods?.['custom_' + _editingCustomIngId]?.measures || [];
  if (_forkSourceFdcId)    return state.foods?.[_forkSourceFdcId]?.measures || [];
  return [];
}

function _basisToGrams(qty, unit) {
  if (!(qty > 0)) return null;
  if (unit === 'g') return qty;
  if (unit === 'serving') return null;
  const measures = _currentFoodMeasures();
  const m = measures.find(me => me.label === unit);
  return qty * (m ? m.factor : 1);
}

function _rescaleNutrientInputs(oldG, newG) {
  if (!(oldG > 0) || !(newG > 0) || oldG === newG) return;
  const scale = newG / oldG;
  document.querySelectorAll('#cie-body input[data-cie-key]').forEach(inp => {
    if (inp.value !== '') {
      const v = parseFloat(inp.value);
      if (!isNaN(v)) inp.value = parseFloat((v * scale).toPrecision(6));
    } else if (inp.placeholder) {
      // Inherited (no override): update placeholder so it reflects the new basis visually.
      // The store applies cross-basis scaling at save time — no override needed here.
      const v = parseFloat(inp.placeholder);
      if (!isNaN(v)) inp.placeholder = String(parseFloat((v * scale).toPrecision(6)));
    }
  });
}

function _perLabelFromBasis(basis) {
  return basis.unit === 'serving' ? `per ${basis.label || 'serving'}` : `per ${basis.qty}${basis.unit}`;
}


function _getAllUserMeasures(fdcId) {
  return (state.foods?.[fdcId]?.measures || []).filter(m => m.userAdded);
}

function _basisOptionLabel(basis) {
  if (!basis || basis.unit === 'g') return `${basis?.qty ?? 100} g`;
  if (basis.unit === 'serving') return basis.label || 'custom';
  return `${basis.qty} ${basis.unit}`;
}

function _servingsSelectHtml(basisLabel, servings) {
  const header = `<div style="font-size:10px;text-transform:uppercase;letter-spacing:2px;color:var(--text-dimmer);margin-bottom:8px">Custom Servings</div>`;
  const rows = servings.map(s =>
    `<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;font-size:13px">
      <span style="flex:1">${escapeHtml(s.label)} — ${+s.factor.toFixed(3)} g</span>
      <button class="btn sm" type="button" data-action="cie-remove-serving" data-label="${escapeHtml(s.label)}" style="font-size:11px;color:var(--danger)">Remove</button>
    </div>`
  ).join('');
  return header + rows + `<button class="btn sm" type="button" data-action="cie-add-serving" style="font-size:11px">+ Add custom serving</button>`;
}


function renderCustomIngEditor(ci, backedNutrients) {
  const isForked    = !!(ci?.backedByFdcId);
  const overrides   = isForked ? (ci.nutrientOverrides || {}) : null;
  const backedRaw   = isForked ? (backedNutrients || {}) : {};
  const n           = isForked ? overrides : ((ci && ci.nutrients) || {});
  const basis       = _getBasis(ci);
  const perLabel    = _perLabelFromBasis(basis);

  // Scale backed values from backed food's basis to fork's current basis so placeholders
  // show the correct per-fork-basis values (e.g. backed 36 kcal/100g → 90 kcal/cup at 250g).
  let crossScale = 1;
  if (isForked && ci.backedByFdcId && _prevBasisG) {
    const backedBasisG = resolveBasisG(state.foods[ci.backedByFdcId]);
    if (backedBasisG) crossScale = _prevBasisG / backedBasisG;
  }
  const backed = crossScale === 1 ? backedRaw : Object.fromEntries(
    Object.entries(backedRaw).map(([k, v]) => [k, parseFloat((v * crossScale).toPrecision(6))])
  );
  const macros = [
    { key: 'Energy',                      label: 'Energy',                              unit: 'kcal', step: '1',   placeholder: 'e.g. 350' },
    { key: 'Protein',                     label: 'Protein',                             unit: 'g',    step: '0.1', placeholder: 'e.g. 12'  },
    { key: 'Carbohydrate, by difference', label: isForked ? 'Carbohydrates' : 'Net carbs', unit: 'g', step: '0.1', placeholder: 'e.g. 40' },
    { key: 'Total lipid (fat)',            label: 'Fat',                                 unit: 'g',    step: '0.1', placeholder: 'e.g. 8'   },
  ];
  const allMicroKeys = CUSTOM_ING_MICRO_FIELDS.flatMap(s => s.fields.map(f => f.key));
  const hasOptionals = isForked
    ? allMicroKeys.some(k => (overrides[k] != null && overrides[k] !== 0) || (backed[k] != null && backed[k] !== 0))
    : allMicroKeys.some(k => n[k] != null && n[k] !== 0);

  let html = '';
  if (isForked) {
    const backedFdcEsc = escapeHtml(ci.backedByFdcId);
    const backedBasis  = state.foods[ci.backedByFdcId]?.carbBasis || 'net';
    html += `<div id="cie-forked-banner" style="margin-bottom:14px;padding:8px 12px;background:var(--sidebar-bg);border-radius:6px;border-left:3px solid var(--accent);font-size:12px;color:var(--text-dim)">
      ⎇ Forked from: <button data-action="cie-view-backed-food" data-fdcid="${backedFdcEsc}" style="background:none;border:none;color:var(--accent);cursor:pointer;font-size:12px;padding:0;text-decoration:underline">${escapeHtml(ci.backedByName || ci.backedByFdcId)}</button>
      <span style="font-size:10px;color:var(--text-dimmer);display:block;margin-top:2px">Empty fields inherit the original value. Type to override; ✕ to reset.</span>
      <div style="margin-top:6px;font-size:10px;display:flex;align-items:center;gap:5px;color:var(--text-dimmer)">Backed carb basis:
        <button class="btn sm${backedBasis === 'net' ? ' primary' : ''}" data-action="cie-backed-carb-basis" data-basis="net" data-fdcid="${backedFdcEsc}" style="font-size:9px;padding:1px 6px">Net</button>
        <button class="btn sm${backedBasis === 'total' ? ' primary' : ''}" data-action="cie-backed-carb-basis" data-basis="total" data-fdcid="${backedFdcEsc}" style="font-size:9px;padding:1px 6px">Total</button>
      </div>
    </div>`;
  }

  if (!isForked) {
    const basisUnitVal = basis.unit === 'serving' ? (basis.label || 'serving') : (basis.unit || 'g');
    html += `<div style="margin-bottom:16px;padding-bottom:16px;border-bottom:1px solid var(--border)">
      <div style="font-size:10px;text-transform:uppercase;letter-spacing:2px;color:var(--text-dimmer);margin-bottom:8px">Nutrients per</div>
      <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
        <input class="tgt-input" type="number" id="cie-basis-qty" data-action="cie-basis-qty-change" value="${basis.qty}" min="0.001" step="1" style="width:64px">
        <input class="tgt-input" type="text" id="cie-basis-unit" data-action="cie-basis-unit-change" placeholder="g" value="${escapeHtml(basisUnitVal)}" style="width:88px">
      </div>
    </div>`;
  }

  if (ci?.id) {
    const fdcId = 'custom_' + ci.id;
    const basisLabel = isForked ? _basisOptionLabel(_getBasis(ci)) : _basisOptionLabel(basis);
    const servings   = _getAllUserMeasures(fdcId);
    html += `<div id="cie-serving-row" style="margin-bottom:16px;padding-bottom:16px;border-bottom:1px solid var(--border)">${_servingsSelectHtml(basisLabel, servings)}</div>`;
  }

  html += `<div class="cie-section-label" style="font-size:10px;text-transform:uppercase;letter-spacing:2px;color:var(--text-dimmer);margin-bottom:14px">Macros — <strong style="color:var(--text-dim)"><span class="cie-per-label">${perLabel}</span></strong>${isForked ? '' : ' (required)'}</div>`;
  html += `<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:20px">`;
  macros.forEach(m => {
    let val = n[m.key] != null ? n[m.key] : '';
    if (!isForked && m.key === 'Carbohydrate, by difference' && val !== '') {
      val = parseFloat(Math.max(0, val - (n['Fiber, total dietary'] || 0)).toFixed(4));
    }
    html += `<div>
      <label style="font-size:11px;color:var(--text-dim);display:block;margin-bottom:4px">${m.label} <span style="color:var(--text-dimmer)">(${m.unit})</span></label>
      ${_fieldInput(m.key, val, backed[m.key] ?? '', m.step, m.placeholder, isForked)}
    </div>`;
  });
  html += `</div>`;

  html += `<div style="border-top:1px solid var(--border);padding-top:14px">
    <button class="btn sm" type="button" data-action="cie-micros-toggle" style="font-size:11px;margin-bottom:14px" data-open="${hasOptionals ? 'true' : 'false'}">
      ${hasOptionals ? '▴ Hide optional nutrients' : '▾ Show optional nutrients'}
    </button>
    <div id="cie-optionals" style="display:${hasOptionals ? 'block' : 'none'}">`;

  CUSTOM_ING_MICRO_FIELDS.forEach(({ section, fields }) => {
    html += `<div style="margin-bottom:16px">
      <div class="cie-section-label" style="font-size:10px;text-transform:uppercase;letter-spacing:2px;color:var(--text-dimmer);margin-bottom:10px">${section} — <span class="cie-per-label">${perLabel}</span></div>
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px">`;
    fields.forEach(f => {
      const val = n[f.key] != null ? n[f.key] : '';
      html += `<div>
        <label style="font-size:10px;color:var(--text-dim);display:block;margin-bottom:3px">${f.label} <span style="color:var(--text-dimmer)">(${f.unit})</span></label>
        ${_fieldInput(f.key, val, backed[f.key] ?? '', 'any', '', isForked)}
      </div>`;
    });
    html += `</div></div>`;
  });
  html += `</div></div>`;
  document.getElementById('cie-body').innerHTML = html;
}

export function cieBasisUnitLive(unit) {
  const unitTrimmed = (unit || '').trim() || 'g';
  const qty = parseFloat(document.getElementById('cie-basis-qty')?.value) || 100;
  document.querySelectorAll('#cie-body .cie-per-label').forEach(el => { el.textContent = `per ${qty}${unitTrimmed}`; });
}

export function cieBasisUnitChange(unit) {
  const unitTrimmed = (unit || '').trim() || 'g';
  const qtyEl = document.getElementById('cie-basis-qty');
  const qty = parseFloat(qtyEl?.value) || 100;
  const newBasisG = _basisToGrams(qty, unitTrimmed);
  _rescaleNutrientInputs(_prevBasisG, newBasisG);
  _prevBasisG = newBasisG;
  document.querySelectorAll('#cie-body .cie-per-label').forEach(el => { el.textContent = `per ${qty}${unitTrimmed}`; });
  refreshCieServing();
}

export function cieBasisQtyChange() {
  const qty  = parseFloat(document.getElementById('cie-basis-qty')?.value) || 100;
  const unit = (document.getElementById('cie-basis-unit')?.value || '').trim() || 'g';
  const newBasisG = _basisToGrams(qty, unit);
  _rescaleNutrientInputs(_prevBasisG, newBasisG);
  _prevBasisG = newBasisG;
  document.querySelectorAll('#cie-body .cie-per-label').forEach(el => { el.textContent = `per ${qty}${unit}`; });
}

export function toggleCieMicros(btn) {
  const open = btn.dataset.open !== 'true';
  btn.dataset.open = open ? 'true' : 'false';
  btn.textContent  = open ? '▴ Hide optional nutrients' : '▾ Show optional nutrients';
  document.getElementById('cie-optionals').style.display = open ? 'block' : 'none';
}

export function openCustomIngEditor(id) {
  _forkSourceFdcId    = null;
  _editingCustomIngId = id || null;
  const isNew    = !id;
  const ci       = id ? state.customIngredients[id] : null;
  const isForked = !!(ci?.backedByFdcId);
  document.getElementById('cie-title').textContent = isNew ? 'New Custom Ingredient' : 'Edit Custom Ingredient';
  document.getElementById('cie-copy-btn').style.display = (isNew || isForked) ? 'none' : '';
  document.getElementById('cie-delete-btn').style.display = isNew ? 'none' : '';
  document.getElementById('cie-nutrition-btn').style.display = isNew ? 'none' : '';
  document.getElementById('cie-name').value = ci?.name || '';
  const backedNutrients = ci?.backedByFdcId ? state.foods[ci.backedByFdcId]?.nutrients : null;
  const basis0 = _getBasis(ci);
  _prevBasisG = _basisToGrams(basis0.qty, basis0.unit);
  renderCustomIngEditor(ci, backedNutrients);
  const cieEl = document.getElementById('custom-ing-editor');
  cieEl.classList.add('open');
  bringToFront(cieEl);
  setTimeout(() => document.getElementById('cie-name').focus(), 100);
}

function _servingDisplayHtml(fdcId, cs) {
  return `<div style="font-size:10px;text-transform:uppercase;letter-spacing:2px;color:var(--text-dimmer);margin-bottom:8px">Custom Serving</div>
    ${cs
      ? `<div style="display:flex;align-items:center;gap:8px;font-size:13px">${escapeHtml(cs.label)} — ${+cs.factor.toFixed(3)}g
          <button class="btn sm" type="button" data-action="cie-edit-serving" style="font-size:11px">Edit</button>
          <button class="btn sm" type="button" data-action="cie-del-serving" style="font-size:11px;color:var(--danger)">Remove</button>
        </div>`
      : `<button class="btn sm" type="button" data-action="cie-edit-serving" style="font-size:11px">+ Add custom serving</button>`
    }`;
}

function _servingFormHtml(cs, basisUnit = 'g') {
  return `<div style="font-size:10px;text-transform:uppercase;letter-spacing:2px;color:var(--text-dimmer);margin-bottom:8px">Custom Serving</div>
    <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
      <input class="tgt-input" type="text" id="cie-srv-label" placeholder="Label (e.g. cup)" value="${escapeHtml(cs?.label || '')}" style="flex:1;min-width:120px;max-width:180px">
      <input class="tgt-input" type="number" id="cie-srv-amount" placeholder="amount" value="${cs?.factor != null ? +cs.factor.toFixed(3) : ''}" min="0.01" step="0.1" style="width:80px">
      <span style="font-size:12px;color:var(--text-dim);padding:0 4px">${escapeHtml(basisUnit)}</span>
      <button class="btn sm primary" type="button" data-action="cie-save-serving">Save</button>
      <button class="btn sm" type="button" data-action="cie-cancel-serving">Cancel</button>
    </div>`;
}

function _getForkedServingUnits(ci) {
  const units = [{ label: 'g', factor: 1 }];
  (state.foods[ci.backedByFdcId]?.measures || []).forEach(m => {
    if (m.label === 'g') return;
    const ex = units.find(u => u.label === m.label);
    if (ex) ex.factor = m.factor;
    else units.push({ label: m.label, factor: m.factor });
  });
  if (_editingCustomIngId) {
    (state.foods['custom_' + _editingCustomIngId]?.measures || [])
      .filter(m => m.userAdded && !units.some(u => u.label === m.label))
      .forEach(m => units.push({ label: m.label, factor: m.factor }));
  }
  const basis = _getBasis(ci);
  const basisUnit = basis.unit === 'serving' ? (basis.label || 'serving') : basis.unit;
  if (basisUnit && basisUnit !== 'g' && basisUnit !== 'ml' && !units.some(u => u.label === basisUnit))
    units.push({ label: basisUnit, factor: _basisToGrams(1, basisUnit) ?? 1 });
  return units;
}

function _servingFormHtmlWithSelect(cs, units) {
  const unitCtrl = units.length > 1
    ? `<select id="cie-srv-unit" class="tgt-input" style="width:80px">${
        units.map(u => `<option value="${+u.factor.toFixed(3)}"${cs?.unit === u.label ? ' selected' : ''}>${escapeHtml(u.label)}</option>`).join('')
      }</select>`
    : `<span style="font-size:12px;color:var(--text-dim);padding:0 4px">${escapeHtml(units[0]?.label || 'g')}</span>`;
  return `<div style="font-size:10px;text-transform:uppercase;letter-spacing:2px;color:var(--text-dimmer);margin-bottom:8px">Custom Serving</div>
    <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
      <input class="tgt-input" type="text" id="cie-srv-label" placeholder="Label (e.g. cup)" value="${escapeHtml(cs?.label || '')}" style="flex:1;min-width:120px;max-width:180px">
      <input class="tgt-input" type="number" id="cie-srv-amount" placeholder="amount" value="${cs?.factor != null ? +cs.factor.toFixed(3) : ''}" min="0.01" step="0.1" style="width:80px">
      ${unitCtrl}
      <button class="btn sm primary" type="button" data-action="cie-save-serving">Save</button>
      <button class="btn sm" type="button" data-action="cie-cancel-serving">Cancel</button>
    </div>`;
}

export function refreshCieServing() {
  const row = document.getElementById('cie-serving-row');
  if (!row || !_editingCustomIngId) return;
  const fdcId   = 'custom_' + _editingCustomIngId;
  const ci      = state.customIngredients[_editingCustomIngId];
  const servings = _getAllUserMeasures(fdcId);
  // Prefer live form values for basis label; fall back to saved state.
  const unitEl = document.getElementById('cie-basis-unit');
  let basisLabel;
  if (unitEl) {
    const unit = (unitEl.value || '').trim() || 'g';
    const qty  = parseFloat(document.getElementById('cie-basis-qty')?.value) || 100;
    basisLabel = `${qty} ${unit}`;
  } else {
    basisLabel = _basisOptionLabel(_getBasis(ci));
  }
  row.innerHTML = _servingsSelectHtml(basisLabel, servings);
}

export function showCieServingForm() {
  const row = document.getElementById('cie-serving-row');
  if (!row || !_editingCustomIngId) return;
  const ci = state.customIngredients[_editingCustomIngId];
  if (ci?.backedByFdcId) {
    row.innerHTML = _servingFormHtmlWithSelect(null, _getForkedServingUnits(ci));
  } else {
    const basisUnitEl = document.getElementById('cie-basis-unit');
    const basisUnit = basisUnitEl
      ? (basisUnitEl.value.trim() || 'g')
      : (() => { const b = _getBasis(ci); return b.unit === 'serving' ? (b.label || 'serving') : (b.unit || 'g'); })();
    row.innerHTML = _servingFormHtml(null, basisUnit);
  }
  row.querySelector('#cie-srv-label')?.focus();
}

export function removeSelectedCieServing(el) {
  if (!_editingCustomIngId) return;
  const label = el?.dataset?.label;
  if (!label) return;
  const fdcId   = 'custom_' + _editingCustomIngId;
  const measure = _getAllUserMeasures(fdcId).find(m => m.label === label);
  if (!measure) return;
  dispatch({ type: 'FOOD_MEASURE_DEL', payload: { fdcId, label } });
  refreshCieServing();
  showUndo(`Removed "${label}"`, () => {
    dispatch({ type: 'FOOD_MEASURE_SET', payload: { fdcId, label: measure.label, factor: measure.factor } });
    refreshCieServing();
  });
}

export function deleteCieServing() {
  if (!_editingCustomIngId) return;
  const fdcId = 'custom_' + _editingCustomIngId;
  const prev  = _getUserMeasure(fdcId);
  if (prev) dispatch({ type: 'FOOD_MEASURE_DEL', payload: { fdcId, label: prev.label } });
  refreshCieServing();
  if (prev) showUndo('Removed serving', () => {
    dispatch({ type: 'FOOD_MEASURE_SET', payload: { fdcId, label: prev.label, factor: prev.factor } });
    refreshCieServing();
  });
}

const _RESERVED_UNIT_LABELS = new Set(['g', 'ml']);

export function saveCieServing() {
  if (!_editingCustomIngId) return;
  const fdcId = 'custom_' + _editingCustomIngId;
  const label = document.getElementById('cie-srv-label')?.value.trim();
  const amount = parseFloat(document.getElementById('cie-srv-amount')?.value);
  if (!label || !amount || amount <= 0) {
    document.getElementById(label ? 'cie-srv-amount' : 'cie-srv-label')?.focus();
    return;
  }
  if (_RESERVED_UNIT_LABELS.has(label)) {
    alert(`"${label}" is a built-in unit name — choose a different label.`);
    document.getElementById('cie-srv-label')?.focus();
    return;
  }
  const srvUnitEl = document.getElementById('cie-srv-unit');
  let factor;
  if (srvUnitEl) {
    factor = Math.round(amount * (parseFloat(srvUnitEl.value) || 1) * 1000) / 1000;
  } else {
    const ci = state.customIngredients[_editingCustomIngId];
    const basisUnitEl = document.getElementById('cie-basis-unit');
    const basisUnit = basisUnitEl
      ? (basisUnitEl.value.trim() || 'g')
      : (() => { const b = _getBasis(ci); return b.unit === 'serving' ? (b.label || 'g') : (b.unit || 'g'); })();
    factor = Math.round(amount * (_basisToGrams(1, basisUnit) ?? 1) * 1000) / 1000;
  }
  const prev = _getUserMeasure(fdcId);
  dispatch({ type: 'FOOD_MEASURE_SET', payload: { fdcId, label, factor } });
  refreshCieServing();
  const undoFn = prev
    ? () => dispatch({ type: 'FOOD_MEASURE_SET', payload: { fdcId, label: prev.label, factor: prev.factor } })
    : () => dispatch({ type: 'FOOD_MEASURE_DEL', payload: { fdcId, label } });
  showUndo('Saved serving', undoFn);
}

export function viewCieNutrition() {
  if (!_editingCustomIngId) return;
  openFoodNutritionDetail('custom_' + _editingCustomIngId);
}

export function openCustomIngEditorForFork(fdcId) {
  const food = state.foods[fdcId];
  if (!food) return;
  _forkSourceFdcId    = fdcId;
  _editingCustomIngId = null;
  document.getElementById('cie-title').textContent = 'Fork as Custom Ingredient';
  document.getElementById('cie-copy-btn').style.display      = 'none';
  document.getElementById('cie-delete-btn').style.display    = 'none';
  document.getElementById('cie-nutrition-btn').style.display = 'none';
  document.getElementById('cie-name').value = food.name;
  const fakeCi = { backedByFdcId: fdcId, backedByName: food.name, nutrientOverrides: {} };
  const basisF = _getBasis(fakeCi);
  _prevBasisG = _basisToGrams(basisF.qty, basisF.unit);
  renderCustomIngEditor(fakeCi, food.nutrients);
  const cieEl2 = document.getElementById('custom-ing-editor');
  cieEl2.classList.add('open');
  bringToFront(cieEl2);
  setTimeout(() => document.getElementById('cie-name').focus(), 100);
}

export function resetCieField(key) {
  const input = document.querySelector(`#cie-body input[data-cie-key="${CSS.escape(key)}"]`);
  if (input) { input.value = ''; input.dispatchEvent(new Event('input', { bubbles: true })); }
}

export function closeCustomIngEditor() {
  const el = document.getElementById('custom-ing-editor');
  el.classList.remove('open');
  resetZ(el);
  _editingCustomIngId = null;
  _forkSourceFdcId    = null;
  _prevBasisG         = null;
}

export function saveCustomIng() {
  const name = document.getElementById('cie-name').value.trim();
  if (!name) { document.getElementById('cie-name').focus(); return; }

  const existingCi0 = _editingCustomIngId ? state.customIngredients[_editingCustomIngId] : null;
  let basisUnit, basisQty;
  const basisUnitEl = document.getElementById('cie-basis-unit');
  const basisQtyEl  = document.getElementById('cie-basis-qty');
  if (basisUnitEl && basisQtyEl) {
    basisUnit = (basisUnitEl.value.trim() || 'g');
    const basisQtyRaw = parseFloat(basisQtyEl.value);
    basisQty  = basisQtyRaw > 0 ? basisQtyRaw : 100;
    if (!(basisQtyRaw > 0)) {
      basisQtyEl.focus(); basisQtyEl.select();
      basisQtyEl.style.outline = '2px solid var(--warn)';
      setTimeout(() => { basisQtyEl.style.outline = ''; }, 1800);
      return;
    }
  } else {
    const savedBasis = existingCi0?.nutrientBasis;
    const savedUnit  = savedBasis?.unit ?? 'g';
    basisUnit = savedUnit === 'serving' ? (savedBasis?.label || 'serving') : savedUnit;
    basisQty  = savedBasis?.qty ?? 100;
  }
  const id = _editingCustomIngId || genId();

  // Reject duplicate names (different id).
  const duplicate = Object.values(state.customIngredients).find(
    c => c.name.trim().toLowerCase() === name.toLowerCase() && c.id !== id
  );
  if (duplicate) {
    const nameEl = document.getElementById('cie-name');
    nameEl.style.outline = '2px solid var(--warn)';
    setTimeout(() => { nameEl.style.outline = ''; }, 1800);
    alert(`A custom ingredient named "${duplicate.name}" already exists.`);
    return;
  }

  // Collect only filled inputs — in fork mode these are overrides; in normal mode these are nutrients.
  const collected = {};
  document.querySelectorAll('#cie-body input[data-cie-key]').forEach(input => {
    const v = parseFloat(input.value);
    if (!isNaN(v)) collected[input.dataset.cieKey] = v;
  });

  const backedByFdcId = _forkSourceFdcId || existingCi0?.backedByFdcId || null;

  if (!backedByFdcId && collected['Carbohydrate, by difference'] != null) {
    collected['Carbohydrate, by difference'] += (collected['Fiber, total dietary'] || 0);
  }

  const ci = { id, name };
  if (backedByFdcId) {
    const backedName = state.foods[backedByFdcId]?.name || existingCi0?.backedByName || backedByFdcId;
    ci.backedByFdcId   = backedByFdcId;
    ci.backedByName    = backedName;
    ci.nutrientOverrides = collected;
  } else {
    ci.nutrients = collected;
  }
  ci.nutrientBasis = { qty: basisQty, unit: basisUnit };
  const oldSnapshot = existingCi0 ? JSON.parse(JSON.stringify(existingCi0)) : null;
  dispatch({ type: 'CUSTOM_ING_SAVE', payload: ci });
  closeCustomIngEditor();
  if (oldSnapshot) {
    showUndo(`Saved "${ci.name}"`, () => dispatch({ type: 'CUSTOM_ING_SAVE', payload: oldSnapshot }));
  } else {
    const savedId = ci.id, savedName = ci.name;
    showUndo(`Created "${savedName}"`, () => dispatch({ type: 'CUSTOM_ING_DELETE', payload: { id: savedId } }));
  }
}

export function deleteCustomIng() {
  if (!_editingCustomIngId) return;
  const usages = getCustomIngUsages(_editingCustomIngId);
  if (usages.length) {
    const ci = state.customIngredients[_editingCustomIngId];
    openUsageModal('custom', _editingCustomIngId, ci?.name || 'this ingredient');
    return;
  }
  const ci = state.customIngredients[_editingCustomIngId];
  const snapshot = JSON.parse(JSON.stringify(ci));
  openDeleteConfirm(ci?.name || 'this ingredient', () => {
    dispatch({ type: 'CUSTOM_ING_DELETE', payload: { id: _editingCustomIngId } });
    closeCustomIngEditor();
    showUndo(`Deleted "${snapshot.name}"`, () => dispatch({ type: 'CUSTOM_ING_SAVE', payload: snapshot }));
  });
}

export function copyCustomIngFromEditor() {
  if (!_editingCustomIngId) return;
  copyCustomIng(_editingCustomIngId);
  closeCustomIngEditor();
}

// selectCustomIng populates the search modal unit selector then shows amount row.
// Imported by searchModal, but defined here since it needs _editingCustomIngId context.
// Actually selectCustomIng only needs `state`, `populateUnitSelector`, `escapeHtml` —
// it has no dependency on _editingCustomIngId. Exporting from here for logical grouping.
export function selectCustomIng(id, { populateUnitSelector, selectedFoodSetter }) {
  const ci = state.customIngredients[id];
  if (!ci) return;
  const resolvedNutrients = state.foods['custom_' + id]?.nutrients || ci.nutrients || {};
  selectedFoodSetter({ fdcId: 'custom_' + id, name: ci.name, nutrients: resolvedNutrients, customIngId: id });
  document.getElementById('selected-food-name').textContent = ci.name;
  const measures = state.foods['custom_' + id]?.measures;
  const basisUnit  = ci.nutrientBasis?.unit || 'g';
  const basisLabel = ci.nutrientBasis?.label || basisUnit;
  populateUnitSelector(measures || [{ label: basisUnit === 'serving' ? basisLabel : basisUnit, factor: 1 }]);
  document.getElementById('amount-row').style.display = 'flex';
  document.getElementById('search-results-wrap').innerHTML = '';
}
