import { z } from 'zod';
import { state, loadPayload } from '../state.js';
import { buildPayload } from '../../../app/src/store/persistence.js';
import { DAYS, MEALS, MACRO_KEYS } from '../../../app/src/domain/constants.js';
import { dayKcal, sumDay, weeklyAvg } from '../../../app/src/domain/aggregation.js';
import { getDayBlameTree, getWeeklyBlameTree } from '../../../app/src/domain/blame.js';
import { calcTargetsFromProfile } from '../../../app/src/domain/targets.js';
import { getStatus, getPct } from '../../../app/src/domain/nutrients.js';
import { buildShoppingList } from '../../../app/src/views/shoppingList.js';

const dayEnum = () => z.enum(DAYS);

export function registerAnalysisTools(server) {
  server.registerTool(
    'get_full_plan',
    { description: 'Return the entire current plan payload — plan, recipes, custom ingredients, foods registry, extra foods, aliases, targets, profile. This is everything the app persists for the plan.', inputSchema: z.object({}) },
    async () => ({ content: [{ type: 'text', text: JSON.stringify(buildPayload(state), null, 2) }] })
  );

  server.registerTool(
    'reload_data',
    { description: 'Re-read the data file from disk, discarding any in-memory state not yet saved. Use if the file was edited outside this server (e.g. by the app\'s own export/import, or by hand) since the server started.', inputSchema: z.object({}) },
    async () => { loadPayload(); return { content: [{ type: 'text', text: 'Reloaded.' }] }; }
  );

  server.registerTool(
    'get_day_totals',
    { description: 'Sum every tracked nutrient for one day of the plan across all meals.', inputSchema: z.object({ day: dayEnum() }) },
    async ({ day }) => {
      const totals = sumDay(day, state.plan, MEALS, state.targets, state.recipes, state.foods);
      return { content: [{ type: 'text', text: JSON.stringify(totals, null, 2) }] };
    }
  );

  server.registerTool(
    'get_day_kcal',
    { description: 'Total calories for one day of the plan.', inputSchema: z.object({ day: dayEnum() }) },
    async ({ day }) => ({ content: [{ type: 'text', text: JSON.stringify({ day, kcal: dayKcal(day, state.plan, MEALS, state.recipes, state.foods) }) }] })
  );

  server.registerTool(
    'get_weekly_avg',
    { description: 'Average daily nutrient totals across all days that have any plan items, plus extra (unassigned) foods averaged over 7 days.', inputSchema: z.object({}) },
    async () => {
      const result = weeklyAvg(state.plan, DAYS, MEALS, state.targets, state.recipes, state.foods, state.extraFoods);
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    }
  );

  server.registerTool(
    'get_day_blame',
    { description: 'Break down which meals/ingredients/recipes contributed how much of a given nutrient on a given day — a tree from meal down to leaf ingredient.', inputSchema: z.object({ day: dayEnum(), nutrientKey: z.string().describe('Nutrient key, e.g. "Energy", "Protein", "Fiber"') }) },
    async ({ day, nutrientKey }) => {
      const tree = getDayBlameTree(day, nutrientKey, state.plan, MEALS, state.recipes, state.foods, state.foodAliases);
      return { content: [{ type: 'text', text: JSON.stringify(tree, null, 2) }] };
    }
  );

  server.registerTool(
    'get_week_blame',
    { description: 'Same breakdown as get_day_blame, but across the whole week (days → meals → ingredients), including extra foods.', inputSchema: z.object({ nutrientKey: z.string() }) },
    async ({ nutrientKey }) => {
      const tree = getWeeklyBlameTree(nutrientKey, state.plan, DAYS, MEALS, state.recipes, state.foods, state.extraFoods, state.foodAliases);
      return { content: [{ type: 'text', text: JSON.stringify(tree, null, 2) }] };
    }
  );

  server.registerTool(
    'get_targets_for_profile',
    {
      description: 'Compute recommended nutrient targets (calories, macros, micros) from a body profile using the same Mifflin-St Jeor + activity-multiplier formula the app\'s Targets page uses. Defaults to the plan\'s own stored profile if none is given.',
      inputSchema: z.object({
        sex: z.enum(['male', 'female']).optional(),
        age: z.number().optional(),
        weight: z.number().optional().describe('kg'),
        height: z.number().optional().describe('cm'),
        activity: z.enum(['sedentary', 'light', 'moderate', 'active', 'very_active']).optional(),
        goalAdj: z.number().optional().describe('kcal/day adjustment for a cut/bulk goal'),
      }),
    },
    async (input) => {
      const profile = { ...state.userProfile, ...input };
      return { content: [{ type: 'text', text: JSON.stringify(calcTargetsFromProfile(profile), null, 2) }] };
    }
  );

  server.registerTool(
    'evaluate_nutrient_target',
    {
      description: 'Given a nutrient key and a current value, return its percent of target and status (low/ok/high) against the plan\'s stored targets — same logic the UI uses to color nutrient rows.',
      inputSchema: z.object({ key: z.string(), value: z.number() }),
    },
    async ({ key, value }) => {
      const pct = getPct(key, value, state.targets);
      const status = getStatus(key, value, state.targets, MACRO_KEYS);
      return { content: [{ type: 'text', text: JSON.stringify({ key, value, pct, status }) }] };
    }
  );

  server.registerTool(
    'get_shopping_list',
    { description: 'Aggregate every ingredient across the whole week\'s plan (including recipes broken down to base ingredients) into a shopping list.', inputSchema: z.object({}) },
    async () => ({ content: [{ type: 'text', text: JSON.stringify(buildShoppingList(state), null, 2) }] })
  );
}
