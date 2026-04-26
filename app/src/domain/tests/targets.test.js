import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calcTargetsFromProfile } from '../targets.js';

const BASE = { sex: 'male', age: 25, weight: 75, height: 180, activity: 'active', goalAdj: 0 };

test('returns positive calorie target', () => {
  const t = calcTargetsFromProfile(BASE);
  assert.ok(t['Energy'] > 1500);
});

test('goal adjustment shifts calories', () => {
  const deficit = calcTargetsFromProfile({ ...BASE, goalAdj: -500 });
  const surplus = calcTargetsFromProfile({ ...BASE, goalAdj: 300 });
  assert.equal(surplus['Energy'] - deficit['Energy'], 800);
});

test('sex differences: female gets lower potassium, different fiber', () => {
  const male   = calcTargetsFromProfile({ ...BASE, sex: 'male',   age: 30 });
  const female = calcTargetsFromProfile({ ...BASE, sex: 'female', age: 30 });
  assert.equal(male['Potassium'],   3400);
  assert.equal(female['Potassium'], 2600);
  assert.equal(male['Fiber'],   38);
  assert.equal(female['Fiber'], 25);
});

test('older adult gets higher vitamin D and adjusted calcium', () => {
  const young  = calcTargetsFromProfile({ ...BASE, age: 40 });
  const senior = calcTargetsFromProfile({ ...BASE, age: 72 });
  assert.ok(senior['Vitamin D'] > young['Vitamin D']);
  assert.ok(senior['Calcium'] >= young['Calcium']);
});

test('lysine scales with body weight', () => {
  const light = calcTargetsFromProfile({ ...BASE, weight: 60 });
  const heavy = calcTargetsFromProfile({ ...BASE, weight: 100 });
  assert.ok(heavy['Lysine'] > light['Lysine']);
});

test('sedentary profile gives lower protein than active', () => {
  const sed = calcTargetsFromProfile({ ...BASE, activity: 'sedentary' });
  const act = calcTargetsFromProfile({ ...BASE, activity: 'very_active' });
  assert.ok(act['Protein'] > sed['Protein']);
});
