import { state, dispatch } from '../store/store.js';
import { escapeHtml } from './escape.js';
import { DAYS, MEALS } from '../domain/constants.js';
import { dayKcal as _dayKcal } from '../domain/aggregation.js';
import { getIngredientNutrient, getDisplayName } from '../domain/nutrients.js';
import { showUndo } from './snackbar.js';

function dayKcal(day) { return _dayKcal(day, state.plan, MEALS, state.recipes, state.foods); }

function extraFoodsKcal() {
  return Math.round(
    (state.extraFoods || []).reduce(
      (s, ing) => s + getIngredientNutrient(ing, 'Energy', state.recipes, state.foods), 0
    )
  );
}

export function renderPlan() {
  const wrap = document.getElementById('week-grid-wrap');
  let html = '<div class="week-grid">';
  DAYS.forEach(day => {
    const kcal = dayKcal(day);
    html += `<div class="day-col">
      <div class="day-header" data-action="plan-goto-day" data-day="${day}" style="cursor:pointer" title="View ${day} nutrients">
        <div class="day-name">${day.slice(0,3)}</div>
        <div class="day-kcal">${kcal ? kcal.toLocaleString()+' kcal' : '—'}</div>
      </div>`;
    MEALS.forEach(meal => {
      const ings = state.plan[day][meal] || [];
      html += `<div class="meal-slot">
        <div class="meal-label">${meal}</div>`;
      ings.forEach((ing, i) => {
        const badge = ing.type === 'recipe'
          ? `<span class="re-badge rec">REC</span>`
          : `<span class="re-badge food">FOOD</span>`;
        const dispName = ing.type === 'recipe' ? ing.name : (getDisplayName(ing.fdcId, state.foods, state.foodAliases) || ing.name);
        const qty = Math.round((ing.qty !== undefined ? ing.qty : ing.amountG) * 100) / 100;
        const unit = ing.unit || 'g';
        const qtyStr = (qty === 1 && unit === 'serving') ? '' : `<span style="color:var(--text-dimmer)">${qty}${escapeHtml(unit)}</span>`;
        html += `<div class="ingredient-chip">
          <span class="chip-name" title="${escapeHtml(dispName)}" data-action="plan-ing-detail" data-day="${day}" data-meal="${meal}" data-idx="${i}" style="cursor:pointer">${badge}${escapeHtml(dispName)} ${qtyStr}</span>
          <button class="chip-remove" data-action="remove-ing" data-day="${day}" data-meal="${meal}" data-idx="${i}">×</button>
        </div>`;
      });
      html += `<button class="add-ingredient-btn" data-action="add-ing" data-day="${day}" data-meal="${meal}">+ add</button>
      </div>`;
    });
    html += `</div>`;
  });
  html += '</div>';

  // Extra Foods section
  const extras = state.extraFoods || [];
  const kcal = extraFoodsKcal();
  html += `<div class="extra-foods-section">
    <div class="extra-foods-header">
      <div>
        <span class="extra-foods-title">Extra Foods</span>
        <span class="extra-foods-sub">consumed this week, not tied to a specific day — affects weekly avg only</span>
      </div>
      <div class="extra-foods-kcal">${kcal ? kcal.toLocaleString()+' kcal total' : ''}</div>
    </div>
    <div class="extra-foods-list">`;
  extras.forEach((ing, i) => {
    const badge = ing.type === 'recipe'
      ? `<span class="re-badge rec">REC</span>`
      : `<span class="re-badge food">FOOD</span>`;
    const dispName = ing.type === 'recipe' ? ing.name : (getDisplayName(ing.fdcId, state.foods, state.foodAliases) || ing.name);
    const qty = Math.round((ing.qty !== undefined ? ing.qty : ing.amountG) * 100) / 100;
    const unit = ing.unit || 'g';
    const qtyStr = (qty === 1 && unit === 'serving') ? '' : `<span style="color:var(--text-dimmer)">${qty}${escapeHtml(unit)}</span>`;
    html += `<div class="ingredient-chip extra-chip">
      <span class="chip-name" title="${escapeHtml(dispName)}" data-action="plan-extra-ing-detail" data-idx="${i}" style="cursor:pointer">${badge}${escapeHtml(dispName)} ${qtyStr}</span>
      <button class="chip-remove" data-action="remove-extra-food" data-idx="${i}">×</button>
    </div>`;
  });
  html += `</div>
    <button class="add-ingredient-btn" data-action="add-extra-food">+ add extra food</button>
  </div>`;

  wrap.innerHTML = html;
}

export function removeIngredient(day, meal, idx) {
  const item = JSON.parse(JSON.stringify(state.plan[day][meal][idx]));
  const name = item.type === 'recipe' ? item.name : (getDisplayName(item.fdcId, state.foods, state.foodAliases) || item.name);
  dispatch({ type: 'PLAN_REMOVE_ITEM', payload: { day, meal, idx } });
  showUndo(`Removed "${name}"`, () => dispatch({ type: 'PLAN_INSERT_ITEM', payload: { day, meal, idx, item } }));
}

export function removeExtraFood(idx) {
  const item = JSON.parse(JSON.stringify(state.extraFoods[idx]));
  const name = item.type === 'recipe' ? item.name : (getDisplayName(item.fdcId, state.foods, state.foodAliases) || item.name);
  dispatch({ type: 'EXTRA_FOOD_REMOVE', payload: { idx } });
  showUndo(`Removed "${name}"`, () => dispatch({ type: 'EXTRA_FOOD_INSERT', payload: { idx, item } }));
}
