import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { dayKcal, sumDay, weeklyAvg } from '../aggregation.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixture = JSON.parse(readFileSync(join(__dirname, '../../../../backups/nourish-backup-2026-04-25.json'), 'utf8'));
const { plan, recipes, targets } = fixture;

const DAYS  = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];
const MEALS = ['Breakfast','Morning snack','Lunch','Afternoon snack','Dinner'];

test('dayKcal returns positive number for a day with items', () => {
  const day = DAYS.find(d => MEALS.some(m => (plan[d][m] || []).length > 0));
  assert.ok(day, 'fixture should have at least one non-empty day');
  const kcal = dayKcal(day, plan, MEALS, recipes);
  assert.ok(kcal > 0);
  assert.ok(Number.isFinite(kcal));
});

test('dayKcal returns 0 for empty day', () => {
  const emptyPlan = { 'Monday': { 'Breakfast': [], 'Lunch': [], 'Dinner': [], 'Morning snack': [], 'Afternoon snack': [] } };
  assert.equal(dayKcal('Monday', emptyPlan, MEALS, {}), 0);
});

test('sumDay returns object with all target keys', () => {
  const day = DAYS.find(d => MEALS.some(m => (plan[d][m] || []).length > 0));
  const totals = sumDay(day, plan, MEALS, targets, recipes);
  for (const key of Object.keys(targets)) {
    assert.ok(key in totals, `missing key ${key}`);
    assert.ok(typeof totals[key] === 'number');
  }
});

test('sumDay Energy matches dayKcal within 1 kcal', () => {
  const day = DAYS.find(d => MEALS.some(m => (plan[d][m] || []).length > 0));
  const totals = sumDay(day, plan, MEALS, targets, recipes);
  const kcal = dayKcal(day, plan, MEALS, recipes);
  assert.ok(Math.abs(totals['Energy'] - kcal) <= 1);
});

test('weeklyAvg totals are non-negative', () => {
  const { totals } = weeklyAvg(plan, DAYS, MEALS, targets, recipes);
  for (const val of Object.values(totals)) {
    assert.ok(val >= 0, `negative total: ${val}`);
  }
});

test('weeklyAvg days count is between 1 and 7', () => {
  const result = weeklyAvg(plan, DAYS, MEALS, targets, recipes);
  assert.ok(result.days >= 1 && result.days <= 7);
});

test('weeklyAvg returns empty object for plan with no items', () => {
  const empty = {};
  DAYS.forEach(d => { empty[d] = {}; MEALS.forEach(m => { empty[d][m] = []; }); });
  const result = weeklyAvg(empty, DAYS, MEALS, targets, recipes);
  assert.deepEqual(result, {});
});
