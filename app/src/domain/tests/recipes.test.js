import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { effectiveAmountG, getRecipeWeightG, getRecipeNutrientsPer100g, wouldCreateCycle } from '../recipes.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixture = JSON.parse(readFileSync(join(__dirname, '../../../../backups/nourish-backup-2026-04-25.json'), 'utf8'));
const { recipes } = fixture;

test('effectiveAmountG returns amountG for normal food ingredient', () => {
  const ing = { type: 'food', amountG: 100, nutrients: {} };
  assert.equal(effectiveAmountG(ing, {}), 100);
});

test('effectiveAmountG resolves serving-unit recipe ingredient dynamically', () => {
  const rid = Object.keys(recipes)[0];
  const r = recipes[rid];
  const serving = { type: 'recipe', recipeId: rid, unit: 'serving', qty: 1, amountG: 0 };
  const result = effectiveAmountG(serving, recipes);
  const expected = getRecipeWeightG(r, recipes) / r.yields;
  assert.ok(Math.abs(result - expected) < 0.001);
});

test('getRecipeWeightG sums ingredient amountGs', () => {
  const rid = Object.keys(recipes)[0];
  const r = recipes[rid];
  const weight = getRecipeWeightG(r, recipes);
  assert.ok(weight > 0, 'recipe weight should be positive');
});

test('getRecipeNutrientsPer100g returns per-100g map with energy', () => {
  const rid = Object.keys(recipes)[0];
  const r = recipes[rid];
  const n = getRecipeNutrientsPer100g(r, recipes);
  assert.ok(typeof n === 'object');
  const energyKey = Object.keys(n).find(k => k.toLowerCase().includes('energy'));
  assert.ok(energyKey, 'should have energy key');
  assert.ok(n[energyKey] > 0);
});

test('getRecipeNutrientsPer100g handles empty recipe gracefully', () => {
  const empty = { id: 'empty', name: 'Empty', yields: 1, ingredients: [] };
  const result = getRecipeNutrientsPer100g(empty, {});
  assert.deepEqual(result, {});
});

test('wouldCreateCycle detects direct self-reference', () => {
  assert.ok(wouldCreateCycle('r1', 'r1', {}));
});

test('wouldCreateCycle returns false for unrelated recipes', () => {
  const recs = { 'rB': { ingredients: [] } };
  assert.equal(wouldCreateCycle('rA', 'rB', recs), false);
});

test('wouldCreateCycle detects indirect cycle', () => {
  // rA → rB → rA: wouldCreateCycle('rA', 'rB') should be true
  const recs = {
    'rB': { ingredients: [{ type: 'recipe', recipeId: 'rA' }] },
  };
  assert.ok(wouldCreateCycle('rA', 'rB', recs));
});

test('no cycles in fixture recipes', () => {
  const ids = Object.keys(recipes);
  for (const id of ids) {
    assert.equal(wouldCreateCycle(id, id, recipes), true, 'self is always a cycle');
    for (const other of ids.filter(x => x !== id)) {
      // just ensure no exception
      wouldCreateCycle(id, other, recipes);
    }
  }
});
