import { state, dispatch } from '../store/store.js';
import { showUndo } from './snackbar.js';
import { escapeHtml } from './escape.js';
import { bringToFront, resetZ } from './uiState.js';

let _type   = null;  // 'recipe' | 'custom'
let _id     = null;
let _name   = '';
let _usages = [];

export function openUsageModal(type, id, name) {
  _type = type;
  _id   = id;
  _name = name;
  _usages = _computeUsages();
  _render();
  const umEl = document.getElementById('usage-modal');
  umEl.classList.add('open');
  bringToFront(umEl);
}

export function closeUsageModal() {
  const el = document.getElementById('usage-modal');
  el.classList.remove('open');
  resetZ(el);
  _type = _id = null;
  _usages = [];
}

function _matchFn() {
  return _type === 'recipe'
    ? (item) => item.type === 'recipe' && item.recipeId === _id
    : (item) => item.fdcId === 'custom_' + _id;
}

function _computeUsages() {
  if (!_id) return [];
  const match = _matchFn();
  const usages = [];
  for (const [day, meals] of Object.entries(state.plan)) {
    for (const [meal, items] of Object.entries(meals)) {
      if ((items || []).some(match)) usages.push({ kind: 'plan', day, meal });
    }
  }
  if ((state.extraFoods || []).some(match)) usages.push({ kind: 'extra' });
  for (const [rid, r] of Object.entries(state.recipes)) {
    if ((r.ingredients || []).some(match)) usages.push({ kind: 'recipe', id: rid, name: r.name });
  }
  return usages;
}

function _snapshotUsage(u) {
  const match = _matchFn();
  if (u.kind === 'plan') {
    const items = state.plan[u.day]?.[u.meal] || [];
    const captured = items
      .map((item, i) => ({ item: JSON.parse(JSON.stringify(item)), idx: i }))
      .filter(({ item }) => match(item));
    return { kind: 'plan', day: u.day, meal: u.meal, captured };
  } else if (u.kind === 'extra') {
    const items = state.extraFoods || [];
    const captured = items
      .map((item, i) => ({ item: JSON.parse(JSON.stringify(item)), idx: i }))
      .filter(({ item }) => match(item));
    return { kind: 'extra', captured };
  } else if (u.kind === 'recipe') {
    const r = state.recipes[u.id];
    if (!r) return null;
    return { kind: 'recipe', id: u.id, ingredients: JSON.parse(JSON.stringify(r.ingredients)) };
  }
  return null;
}

function _applySnapshot(s) {
  if (!s) return;
  if (s.kind === 'plan') {
    for (const { item, idx } of s.captured)
      dispatch({ type: 'PLAN_INSERT_ITEM', payload: { day: s.day, meal: s.meal, idx, item } });
  } else if (s.kind === 'extra') {
    for (const { item, idx } of s.captured)
      dispatch({ type: 'EXTRA_FOOD_INSERT', payload: { idx, item } });
  } else if (s.kind === 'recipe') {
    const r = state.recipes[s.id];
    if (r) dispatch({ type: 'RECIPE_SAVE', payload: { ...r, ingredients: s.ingredients } });
  }
}

function _removeUsage(u) {
  const match = _matchFn();
  if (u.kind === 'plan') {
    const items = state.plan[u.day]?.[u.meal] || [];
    for (let i = items.length - 1; i >= 0; i--)
      if (match(items[i])) dispatch({ type: 'PLAN_REMOVE_ITEM', payload: { day: u.day, meal: u.meal, idx: i } });
  } else if (u.kind === 'extra') {
    const items = state.extraFoods || [];
    for (let i = items.length - 1; i >= 0; i--)
      if (match(items[i])) dispatch({ type: 'EXTRA_FOOD_REMOVE', payload: { idx: i } });
  } else if (u.kind === 'recipe') {
    const r = state.recipes[u.id];
    if (r) dispatch({ type: 'RECIPE_SAVE', payload: { ...r, ingredients: r.ingredients.filter(ing => !match(ing)) } });
  }
}

export function handleUsageRemoveOne(idx) {
  const u = _usages[idx];
  if (!u) return;
  const snapshot = _snapshotUsage(u);
  _removeUsage(u);
  _usages = _computeUsages();
  if (!_usages.length) { closeUsageModal(); } else { _render(); }
  if (snapshot) showUndo('Removed usage', () => _applySnapshot(snapshot));
}

export function handleUsageRemoveAll() {
  const snapshots = _usages.map(_snapshotUsage).filter(Boolean);
  const count = _usages.length;
  for (const u of _usages) _removeUsage(u);
  closeUsageModal();
  if (snapshots.length) showUndo(`Removed ${count} usage${count !== 1 ? 's' : ''}`, () => snapshots.forEach(_applySnapshot));
}

function _render() {
  let html = '';
  _usages.forEach((u, i) => {
    let icon, label, action, extra = '';
    if (u.kind === 'plan') {
      icon = '📅'; label = `${escapeHtml(u.day)} · ${escapeHtml(u.meal)}`;
      action = 'usage-goto-plan';
    } else if (u.kind === 'extra') {
      icon = '🍽'; label = 'Extra Foods';
      action = 'usage-goto-plan';
    } else {
      icon = '📖'; label = escapeHtml(u.name);
      action = 'usage-open-recipe'; extra = `data-id="${escapeHtml(u.id)}"`;
    }
    html += `<div style="display:flex;align-items:center;gap:6px">
      <button class="btn sm" style="flex:1;justify-content:flex-start" data-action="${action}" ${extra} data-idx="${i}" title="Navigate there">${icon} ${label}</button>
      <button class="btn sm danger-btn" data-action="usage-remove-one" data-idx="${i}" title="Remove">×</button>
    </div>`;
  });

  document.getElementById('usage-modal-name').textContent = _name;
  document.getElementById('usage-modal-list').innerHTML = html;
}
