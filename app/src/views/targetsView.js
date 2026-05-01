import { state, dispatch } from '../store/store.js';
import { showUndo } from './snackbar.js';
import { calcTargetsFromProfile, deriveMacrosFromKcal } from '../domain/targets.js';
import { MACRO_KEYS, NUTRIENT_SECTIONS } from '../domain/constants.js';

export function renderTargets() {
  document.getElementById('prof-sex').value      = state.userProfile.sex      || 'male';
  document.getElementById('prof-age').value      = state.userProfile.age      || 30;
  document.getElementById('prof-weight').value   = state.userProfile.weight   || 75;
  document.getElementById('prof-height').value   = state.userProfile.height   || 175;
  document.getElementById('prof-activity').value = state.userProfile.activity || 'moderate';
  const mp = state.userProfile.macroPct || { p: 25, c: 45, f: 30 };
  document.getElementById('macro-protein-pct').value = mp.p;
  document.getElementById('macro-carbs-pct').value   = mp.c;
  document.getElementById('macro-fat-pct').value     = mp.f;
  updateMacroTotal();

  const adj        = state.userProfile.goalAdj ?? 0;
  const presetVals = ['-500', '0', '300'];
  const presetMatch = presetVals.find(v => parseInt(v) === adj);
  document.getElementById('prof-goal').value            = presetMatch ?? 'custom';
  document.getElementById('prof-adj').value             = adj;
  document.getElementById('prof-adj-row').style.display = presetMatch ? 'none' : 'flex';

  const grid = document.getElementById('targets-grid');
  let html = `<div class="tgt-col-headers">
    <div class="tgt-col-spacer"></div>
    <div class="tgt-col-header">Recommended</div>
    <div class="tgt-col-header">Max (UL)</div>
  </div>`;

  html += `<div class="tgt-section-hdr">Macros</div>`;
  ['Energy', 'Protein', 'Carbohydrate', 'Total lipid'].forEach(k => {
    const t = state.targets[k];
    if (!t) return;
    const updateAttr = k === 'Energy' ? ' data-action="update-macro-total"' : '';
    html += `<div class="tgt-row">
      <label class="tgt-label">${t.label} <span class="tgt-unit">${t.unit}</span></label>
      <input class="tgt-input" type="number" id="tgt_${k}" value="${t.val}" step="any"${updateAttr}>
      <input class="tgt-input" type="number" id="tgt_${k}_max" value="" step="any" placeholder="none" disabled style="opacity:0.35">
    </div>`;
  });

  const disabled = new Set(state.disabledTargets || []);
  Object.entries(NUTRIENT_SECTIONS).forEach(([section, keys]) => {
    html += `<div class="tgt-section-hdr">${section}</div>`;
    keys.forEach(k => {
      const t = state.targets[k];
      if (!t) return;
      const hasMax = t.max !== null && t.max !== undefined;
      const isDisabled = disabled.has(k);
      html += `<div class="tgt-row${isDisabled ? ' tgt-row--off' : ''}">
        <label class="tgt-label">${t.label} <span class="tgt-unit">${t.unit}</span></label>
        <input class="tgt-input" type="number" id="tgt_${k}" value="${t.val}" step="any"${isDisabled ? ' disabled' : ''}>
        <input class="tgt-input" type="number" id="tgt_${k}_max" value="${hasMax ? t.max : ''}" step="any" placeholder="none"${isDisabled ? ' disabled' : ''}>
        <label class="tgt-toggle" title="${isDisabled ? 'Enable' : 'Disable'} this target">
          <input type="checkbox" id="tgt_on_${k}"${isDisabled ? '' : ' checked'} data-action="toggle-target" data-key="${k}">
          <span class="tgt-toggle-track"></span>
        </label>
      </div>`;
    });
  });
  grid.innerHTML = html;
}

export function saveTargets() {
  const goalSel    = document.getElementById('prof-goal').value;
  const newProfile = {
    ...state.userProfile,
    sex:      document.getElementById('prof-sex').value,
    age:      parseInt(document.getElementById('prof-age').value)      || 30,
    weight:   parseFloat(document.getElementById('prof-weight').value) || 75,
    height:   parseFloat(document.getElementById('prof-height').value) || 175,
    activity: document.getElementById('prof-activity').value,
    goalAdj:  goalSel === 'custom'
      ? (parseInt(document.getElementById('prof-adj').value) || 0)
      : parseInt(goalSel),
    macroPct: {
      p: parseInt(document.getElementById('macro-protein-pct').value) || 0,
      c: parseInt(document.getElementById('macro-carbs-pct').value)   || 0,
      f: parseInt(document.getElementById('macro-fat-pct').value)     || 0,
    },
  };
  const newTargets = {};
  Object.keys(state.targets).forEach(k => {
    const el    = document.getElementById('tgt_' + k);
    const maxEl = document.getElementById('tgt_' + k + '_max');
    // Read stored value directly for disabled inputs (their .value is still set in DOM)
    const rawVal = el ? el.getAttribute('value') : null;
    const v     = el    ? parseFloat(el.value || rawVal)    : NaN;
    const maxV  = maxEl ? parseFloat(maxEl.value) : NaN;
    newTargets[k] = { ...state.targets[k], val: isNaN(v) ? state.targets[k].val : v, max: isNaN(maxV) ? null : maxV };
  });
  const newDisabled = Object.keys(state.targets).filter(k => {
    if (MACRO_KEYS.includes(k)) return false;
    const cb = document.getElementById('tgt_on_' + k);
    return cb ? !cb.checked : false;
  });
  const oldTargets  = JSON.parse(JSON.stringify(state.targets));
  const oldProfile  = JSON.parse(JSON.stringify(state.userProfile));
  const oldDisabled = [...state.disabledTargets];
  dispatch({ type: 'TARGETS_SAVE', payload: { targets: newTargets, userProfile: newProfile, disabledTargets: newDisabled } });
  showUndo('Saved targets', () => dispatch({ type: 'TARGETS_SAVE', payload: { targets: oldTargets, userProfile: oldProfile, disabledTargets: oldDisabled } }));
  // Navigation to nutrients page is triggered by the TARGETS_SAVE subscriber in init()
}

export function applyProfileTargets() {
  const goalSel = document.getElementById('prof-goal').value;
  const goalAdj = goalSel === 'custom'
    ? (parseInt(document.getElementById('prof-adj').value) || 0)
    : parseInt(goalSel);
  const profile = {
    ...state.userProfile,
    sex:      document.getElementById('prof-sex').value,
    age:      parseInt(document.getElementById('prof-age').value)      || 30,
    weight:   parseFloat(document.getElementById('prof-weight').value) || 75,
    height:   parseFloat(document.getElementById('prof-height').value) || 175,
    activity: document.getElementById('prof-activity').value,
    goalAdj,
  };
  const calc = calcTargetsFromProfile(profile);
  const pp   = parseInt(document.getElementById('macro-protein-pct').value) || 0;
  const cp   = parseInt(document.getElementById('macro-carbs-pct').value)   || 0;
  const fp   = parseInt(document.getElementById('macro-fat-pct').value)     || 0;
  if (pp + cp + fp === 100) {
    const m = deriveMacrosFromKcal(calc['Energy'], { p: pp, c: cp, f: fp });
    calc['Protein']      = m.protein;
    calc['Carbohydrate'] = m.carbs;
    calc['Total lipid']  = m.fat;
  }
  Object.entries(calc).forEach(([k, v]) => {
    const el = document.getElementById('tgt_' + k);
    if (el) el.value = v;
  });
  updateMacroTotal();
}

export function onGoalPresetChange() {
  const sel    = document.getElementById('prof-goal').value;
  const adjRow = document.getElementById('prof-adj-row');
  if (sel === 'custom') {
    adjRow.style.display = 'flex';
    document.getElementById('prof-adj').focus();
  } else {
    adjRow.style.display = 'none';
    document.getElementById('prof-adj').value = sel;
  }
}

export function updateMacroTotal() {
  const p = parseInt(document.getElementById('macro-protein-pct').value) || 0;
  const c = parseInt(document.getElementById('macro-carbs-pct').value)   || 0;
  const f = parseInt(document.getElementById('macro-fat-pct').value)     || 0;
  const total = p + c + f;
  const badge = document.getElementById('macro-total-badge');
  badge.textContent  = total + '%';
  const ok           = total === 100;
  badge.style.background = ok ? 'var(--good-bg)' : 'var(--danger-bg)';
  badge.style.color      = ok ? 'var(--good)'    : 'var(--danger)';
}
