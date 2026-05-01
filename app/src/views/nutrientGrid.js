import { getPct as _getPct, getStatus as _getStatus, fmt } from '../domain/nutrients.js';

const BIG4 = [
  { key: 'Energy',       label: 'Calories' },
  { key: 'Protein',      label: 'Protein' },
  { key: 'Carbohydrate', label: 'Carbs' },
  { key: 'Total lipid',  label: 'Fat' },
];

// Renders the BIG-4 macro summary strip.
// mode 'daily': scale = max(val, target, max); tick position varies.
// mode 'item':  scale capped at target (100%); tick always at 100%.
// clickAttr: 'bkey' (nutrients page) | 'rkey' (recipe detail) | null (no interaction).
export function renderSummaryStrip(totals, targets, macroKeys, { clickAttr = null, mode = 'daily', style = '' } = {}) {
  let html = `<div class="summary-strip"${style ? ` style="${style}"` : ''}>`;
  BIG4.forEach(({ key, label }) => {
    const val = totals[key] || 0;
    const t = targets[key];
    if (!t) return;
    const status = _getStatus(key, val, targets, macroKeys);
    let pct, fillPct, tickHtml;
    if (mode === 'daily') {
      pct = Math.round(val / t.val * 100);
      const scale = Math.max(val, t.val, t.max || 0) || 1;
      fillPct = (val / scale * 100).toFixed(1);
      tickHtml = `<div class="n-bar-tick tick-target" style="left:${(t.val/scale*100).toFixed(1)}%" title="Target: ${fmt(t.val, t.unit)}"></div>`;
    } else {
      pct = _getPct(key, val, targets);
      fillPct = Math.min(100, (val / (t.val || 1)) * 100).toFixed(1);
      tickHtml = `<div class="n-bar-tick tick-target" style="left:100%" title="Daily target: ${fmt(t.val, t.unit)}"></div>`;
    }
    const sc = clickAttr ? 'strip-item blameble' : 'strip-item';
    const sa = clickAttr ? ` data-${clickAttr}="${key}" data-action="${clickAttr === 'bkey' ? 'blame' : 'recipe-blame'}"` : '';
    html += `<div class="${sc}"${sa}>
      <div class="strip-val ${status}">${fmt(val, t.unit)}</div>
      <div class="strip-label">${label}</div>
      <div class="strip-pct ${status}">${pct}%</div>
      <div class="strip-bar-outer">
        <div class="strip-bar-wrap"><div class="strip-bar-fill ${status}" style="width:${fillPct}%"></div></div>
        ${tickHtml}
      </div>
    </div>`;
  });
  html += `</div>`;
  return html;
}

// Renders the per-section nutrient bar grid.
// mode 'daily': proper tick positioning with min/max/target logic.
// mode 'item':  single tick always at 100% of target.
// clickAttr: 'bkey' | 'rkey' | null.
export function renderNutrientGrid(totals, targets, macroKeys, sections, { clickAttr = null, mode = 'daily', padding = '24px', disabledTargets = [] } = {}) {
  const disabled = new Set(disabledTargets);
  let html = `<div class="card" style="padding:${padding}"><div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(340px,1fr));gap:24px 40px">`;
  Object.entries(sections).forEach(([section, keys]) => {
    const visibleKeys = keys.filter(k => !disabled.has(k) && targets[k]);
    if (!visibleKeys.length) return;
    html += `<div class="nutrient-section"><div class="nutrient-section-title">${section}</div>`;
    visibleKeys.forEach(k => {
      const exists = targets[k];
      if (!exists) return;
      const val = totals[k] || 0;
      const t = targets[k];
      const pct = _getPct(k, val, targets);
      const status = _getStatus(k, val, targets, macroKeys);
      let fillPct, ticks;
      if (mode === 'daily') {
        const scale = Math.max(val, t.max || t.val, t.val) || 1;
        fillPct = (val / scale * 100).toFixed(1);
        if (macroKeys.includes(k)) {
          ticks = `<div class="n-bar-tick tick-target" style="left:${(t.val/scale*100).toFixed(1)}%" title="Target: ${fmt(t.val,t.unit)}"></div>`;
        } else if (t.max) {
          ticks = `<div class="n-bar-tick tick-min" style="left:${(t.val/scale*100).toFixed(1)}%" title="Recommended: ${fmt(t.val,t.unit)}"></div><div class="n-bar-tick tick-max" style="left:${(t.max/scale*100).toFixed(1)}%" title="Max (UL): ${fmt(t.max,t.unit)}"></div>`;
        } else {
          ticks = `<div class="n-bar-tick tick-min" style="left:${(t.val/scale*100).toFixed(1)}%" title="Recommended: ${fmt(t.val,t.unit)}"></div>`;
        }
      } else {
        fillPct = Math.min(100, (val / (t.val || 1)) * 100).toFixed(1);
        ticks = `<div class="n-bar-tick tick-target" style="left:100%" title="Daily target: ${fmt(t.val, t.unit)}"></div>`;
      }
      const rowClass = clickAttr ? 'n-row blameble' : 'n-row';
      const rowClick = clickAttr ? ` data-${clickAttr}="${k}" data-action="${clickAttr === 'bkey' ? 'blame' : 'recipe-blame'}"` : '';
      html += `<div class="${rowClass}"${rowClick}>
        <div class="n-label">${t.label}</div>
        <div class="n-bar-outer"><div class="n-bar-wrap"><div class="n-bar ${status}" style="width:${fillPct}%"></div></div>${ticks}</div>
        <div class="n-pct ${status}">${isFinite(pct) ? pct + '%' : '—'}</div>
        <div class="n-val">${fmt(val, t.unit)}</div>
      </div>`;
    });
    html += `</div>`;
  });
  html += `</div></div>`;
  return html;
}
