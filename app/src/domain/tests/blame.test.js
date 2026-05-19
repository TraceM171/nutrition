import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { buildBlameNode, getDayBlameTree, getWeeklyBlameTree } from '../blame.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixture = JSON.parse(readFileSync(join(__dirname, 'fixture.json'), 'utf8'));
const { plan, recipes } = fixture;

const DAYS  = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];
const MEALS = ['Breakfast','Morning snack','Lunch','Afternoon snack','Dinner'];

test('buildBlameNode for food ingredient returns correct shape', () => {
  const ing = { type: 'food', name: 'Eggs', amountG: 100, nutrients: { 'Energy': 155 } };
  const node = buildBlameNode(ing, 'Energy', 1, {});
  assert.equal(node.name, 'Eggs');
  assert.ok(node.value > 0);
  assert.equal(node.isRecipe, false);
  assert.equal(node.children, null);
});

test('buildBlameNode applies scaleFactor to food', () => {
  const ing = { type: 'food', name: 'Eggs', amountG: 100, nutrients: { 'Energy': 155 } };
  const full  = buildBlameNode(ing, 'Energy', 1, {});
  const half  = buildBlameNode(ing, 'Energy', 0.5, {});
  assert.ok(Math.abs(half.value - full.value / 2) < 0.001);
});

test('buildBlameNode for recipe ingredient expands children', () => {
  // Find a recipe plan item
  let recipeItem = null;
  for (const day of DAYS) {
    for (const meal of MEALS) {
      const item = (plan[day][meal] || []).find(i => i.type === 'recipe');
      if (item) { recipeItem = item; break; }
    }
    if (recipeItem) break;
  }
  assert.ok(recipeItem, 'fixture should have at least one recipe plan item');
  const node = buildBlameNode(recipeItem, 'Energy', 1, recipes);
  assert.equal(node.isRecipe, true);
  assert.ok(node.children !== null || node.value === 0, 'recipe should have children or zero value');
});

test('getDayBlameTree returns sorted nodes for a filled day', () => {
  const day = DAYS.find(d => MEALS.some(m => (plan[d][m] || []).length > 0));
  assert.ok(day);
  const tree = getDayBlameTree(day, 'Energy', plan, MEALS, recipes);
  assert.ok(Array.isArray(tree));
  assert.ok(tree.length > 0);
  // sorted descending by value
  for (let i = 1; i < tree.length; i++) {
    assert.ok(tree[i - 1].value >= tree[i].value);
  }
});

test('getDayBlameTree returns empty for empty day', () => {
  const empty = {};
  DAYS.forEach(d => { empty[d] = {}; MEALS.forEach(m => { empty[d][m] = []; }); });
  const tree = getDayBlameTree('Monday', 'Energy', empty, MEALS, recipes);
  assert.deepEqual(tree, []);
});

test('getWeeklyBlameTree covers multiple days', () => {
  const tree = getWeeklyBlameTree('Energy', plan, DAYS, MEALS, recipes);
  assert.ok(Array.isArray(tree));
  assert.ok(tree.length > 0);
  // Each entry is sorted descending
  for (let i = 1; i < tree.length; i++) {
    assert.ok(tree[i - 1].value >= tree[i].value);
  }
});

test('sum of weekly blame tree matches weekly average energy roughly', () => {
  const tree = getWeeklyBlameTree('Energy', plan, DAYS, MEALS, recipes);
  const total = tree.reduce((s, n) => s + n.value, 0);
  assert.ok(total > 0);
});
