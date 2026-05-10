// Tiny pub/sub store. State is mutable; all mutations happen through dispatch.
// Subscribers receive the dispatched action after the reducer runs.
import { resolveForkedNutrients } from '../domain/nutrients.js';
import { resolveBasisG } from '../domain/units.js';

export const state = {
  plan: {},
  recipes: {},
  customIngredients: {},
  foods: {},  // FoodId → { fdcId, name, nutrients, nutrientBasis?, measures?: [{label, factor, userAdded?}] }
  extraFoods: [],  // week-level foods not assigned to any day
  foodAliases: {},   // fdcId → string (user display name override)
  targets: {},
  disabledTargets: [],  // array of non-macro target keys hidden across UI
  userProfile: { sex: 'male', age: 30, weight: 75, height: 175, activity: 'moderate', goalAdj: 0 },
};

const _subs = [];

export function dispatch(action) {
  _reduce(state, action);
  _subs.forEach(fn => fn(action));
}

export function subscribe(fn) {
  _subs.push(fn);
  return () => { const i = _subs.indexOf(fn); if (i >= 0) _subs.splice(i, 1); };
}

function _reduce(s, { type, payload = {} }) {
  switch (type) {
    case 'PLAN_ADD_ITEM':
      s.plan[payload.day][payload.meal].push(payload.item);
      break;
    case 'PLAN_REMOVE_ITEM':
      s.plan[payload.day][payload.meal].splice(payload.idx, 1);
      break;
    case 'PLAN_INSERT_ITEM':
      s.plan[payload.day][payload.meal].splice(payload.idx, 0, payload.item);
      break;
    case 'EXTRA_FOOD_ADD':
      s.extraFoods.push(payload.item);
      break;
    case 'EXTRA_FOOD_REMOVE':
      s.extraFoods.splice(payload.idx, 1);
      break;
    case 'EXTRA_FOOD_INSERT':
      s.extraFoods.splice(payload.idx, 0, payload.item);
      break;
    case 'RECIPE_SAVE':
    case 'RECIPE_COPY':
      s.recipes[payload.id] = { ...payload, lastEdited: Date.now() };
      break;
    case 'RECIPE_DELETE':
      delete s.recipes[payload.id];
      break;
    case 'CUSTOM_ING_SAVE':
    case 'CUSTOM_ING_COPY': {
      payload.lastEdited = Date.now();
      s.customIngredients[payload.id] = payload;
      // Build base measures from nutrientBasis.
      const basisUnit  = payload.nutrientBasis?.unit || 'g';
      const basisLabel = payload.nutrientBasis?.label || basisUnit;
      let ciMeasures;
      if (basisUnit === 'serving') {
        ciMeasures = [{ label: basisLabel, factor: 1 }];
      } else if (basisUnit === 'ml') {
        ciMeasures = [{ label: 'ml', factor: 1 }, { label: 'g', factor: 1 }];
      } else if (basisUnit === 'g') {
        ciMeasures = [{ label: 'g', factor: 1 }];
      } else {
        // Custom unit (e.g. 'pill', 'tablet', 'scoop'). Nutrients are per basisQty of this unit;
        // factor=1 keeps the scale identity (amountG = qty × 1, basisG = basisQty × 1).
        ciMeasures = [{ label: basisUnit, factor: 1 }];
      }
      // Preserve existing userAdded measures (e.g. custom serving set by user).
      const existingCiFood = s.foods['custom_' + payload.id];
      if (existingCiFood?.measures) {
        const userMeasures = existingCiFood.measures.filter(m => m.userAdded);
        ciMeasures = [...userMeasures, ...ciMeasures.filter(m => !userMeasures.some(u => u.label === m.label))];
      }
      // Mirror into foods registry so edits propagate to all references (P14).
      // For forked ingredients, compute forkBasisG from payload+ciMeasures (not the stale
      // foods entry, which hasn't been updated yet) so cross-basis scaling is correct.
      const forkBasisG = resolveBasisG({ nutrientBasis: payload.nutrientBasis, measures: ciMeasures });
      s.foods['custom_' + payload.id] = {
        fdcId: 'custom_' + payload.id,
        name: payload.name,
        nutrients: payload.backedByFdcId
          ? resolveForkedNutrients(payload, s.foods, forkBasisG)
          : payload.nutrients,
        measures: ciMeasures,
        ...(payload.nutrientBasis ? { nutrientBasis: payload.nutrientBasis } : {}),
      };
      break;
    }
    case 'CUSTOM_ING_DELETE':
      delete s.customIngredients[payload.id];
      break;
    case 'FOOD_ALIAS_SET':
      if (payload.alias) s.foodAliases[payload.fdcId] = payload.alias;
      else delete s.foodAliases[payload.fdcId];
      break;
    case 'FOOD_MEASURE_SET': {
      const fmFood = s.foods[payload.fdcId];
      if (!fmFood) break;
      if (!fmFood.measures) fmFood.measures = [{ label: 'g', factor: 1 }];
      const fmIdx = fmFood.measures.findIndex(m => m.label === payload.label && m.userAdded);
      const fmEntry = { label: payload.label, factor: payload.factor, userAdded: true };
      if (fmIdx >= 0) fmFood.measures[fmIdx] = fmEntry;
      else fmFood.measures.unshift(fmEntry);
      break;
    }
    case 'FOOD_MEASURE_DEL': {
      const fmdFood = s.foods[payload.fdcId];
      if (!fmdFood?.measures) break;
      fmdFood.measures = fmdFood.measures.filter(m => !(m.label === payload.label && m.userAdded));
      break;
    }
    case 'FOODS_UPSERT':
      // Merge new food data into registry; preserve existing userAdded measures.
      Object.entries(payload).forEach(([fdcId, newFood]) => {
        const existing = s.foods[fdcId];
        if (existing?.measures?.length) {
          const userMeasures = existing.measures.filter(m => m.userAdded);
          const srcMeasures  = (newFood.measures || []).filter(m => !m.userAdded);
          const merged = [...userMeasures, ...srcMeasures.filter(m => !userMeasures.some(u => u.label === m.label))];
          s.foods[fdcId] = { ...existing, ...newFood, measures: merged };
        } else {
          s.foods[fdcId] = existing ? { ...existing, ...newFood } : newFood;
        }
      });
      // Recompute forked custom ingredients whose backed food was just updated.
      Object.values(s.customIngredients).forEach(ci => {
        if (ci.backedByFdcId && payload[ci.backedByFdcId] !== undefined) {
          const entry = s.foods['custom_' + ci.id];
          if (entry) entry.nutrients = resolveForkedNutrients(ci, s.foods);
        }
      });
      break;
    case 'TARGETS_SAVE':
      Object.keys(payload.targets).forEach(k => {
        if (s.targets[k]) {
          s.targets[k].val = payload.targets[k].val;
          s.targets[k].max = payload.targets[k].max;
        }
      });
      s.userProfile = payload.userProfile;
      s.disabledTargets = payload.disabledTargets || [];
      break;
    // PAYLOAD_LOAD and NUTRIENTS_REFETCH_COMPLETE: state already mutated before dispatch;
    // subscribers handle persistence and re-render.
  }
}
