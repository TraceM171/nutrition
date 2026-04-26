// Pure domain functions — no globals, no DOM, no fetch.
import { getIngredientNutrient } from './nutrients.js';

export function dayKcal(day, plan, meals, recipes) {
  let kcal = 0;
  meals.forEach(m => {
    (plan[day][m] || []).forEach(ing => { kcal += getIngredientNutrient(ing, 'Energy', recipes); });
  });
  return Math.round(kcal);
}

export function sumDay(day, plan, meals, targets, recipes) {
  const totals = {};
  Object.keys(targets).forEach(k => totals[k] = 0);
  meals.forEach(meal => {
    (plan[day][meal] || []).forEach(ing => {
      Object.keys(targets).forEach(k => {
        totals[k] += getIngredientNutrient(ing, k, recipes);
      });
    });
  });
  return totals;
}

export function weeklyAvg(plan, days, meals, targets, recipes) {
  const allDays = days.filter(d => meals.some(m => (plan[d][m] || []).length > 0));
  if (!allDays.length) return {};
  const totals = {};
  Object.keys(targets).forEach(k => totals[k] = 0);
  allDays.forEach(d => {
    const dt = sumDay(d, plan, meals, targets, recipes);
    Object.keys(targets).forEach(k => totals[k] += dt[k]);
  });
  Object.keys(targets).forEach(k => totals[k] /= 7);
  return { totals, days: allDays.length };
}
