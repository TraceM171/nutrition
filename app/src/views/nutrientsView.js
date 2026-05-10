import { state } from '../store/store.js';
import { ui } from './uiState.js';
import { DAYS, MEALS, MACRO_KEYS, NUTRIENT_SECTIONS } from '../domain/constants.js';
import { getPct as _getPct, fmt } from '../domain/nutrients.js';
import { sumDay as _sumDay, weeklyAvg as _weeklyAvg } from '../domain/aggregation.js';
import { renderSummaryStrip, renderNutrientGrid } from './nutrientGrid.js';
import { closeBlame } from './blamePanel.js';

function getPct(key, val) { return _getPct(key, val, state.targets); }
function sumDay(day)      { return _sumDay(day, state.plan, MEALS, state.targets, state.recipes, state.foods); }
function weeklyAvg()      { return _weeklyAvg(state.plan, DAYS, MEALS, state.targets, state.recipes, state.foods, state.extraFoods || []); }

export function setAnalysisDay(d) {
  ui.analysisDay = d;
  closeBlame();
  renderNutrients();
}

export function renderNutrients() {
  const wrap = document.getElementById('nutrients-wrap');
  const filledDays = DAYS.filter(d => MEALS.some(m => (state.plan[d][m]||[]).length > 0));

  if (!filledDays.length) {
    wrap.innerHTML = `<div class="empty-msg"><div class="e-icon">🥦</div><div class="e-title">No meals added yet</div><p>Go to Weekly Plan and add some ingredients first.</p></div>`;
    return;
  }

  const { totals } = weeklyAvg();

  let html = `<div class="day-tabs">
    <div class="day-tab ${ui.analysisDay===null?'active':''}" data-action="set-day">Weekly avg</div>`;
  filledDays.forEach(d => {
    html += `<div class="day-tab ${ui.analysisDay===d?'active':''}" data-action="set-day" data-day="${d}">${d.slice(0,3)}</div>`;
  });
  html += `</div>`;
  html += `<div style="font-size:10px;color:var(--text-dimmer);margin:-10px 0 16px;text-align:right">click any nutrient to see what's contributing →</div>`;

  const current = ui.analysisDay ? sumDay(ui.analysisDay) : totals;

  const disabledSet = new Set(state.disabledTargets || []);
  const alerts = [];
  Object.entries(state.targets).forEach(([k, t]) => {
    if (!MACRO_KEYS.includes(k) && disabledSet.has(k)) return;
    const v = current[k] || 0;
    if (MACRO_KEYS.includes(k)) {
      const rawPct = t.val > 0 ? v / t.val * 100 : 0;
      if (rawPct > 110) alerts.push({ key: k, type: 'danger', label: t.label });
      else if (t.val > 0 && rawPct < 90) alerts.push({ key: k, type: 'warn', label: t.label });
    } else {
      if (t.max && v > t.max) alerts.push({ key: k, type: 'danger', label: t.label });
      else if (t.val > 0 && getPct(k, v) < 100) alerts.push({ key: k, type: 'warn', label: t.label });
    }
  });

  const totalTracked = Object.keys(state.targets).filter(k => MACRO_KEYS.includes(k) || !disabledSet.has(k)).length;
  const onTrack      = totalTracked - alerts.length;
  const overTarget   = alerts.filter(a => a.type === 'danger');
  const underTarget  = alerts.filter(a => a.type === 'warn');
  const numColor = onTrack === totalTracked ? 'var(--good)' : onTrack >= totalTracked * 0.7 ? 'var(--warn)' : 'var(--danger)';

  let scoreGroupsHtml = '';
  if (!alerts.length) {
    scoreGroupsHtml = `<div class="score-perfect">✓ All nutrients on track</div>`;
  } else {
    if (overTarget.length) {
      const chips = overTarget.map(a =>
        `<span class="score-chip danger blameble" data-bkey="${a.key}" data-action="blame">${a.label}</span>`
      ).join('');
      scoreGroupsHtml += `<div class="score-group"><span class="score-group-icon danger">⚠</span><div class="score-chips">${chips}</div></div>`;
    }
    if (underTarget.length) {
      const chips = underTarget.map(a =>
        `<span class="score-chip warn blameble" data-bkey="${a.key}" data-action="blame">${a.label}</span>`
      ).join('');
      scoreGroupsHtml += `<div class="score-group"><span class="score-group-icon warn">↓</span><div class="score-chips">${chips}</div></div>`;
    }
  }

  html += `<div class="nutrient-score">
    <div class="score-main">
      <div class="score-num" style="color:${numColor}">${onTrack}<span class="score-denom">/${totalTracked}</span></div>
      <div class="score-sublabel">on track</div>
    </div>
    <div class="score-divider"></div>
    <div class="score-groups">${scoreGroupsHtml}</div>
  </div>`;

  html += renderSummaryStrip(current, state.targets, MACRO_KEYS, { clickAttr: 'bkey', mode: 'daily' });
  html += renderNutrientGrid(current, state.targets, MACRO_KEYS, NUTRIENT_SECTIONS, { clickAttr: 'bkey', mode: 'daily', padding: '24px', disabledTargets: state.disabledTargets || [] });

  wrap.innerHTML = html;
}
