import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { findNutrientVal, netCarbsFromMap, getNutrientVal, getIngredientNutrient, fmt, getPct, getStatus } from '../nutrients.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixture = JSON.parse(readFileSync(join(__dirname, '../../../../backups/nourish-backup-2026-04-25.json'), 'utf8'));
const { recipes, targets: savedTargets } = fixture;

const MACRO_KEYS = ['Energy', 'Protein', 'Carbohydrate', 'Total lipid'];

test('findNutrientVal finds partial key match', () => {
  const n = { 'Protein': 10, 'Energy': 100 };
  assert.equal(findNutrientVal(n, 'protein'), 10);
  assert.equal(findNutrientVal(n, 'ener'), 100);
});

test('findNutrientVal returns 0 for missing key', () => {
  assert.equal(findNutrientVal({}, 'sodium'), 0);
});

test('findNutrientVal skips zero and returns first non-zero', () => {
  const n = { 'Protein A': 0, 'Protein B': 5 };
  assert.equal(findNutrientVal(n, 'protein'), 5);
});

test('netCarbsFromMap subtracts fiber from carbs', () => {
  const n = { 'Carbohydrate, by difference': 30, 'Fiber, total dietary': 5 };
  assert.equal(netCarbsFromMap(n), 25);
});

test('netCarbsFromMap never goes negative', () => {
  const n = { 'Carbohydrate, by difference': 5, 'Fiber, total dietary': 10 };
  assert.equal(netCarbsFromMap(n), 0);
});

test('getNutrientVal scales by amountG', () => {
  const ing = { amountG: 200, nutrients: { 'Protein': 10 } };
  assert.equal(getNutrientVal(ing, 'protein'), 20);
});

test('getNutrientVal in serving mode scales by qty', () => {
  const ing = { servingMode: true, qty: 2, nutrients: { 'Protein': 10 } };
  assert.equal(getNutrientVal(ing, 'protein'), 20);
});

test('getIngredientNutrient works for real fixture food item', () => {
  // Find a food plan item with nutrients
  let foodItem = null;
  for (const day of Object.keys(fixture.plan)) {
    for (const meal of Object.keys(fixture.plan[day])) {
      const item = fixture.plan[day][meal].find(i => i.type === 'food');
      if (item) { foodItem = item; break; }
    }
    if (foodItem) break;
  }
  assert.ok(foodItem, 'fixture should have at least one food item');
  const val = getIngredientNutrient(foodItem, 'Energy', recipes);
  assert.ok(typeof val === 'number');
  assert.ok(!isNaN(val));
});

test('getIngredientNutrient returns net carbs for Carbohydrate key', () => {
  const ing = {
    type: 'food', amountG: 100,
    nutrients: { 'Carbohydrate, by difference': 30, 'Fiber, total dietary': 5 },
  };
  const val = getIngredientNutrient(ing, 'Carbohydrate', {});
  assert.ok(val <= 25);
  assert.ok(val >= 0);
});

test('fmt formats kcal with rounding', () => {
  assert.equal(fmt(2100.6, 'kcal'), '2,101 kcal');
});

test('fmt formats small values with one decimal', () => {
  assert.equal(fmt(1.234, 'g'), '1.2 g');
});

test('fmt formats large values as integer', () => {
  assert.equal(fmt(420, 'mg'), '420 mg');
});

test('fmt handles zero', () => {
  assert.equal(fmt(0, 'g'), '0.0 g');
});

test('fmt returns dash for null/undefined', () => {
  assert.equal(fmt(null, 'g'), '—');
  assert.equal(fmt(undefined, 'g'), '—');
});

test('getPct computes percent of target', () => {
  const targets = { 'Energy': { val: 2000, max: null } };
  assert.equal(getPct('Energy', 1000, targets), 50);
});

test('getStatus macro logic', () => {
  const targets = { 'Energy': { val: 2000, max: null } };
  assert.equal(getStatus('Energy', 1800, targets, MACRO_KEYS), 'ok');
  assert.equal(getStatus('Energy', 1500, targets, MACRO_KEYS), 'low');
  assert.equal(getStatus('Energy', 2300, targets, MACRO_KEYS), 'high');
});

test('getStatus handles UL (max) for non-macro', () => {
  const targets = { 'Sodium': { val: 1500, max: 2300 } };
  assert.equal(getStatus('Sodium', 2500, targets, MACRO_KEYS), 'high');
  assert.equal(getStatus('Sodium', 1000, targets, MACRO_KEYS), 'low');
  assert.equal(getStatus('Sodium', 1800, targets, MACRO_KEYS), 'ok');
});
