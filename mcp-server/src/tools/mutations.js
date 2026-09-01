import { z } from 'zod';
import { state, savePayload } from '../state.js';
import { dispatch } from '../../../app/src/store/store.js';
import { fetchFoodDetails, extractNutrients } from '../../../app/src/sources/usdaSource.js';
import { lookupOFFProduct, normalizeOFFNutrients } from '../../../app/src/sources/offSource.js';

const usdaKey = () => process.env.USDA_API_KEY || 'DEMO_KEY';

const freeform = () => z.record(z.string(), z.unknown());

const ITEM_DESC = 'A plan/recipe ingredient item: either { type: "food", fdcId, name, amountG, unit, qty } (fdcId references the foods registry) or { type: "recipe", recipeId, name, amountG, unit, qty }.';

function ok(extra) {
  return { content: [{ type: 'text', text: JSON.stringify({ ok: true, ...extra }) }] };
}

// Every mutation runs one dispatch against the real reducer, then persists.
// Doing this synchronously per call keeps the on-disk file always consistent
// with the in-memory state a subsequent read-only tool call will see.
function mutate(action, extra) {
  dispatch(action);
  savePayload();
  return ok(extra);
}

export function registerMutationTools(server) {
  server.registerTool('add_plan_item',
    { description: `Add an ingredient to a meal slot. ${ITEM_DESC}`, inputSchema: z.object({ day: z.string(), meal: z.string(), item: freeform() }) },
    async ({ day, meal, item }) => mutate({ type: 'PLAN_ADD_ITEM', payload: { day, meal, item } }));

  server.registerTool('remove_plan_item',
    { description: 'Remove the ingredient at index idx from a meal slot.', inputSchema: z.object({ day: z.string(), meal: z.string(), idx: z.number().int() }) },
    async ({ day, meal, idx }) => mutate({ type: 'PLAN_REMOVE_ITEM', payload: { day, meal, idx } }));

  server.registerTool('insert_plan_item',
    { description: `Insert an item at a specific index in a meal slot (for reordering). ${ITEM_DESC}`, inputSchema: z.object({ day: z.string(), meal: z.string(), idx: z.number().int(), item: freeform() }) },
    async ({ day, meal, idx, item }) => mutate({ type: 'PLAN_INSERT_ITEM', payload: { day, meal, idx, item } }));

  server.registerTool('add_extra_food',
    { description: `Add an item to "extra foods" — week-level foods not assigned to any specific day, averaged across 7 days in weekly stats. ${ITEM_DESC}`, inputSchema: z.object({ item: freeform() }) },
    async ({ item }) => mutate({ type: 'EXTRA_FOOD_ADD', payload: { item } }));

  server.registerTool('remove_extra_food',
    { description: 'Remove the extra-food item at index idx.', inputSchema: z.object({ idx: z.number().int() }) },
    async ({ idx }) => mutate({ type: 'EXTRA_FOOD_REMOVE', payload: { idx } }));

  server.registerTool('insert_extra_food',
    { description: `Insert an extra-food item at a specific index. ${ITEM_DESC}`, inputSchema: z.object({ idx: z.number().int(), item: freeform() }) },
    async ({ idx, item }) => mutate({ type: 'EXTRA_FOOD_INSERT', payload: { idx, item } }));

  server.registerTool('save_recipe',
    { description: 'Create or update a recipe. Shape: { id, name, yields, ingredients: [ingredient items] }. If id matches an existing recipe it is overwritten.', inputSchema: z.object({ recipe: freeform() }) },
    async ({ recipe }) => mutate({ type: 'RECIPE_SAVE', payload: recipe }, { id: recipe.id }));

  server.registerTool('copy_recipe',
    { description: 'Duplicate a recipe under a new id — same shape as save_recipe.', inputSchema: z.object({ recipe: freeform() }) },
    async ({ recipe }) => mutate({ type: 'RECIPE_COPY', payload: recipe }, { id: recipe.id }));

  server.registerTool('delete_recipe',
    { description: 'Delete a recipe by id. Does not remove references to it elsewhere in the plan.', inputSchema: z.object({ id: z.string() }) },
    async ({ id }) => mutate({ type: 'RECIPE_DELETE', payload: { id } }));

  server.registerTool('save_custom_ingredient',
    { description: 'Create or update a custom ingredient. Shape: { id, name, nutrientBasis: {qty, unit, label}, nutrients, backedByFdcId?, nutrientOverrides? }. Mirrors into the foods registry automatically.', inputSchema: z.object({ customIngredient: freeform() }) },
    async ({ customIngredient }) => mutate({ type: 'CUSTOM_ING_SAVE', payload: customIngredient }, { id: customIngredient.id }));

  server.registerTool('copy_custom_ingredient',
    { description: 'Duplicate a custom ingredient under a new id — same shape as save_custom_ingredient.', inputSchema: z.object({ customIngredient: freeform() }) },
    async ({ customIngredient }) => mutate({ type: 'CUSTOM_ING_COPY', payload: customIngredient }, { id: customIngredient.id }));

  server.registerTool('delete_custom_ingredient',
    { description: 'Delete a custom ingredient by id.', inputSchema: z.object({ id: z.string() }) },
    async ({ id }) => mutate({ type: 'CUSTOM_ING_DELETE', payload: { id } }));

  server.registerTool('set_food_measure',
    { description: 'Add or replace a user-defined measure (e.g. "cup" -> grams factor) on a food in the registry.', inputSchema: z.object({ fdcId: z.string(), label: z.string(), factor: z.number() }) },
    async ({ fdcId, label, factor }) => mutate({ type: 'FOOD_MEASURE_SET', payload: { fdcId, label, factor } }));

  server.registerTool('delete_food_measure',
    { description: 'Remove a user-defined measure from a food.', inputSchema: z.object({ fdcId: z.string(), label: z.string() }) },
    async ({ fdcId, label }) => mutate({ type: 'FOOD_MEASURE_DEL', payload: { fdcId, label } }));

  server.registerTool('upsert_foods',
    { description: 'Merge nutrient data into the foods registry. Payload maps fdcId -> { fdcId, name, nutrients, measures? }. Preserves any existing user-added measures.', inputSchema: z.object({ foods: z.record(z.string(), freeform()) }) },
    async ({ foods }) => mutate({ type: 'FOODS_UPSERT', payload: foods }));

  server.registerTool('set_food_alias',
    { description: 'Set (or, with an empty string, clear) a display-name override for a food, shown everywhere that food is referenced.', inputSchema: z.object({ fdcId: z.string(), alias: z.string() }) },
    async ({ fdcId, alias }) => mutate({ type: 'FOOD_ALIAS_SET', payload: { fdcId, alias } }));

  server.registerTool('save_targets',
    {
      description: 'Save nutrient targets, the body profile, and/or which non-macro targets are disabled. All three fields are optional — omit any of them to leave that part unchanged. userProfile is merged onto the existing profile (only the fields you pass are changed), not replaced. Only val/max are updated per target key; unknown keys are ignored.',
      inputSchema: z.object({ targets: z.record(z.string(), freeform()).optional(), userProfile: freeform().optional(), disabledTargets: z.array(z.string()).optional() }),
    },
    async ({ targets, userProfile, disabledTargets }) => mutate({
      type: 'TARGETS_SAVE',
      payload: {
        targets: targets || state.targets,
        userProfile: { ...state.userProfile, ...(userProfile || {}) },
        disabledTargets: disabledTargets !== undefined ? disabledTargets : state.disabledTargets,
      },
    }));

  server.registerTool('update_user_profile',
    {
      description: 'Update one or more fields of the user profile — sex, age, weight (kg), height (cm), activity, goalAdj (kcal/day). Merges onto the existing profile, so pass only what changed (e.g. just weight). Leaves targets and disabled-targets untouched. Note: this does not recompute nutrient targets from the new profile — call get_targets_for_profile and then save_targets if you want that.',
      inputSchema: z.object({
        sex: z.enum(['male', 'female']).optional(),
        age: z.number().optional(),
        weight: z.number().optional(),
        height: z.number().optional(),
        activity: z.enum(['sedentary', 'light', 'moderate', 'active', 'very_active']).optional(),
        goalAdj: z.number().optional(),
      }),
    },
    async (profile) => {
      const userProfile = { ...state.userProfile, ...profile };
      return mutate({ type: 'TARGETS_SAVE', payload: { targets: state.targets, userProfile, disabledTargets: state.disabledTargets } }, { userProfile });
    });

  server.registerTool('refetch_all_nutrients',
    {
      description: 'Re-fetch nutrient data from USDA/Open Food Facts for every food currently referenced anywhere in the registry, plan, or recipes, and upsert the results. Bulk equivalent of the app\'s "Refetch All" button.',
      inputSchema: z.object({}),
    },
    async () => {
      const usdaMap = new Map();
      const offMap = new Map();
      const collectId = (fdcId, name) => {
        if (!fdcId) return;
        const id = String(fdcId);
        if (id.startsWith('off_')) {
          const barcode = id.slice(4);
          if (/^\d+$/.test(barcode) && !offMap.has(barcode)) offMap.set(barcode, { fdcId: id, name });
        } else if (/^\d+$/.test(id)) {
          if (!usdaMap.has(fdcId)) usdaMap.set(fdcId, { fdcId, name });
        }
      };
      Object.values(state.foods).forEach(f => collectId(f.fdcId, f.name));
      const collect = ing => { if (!ing || ing.type === 'recipe') return; collectId(ing.fdcId, ing.name); };
      Object.values(state.plan).forEach(day => Object.values(day).forEach(items => (items || []).forEach(collect)));
      Object.values(state.recipes).forEach(r => (r.ingredients || []).forEach(collect));

      const errors = [];
      let succeeded = 0;
      for (const [fdcId, info] of usdaMap) {
        try {
          const data = await fetchFoodDetails(fdcId, usdaKey());
          dispatch({ type: 'FOODS_UPSERT', payload: { [String(fdcId)]: { fdcId: String(fdcId), name: info.name, nutrients: extractNutrients(data) } } });
          succeeded++;
        } catch (e) { errors.push(`USDA ${fdcId}: ${e.message || 'request failed'}`); }
      }
      for (const [barcode, info] of offMap) {
        try {
          const product = await lookupOFFProduct(barcode);
          if (!product) { errors.push(`OFF ${barcode}: not found`); continue; }
          dispatch({ type: 'FOODS_UPSERT', payload: { [info.fdcId]: { fdcId: info.fdcId, name: info.name, nutrients: normalizeOFFNutrients(product) } } });
          succeeded++;
        } catch (e) { errors.push(`OFF ${barcode}: ${e.message || 'request failed'}`); }
      }
      dispatch({ type: 'NUTRIENTS_REFETCH_COMPLETE' });
      savePayload();
      return ok({ total: usdaMap.size + offMap.size, succeeded, failed: errors.length, errors });
    });
}
