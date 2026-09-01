import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, rmSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';

const __dirname = dirname(fileURLToPath(import.meta.url));
const serverEntry = join(__dirname, '..', 'src', 'server.js');
const dataFile = join(__dirname, 'tmp-data.json');

function textOf(result) {
  return JSON.parse(result.content[0].text);
}

async function withClient(fn) {
  if (existsSync(dataFile)) rmSync(dataFile);
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [serverEntry],
    env: { ...process.env, NOURISH_DATA_FILE: dataFile, NOURISH_BRIDGE_ENABLED: '0' },
  });
  const client = new Client({ name: 'nourish-mcp-test', version: '0.0.0' });
  await client.connect(transport);
  try {
    await fn(client);
  } finally {
    await client.close();
    if (existsSync(dataFile)) rmSync(dataFile);
  }
}

test('lists all registered tools', async () => {
  await withClient(async client => {
    const { tools } = await client.listTools();
    const names = tools.map(t => t.name).sort();
    assert.ok(names.includes('get_full_plan'));
    assert.ok(names.includes('add_plan_item'));
    assert.ok(names.includes('save_recipe'));
    assert.ok(names.includes('search_usda_foods'));
    assert.ok(names.includes('refetch_all_nutrients'));
    assert.ok(names.length >= 24, `expected 24+ tools, got ${names.length}`);
  });
});

test('get_full_plan returns a fresh empty payload with DAYS/MEALS structure', async () => {
  await withClient(async client => {
    const result = await client.callTool({ name: 'get_full_plan', arguments: {} });
    assert.equal(result.isError, undefined);
    const payload = textOf(result);
    assert.equal(payload.version, 5);
    assert.ok(Array.isArray(payload.plan.Monday.Breakfast));
    assert.deepEqual(payload.plan.Monday.Breakfast, []);
  });
});

test('add_plan_item mutates state and persists to disk', async () => {
  await withClient(async client => {
    const item = { type: 'food', fdcId: '12345', name: 'Test Food', amountG: 100, unit: 'g', qty: 1 };
    const addResult = await client.callTool({
      name: 'add_plan_item',
      arguments: { day: 'Monday', meal: 'Breakfast', item },
    });
    assert.equal(addResult.isError, undefined);

    const plan = textOf(await client.callTool({ name: 'get_full_plan', arguments: {} }));
    assert.equal(plan.plan.Monday.Breakfast.length, 1);
    assert.equal(plan.plan.Monday.Breakfast[0].fdcId, '12345');

    assert.ok(existsSync(dataFile));
    const onDisk = JSON.parse(readFileSync(dataFile, 'utf8'));
    assert.equal(onDisk.plan.Monday.Breakfast.length, 1);
  });
});

test('upsert_foods + get_day_totals reflect a manually-added food', async () => {
  await withClient(async client => {
    await client.callTool({
      name: 'upsert_foods',
      arguments: { foods: { '999': { fdcId: '999', name: 'Egg', nutrients: { Energy: 155, Protein: 13 } } } },
    });
    await client.callTool({
      name: 'add_plan_item',
      arguments: { day: 'Tuesday', meal: 'Lunch', item: { type: 'food', fdcId: '999', name: 'Egg', amountG: 100, unit: 'g', qty: 1 } },
    });
    const totals = textOf(await client.callTool({ name: 'get_day_totals', arguments: { day: 'Tuesday' } }));
    assert.equal(totals.Energy, 155);
  });
});

test('save_recipe, get_shopping_list, and delete_recipe round-trip', async () => {
  await withClient(async client => {
    await client.callTool({
      name: 'upsert_foods',
      arguments: { foods: { '1': { fdcId: '1', name: 'Flour', nutrients: { Energy: 364 } } } },
    });
    await client.callTool({
      name: 'save_recipe',
      arguments: { recipe: { id: 'r1', name: 'Bread', yields: 1, ingredients: [{ type: 'food', fdcId: '1', name: 'Flour', amountG: 500, unit: 'g', qty: 500 }] } },
    });
    await client.callTool({
      name: 'add_plan_item',
      arguments: { day: 'Wednesday', meal: 'Dinner', item: { type: 'recipe', recipeId: 'r1', name: 'Bread', amountG: 500, unit: 'g', qty: 1 } },
    });
    const list = textOf(await client.callTool({ name: 'get_shopping_list', arguments: {} }));
    assert.ok(list.some(i => i.name === 'Flour'));

    const del = await client.callTool({ name: 'delete_recipe', arguments: { id: 'r1' } });
    assert.equal(del.isError, undefined);
    const plan = textOf(await client.callTool({ name: 'get_full_plan', arguments: {} }));
    assert.equal(plan.recipes.r1, undefined);
  });
});

test('update_user_profile changes only the given field, preserving the rest', async () => {
  await withClient(async client => {
    const before = textOf(await client.callTool({ name: 'get_full_plan', arguments: {} }));
    const originalSex = before.userProfile.sex;

    const result = await client.callTool({ name: 'update_user_profile', arguments: { weight: 82 } });
    assert.equal(result.isError, undefined);

    const after = textOf(await client.callTool({ name: 'get_full_plan', arguments: {} }));
    assert.equal(after.userProfile.weight, 82);
    assert.equal(after.userProfile.sex, originalSex); // untouched, not wiped
  });
});

test('save_targets with only userProfile does not require targets and does not wipe the profile', async () => {
  await withClient(async client => {
    await client.callTool({ name: 'update_user_profile', arguments: { sex: 'female', age: 30 } });
    const r = await client.callTool({ name: 'save_targets', arguments: { userProfile: { weight: 60 } } });
    assert.equal(r.isError, undefined);
    const plan = textOf(await client.callTool({ name: 'get_full_plan', arguments: {} }));
    assert.equal(plan.userProfile.weight, 60);
    assert.equal(plan.userProfile.sex, 'female'); // set moments earlier, must survive a targets-less save_targets call
    assert.equal(plan.userProfile.age, 30);
  });
});

test('reload_data picks up an externally-written file', async () => {
  if (existsSync(dataFile)) rmSync(dataFile);
  const { writeFileSync } = await import('node:fs');
  const external = { version: 5, plan: {}, recipes: {}, customIngredients: {}, foods: {}, extraFoods: [], foodAliases: {}, targets: {}, disabledTargets: [], userProfile: {} };
  external.plan.Thursday = { Breakfast: [{ type: 'food', fdcId: '7', name: 'X', amountG: 10, unit: 'g', qty: 1 }] };
  writeFileSync(dataFile, JSON.stringify(external));

  await withClientNoReset(async client => {
    const before = textOf(await client.callTool({ name: 'get_full_plan', arguments: {} }));
    assert.equal((before.plan.Thursday?.Breakfast || []).length, 1);
  });
});

async function withClientNoReset(fn) {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [serverEntry],
    env: { ...process.env, NOURISH_DATA_FILE: dataFile, NOURISH_BRIDGE_ENABLED: '0' },
  });
  const client = new Client({ name: 'nourish-mcp-test', version: '0.0.0' });
  await client.connect(transport);
  try {
    await fn(client);
  } finally {
    await client.close();
    if (existsSync(dataFile)) rmSync(dataFile);
  }
}
