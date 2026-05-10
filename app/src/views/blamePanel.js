import { state } from '../store/store.js';
import { getStatus as _getStatus, getPct as _getPct, fmt } from '../domain/nutrients.js';
import { sumDay as _sumDay, weeklyAvg as _weeklyAvg } from '../domain/aggregation.js';
import { buildBlameNode as _buildBlameNode, getDayBlameTree as _getDayBlameTree, getWeeklyBlameTree as _getWeeklyBlameTree } from '../domain/blame.js';
import { escapeHtml } from './escape.js';
import { ui } from './uiState.js';
import { DAYS, MEALS, MACRO_KEYS } from '../domain/constants.js';

function getPct(key, val)    { return _getPct(key, val, state.targets); }
function sumDay(day)         { return _sumDay(day, state.plan, MEALS, state.targets, state.recipes, state.foods); }
function weeklyAvg()         { return _weeklyAvg(state.plan, DAYS, MEALS, state.targets, state.recipes, state.foods, state.extraFoods || []); }
function buildBlameNode(ing, nutrientKey, scaleFactor) { return _buildBlameNode(ing, nutrientKey, scaleFactor, state.recipes, state.foods, state.foodAliases); }
function getDayBlameTree(day, key)  { return _getDayBlameTree(day, key, state.plan, MEALS, state.recipes, state.foods, state.foodAliases); }
function getWeeklyBlameTree(key)    { return _getWeeklyBlameTree(key, state.plan, DAYS, MEALS, state.recipes, state.foods, state.extraFoods || [], state.foodAliases); }

// ── Module-local blame state ────────────────────────────────────────────────
let blameKey           = null;
let blameMode          = 'subtotal'; // 'subtotal' | 'target'
let blameSubtotalLabel = '% of day';
let blameIsRecipe      = false;

// ── Pure rendering (exported for backward compat) ───────────────────────────

export function renderBlameNodes(nodes, dayTotal, targetVal, unit, mode, depth = 0) {
  let html = '';
  nodes.forEach((node, idx) => {
    const denom = mode === 'target' ? targetVal : dayTotal;
    const pct   = denom > 0 ? Math.round(node.value / denom * 100) : 0;
    const barW  = Math.min(100, pct);
    const isLeaf = !node.children;
    const nmClass = isLeaf ? 'blame-nm blame-leaf' : 'blame-nm';
    const extra = depth === 0 && idx === 0 ? ' blame-first' : '';
    const leafAction = isLeaf && (node.fdcId || node.recipeId)
      ? ` data-action="blame-leaf-open"${node.fdcId ? ` data-fdcid="${escapeHtml(node.fdcId)}"` : ''}${node.recipeId ? ` data-recipeid="${escapeHtml(node.recipeId)}"` : ''}`
      : '';
    const row = `<div class="blame-node d${depth}${extra}">
      <span class="blame-tog"></span>
      <span class="${nmClass}"${leafAction}>${escapeHtml(node.name)}</span>
      <div class="blame-bar-w"><div class="blame-bar-bg"><div class="blame-bar-fg" style="width:${barW}%"></div></div></div>
      <span class="blame-pct">${pct}%</span>
      <span class="blame-val">${fmt(node.value, unit)}</span>
    </div>`;
    if (node.children) {
      html += `<details class="blame-grp" open><summary>${row}</summary>${renderBlameNodes(node.children, dayTotal, targetVal, unit, mode, depth + 1)}</details>`;
    } else {
      html += row;
    }
  });
  return html;
}

export function renderBlameHeaderBar(key, total, targets, macroKeys) {
  const t = targets[key];
  if (!t) return;
  const scale = Math.max(total, t.max || t.val, t.val) || 1;
  let ticksHtml;
  if (macroKeys.includes(key)) {
    ticksHtml = `<div class="n-bar-tick tick-target" style="left:${(t.val/scale*100).toFixed(1)}%" title="Target: ${fmt(t.val,t.unit)}"></div>`;
  } else if (t.max) {
    ticksHtml = `<div class="n-bar-tick tick-min" style="left:${(t.val/scale*100).toFixed(1)}%" title="Recommended: ${fmt(t.val,t.unit)}"></div><div class="n-bar-tick tick-max" style="left:${(t.max/scale*100).toFixed(1)}%" title="Max (UL): ${fmt(t.max,t.unit)}"></div>`;
  } else {
    ticksHtml = `<div class="n-bar-tick tick-min" style="left:${(t.val/scale*100).toFixed(1)}%" title="Recommended: ${fmt(t.val,t.unit)}"></div>`;
  }
  const status = _getStatus(key, total, targets, macroKeys);
  const barEl = document.getElementById('blame-hdr-bar-outer');
  barEl.style.display = '';
  barEl.innerHTML = `<div class="blame-hdr-bar-wrap"><div class="blame-hdr-bar-fill ${status}" style="width:${(total/scale*100).toFixed(1)}%"></div></div>${ticksHtml}`;
}

// ── Blame panel controls ────────────────────────────────────────────────────

export function blameExpandAll()   { document.querySelectorAll('#blame-tree details').forEach(d => d.open = true);  }
export function blameCollapseAll() { document.querySelectorAll('#blame-tree details').forEach(d => d.open = false); }

export function toggleBlameMode() {
  blameMode = blameMode === 'subtotal' ? 'target' : 'subtotal';
  document.getElementById('blame-mode-btn').textContent =
    blameMode === 'subtotal' ? blameSubtotalLabel : '% of target';
  refreshBlameTree();
}

export function refreshBlameTree() {
  if (!blameKey) return;
  if (blameIsRecipe) _renderRecipeBlameContent(blameKey);
  else if (ui.analysisDay) _renderDayBlameContent(blameKey);
  else _renderWeeklyBlameContent(blameKey);
}

function _treeHtml(nodes, total, target, unit) {
  return nodes.length
    ? renderBlameNodes(nodes, total, target, unit, blameMode, 0)
    : `<div style="padding:20px;color:var(--text-dimmer);font-size:12px">No data</div>`;
}

function _renderDayBlameContent(key) {
  const t = state.targets[key];
  const dayTotal = (sumDay(ui.analysisDay))[key] || 0;
  const meals    = getDayBlameTree(ui.analysisDay, key);
  document.getElementById('blame-hdr-day').textContent   = ui.analysisDay;
  document.getElementById('blame-hdr-name').textContent  = t.label;
  const pctDay = getPct(key, dayTotal);
  document.getElementById('blame-hdr-total').textContent =
    `${fmt(dayTotal, t.unit)} · ${isFinite(pctDay) ? pctDay + '% of target' : 'no target set'}`;
  renderBlameHeaderBar(key, dayTotal, state.targets, MACRO_KEYS);
  document.getElementById('blame-tree').innerHTML = _treeHtml(meals, dayTotal, t.val, t.unit);
}

function _renderWeeklyBlameContent(key) {
  const t = state.targets[key];
  const { totals } = weeklyAvg();
  const weeklyTotal = (totals && totals[key]) || 0;
  const days = getWeeklyBlameTree(key);
  document.getElementById('blame-hdr-day').textContent   = 'Weekly avg';
  document.getElementById('blame-hdr-name').textContent  = t.label;
  const pctWeek = getPct(key, weeklyTotal);
  document.getElementById('blame-hdr-total').textContent =
    `${fmt(weeklyTotal, t.unit)} avg · ${isFinite(pctWeek) ? pctWeek + '% of target' : 'no target set'}`;
  renderBlameHeaderBar(key, weeklyTotal, state.targets, MACRO_KEYS);
  document.getElementById('blame-tree').innerHTML = _treeHtml(days, weeklyTotal, t.val, t.unit);
}

function _renderRecipeBlameContent(key) {
  const recipe = ui.blameDetailRecipe;
  const t      = state.targets[key];
  const yields = recipe.yields || 1;
  const items  = recipe.ingredients
    .map(ing => buildBlameNode(ing, key, 1 / yields))
    .filter(n => n.value > 0.0005)
    .sort((a, b) => b.value - a.value);
  const servingTotal = items.reduce((s, n) => s + n.value, 0);
  document.getElementById('blame-hdr-day').textContent   = recipe.name;
  document.getElementById('blame-hdr-name').textContent  = t.label;
  document.getElementById('blame-hdr-total').textContent = `${fmt(servingTotal, t.unit)} per serving`;
  document.getElementById('blame-hdr-bar-outer').style.display = 'none';
  document.getElementById('blame-tree').innerHTML = _treeHtml(items, servingTotal, t.val, t.unit);
}

function _openBlamePanelFor(key, activeAttr) {
  document.getElementById('blame-panel').classList.add('open');
  document.querySelectorAll('.blame-active').forEach(el => el.classList.remove('blame-active'));
  document.querySelectorAll(`[${activeAttr}="${key}"]`).forEach(el => el.classList.add('blame-active'));
  document.getElementById('blame-mode-btn').textContent =
    blameMode === 'subtotal' ? blameSubtotalLabel : '% of target';
}

export function openBlame(key) {
  const t = state.targets[key];
  if (!t) return;
  if (blameKey === key && !blameIsRecipe) { closeBlame(); return; }
  blameKey = key; blameIsRecipe = false;
  if (ui.analysisDay) {
    blameSubtotalLabel = '% of day';
    _renderDayBlameContent(key);
  } else {
    blameSubtotalLabel = '% of week avg';
    _renderWeeklyBlameContent(key);
  }
  _openBlamePanelFor(key, 'data-bkey');
}

export function openRecipeBlame(key) {
  if (!ui.blameDetailRecipe) return;
  const t = state.targets[key];
  if (!t) return;
  if (blameKey === key && blameIsRecipe) { closeBlame(); return; }
  blameKey = key; blameIsRecipe = true; blameSubtotalLabel = '% of recipe';
  _renderRecipeBlameContent(key);
  _openBlamePanelFor(key, 'data-rkey');
}

export function closeBlame() {
  if (!blameKey && !document.getElementById('blame-panel').classList.contains('open')) return;
  blameKey = null; blameIsRecipe = false;
  document.getElementById('blame-panel').classList.remove('open');
  document.querySelectorAll('.blame-active').forEach(el => el.classList.remove('blame-active'));
}
