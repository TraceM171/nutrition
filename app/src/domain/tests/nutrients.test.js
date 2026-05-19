import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { findNutrientVal, netCarbsFromMap, getNutrientVal, getIngredientNutrient, fmt, getPct, getStatus } from '../nutrients.js';
import { resolveBasisG } from '../units.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixture = JSON.parse(readFileSync(join(__dirname, 'fixture.json'), 'utf8'));
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
  const ing = { qty: 2, fdcId: 'custom_x' };
  const foods = { 'custom_x': { nutrients: { 'Protein': 10 }, nutrientBasis: { qty: 1, unit: 'serving', label: 'scoop' } } };
  assert.equal(getNutrientVal(ing, 'protein', foods), 20);
});

test('getNutrientVal respects nutrientBasis.qty from foods registry', () => {
  const ing = { amountG: 100, fdcId: 'custom_x' };
  const foods = { 'custom_x': { nutrients: { 'Protein': 5 }, nutrientBasis: { qty: 50, unit: 'g' } } };
  // 5g protein per 50g → for 100g should be 10
  assert.equal(getNutrientVal(ing, 'Protein', foods), 10);
});

test('getNutrientVal defaults to 100g basis when no nutrientBasis', () => {
  const ing = { amountG: 100, fdcId: 'usda_123' };
  const foods = { 'usda_123': { nutrients: { 'Protein': 10 } } };
  assert.equal(getNutrientVal(ing, 'Protein', foods), 10);
});

test('getNutrientVal nutrientBasis.qty=200 halves per-100g result', () => {
  const ing = { amountG: 100, fdcId: 'custom_y' };
  const foods = { 'custom_y': { nutrients: { 'Energy': 400 }, nutrientBasis: { qty: 200, unit: 'g' } } };
  // 400 kcal per 200g → 200 kcal per 100g → for 100g = 200
  assert.equal(getNutrientVal(ing, 'Energy', foods), 200);
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

// resolveBasisG
test('resolveBasisG returns 100 when no nutrientBasis', () => {
  assert.equal(resolveBasisG({}), 100);
  assert.equal(resolveBasisG(null), 100);
});

test('resolveBasisG returns qty for g unit', () => {
  assert.equal(resolveBasisG({ nutrientBasis: { qty: 50, unit: 'g' } }), 50);
});

test('resolveBasisG returns null for serving unit', () => {
  assert.equal(resolveBasisG({ nutrientBasis: { qty: 1, unit: 'serving' } }), null);
});

test('resolveBasisG resolves named unit via measures', () => {
  const food = {
    nutrientBasis: { qty: 1, unit: 'cup' },
    measures: [{ label: 'cup', factor: 240, userAdded: true }, { label: 'g', factor: 1 }],
  };
  assert.equal(resolveBasisG(food), 240);
});

test('resolveBasisG falls back to qty*1 when named unit not in measures', () => {
  const food = { nutrientBasis: { qty: 2, unit: 'cup' }, measures: [] };
  assert.equal(resolveBasisG(food), 2);
});

test('getNutrientVal resolves named-unit basis via measures', () => {
  const ing = { amountG: 240, fdcId: 'custom_z' };
  const foods = {
    'custom_z': {
      nutrients: { 'Protein': 10 },
      nutrientBasis: { qty: 1, unit: 'cup' },
      measures: [{ label: 'cup', factor: 240, userAdded: true }],
    },
  };
  // 10g protein per 1 cup (240g) → for 240g should be 10
  assert.equal(getNutrientVal(ing, 'Protein', foods), 10);
});
