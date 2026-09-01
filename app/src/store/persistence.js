import { DAYS, MEALS } from '../domain/constants.js';

const STORAGE_KEY = 'nourish_data';

// Merges a (post-migration) payload onto a live `state` object. Shared by the
// browser's startup load and any other caller (e.g. the MCP server) that needs
// the same semantics — only keys present in `payload` are applied, so a partial
// payload leaves the rest of `state` untouched.
export function applyPayload(state, payload) {
  if (payload.plan) {
    state.plan = payload.plan;
    DAYS.forEach(d => { if (!state.plan[d]) state.plan[d] = {}; MEALS.forEach(m => { if (!state.plan[d][m]) state.plan[d][m] = []; }); });
  }
  if (payload.recipes)           state.recipes           = payload.recipes;
  if (payload.customIngredients) state.customIngredients = payload.customIngredients;
  if (payload.foods)             state.foods             = payload.foods;
  if (payload.extraFoods)        state.extraFoods        = payload.extraFoods;
  if (payload.foodAliases)       state.foodAliases       = payload.foodAliases;
  if (payload.targets) Object.keys(payload.targets).forEach(k => {
    if (!state.targets[k]) return;
    state.targets[k].val = payload.targets[k].val;
    if (payload.targets[k].max !== undefined) state.targets[k].max = payload.targets[k].max;
  });
  if (payload.disabledTargets) state.disabledTargets = payload.disabledTargets;
  if (payload.userProfile) state.userProfile = { ...state.userProfile, ...payload.userProfile };
}

export function buildPayload(state) {
  return {
    version: 5,
    savedAt: new Date().toISOString(),
    plan: state.plan,
    recipes: state.recipes,
    customIngredients: state.customIngredients,
    foods: state.foods,
    extraFoods: state.extraFoods,
    foodAliases: state.foodAliases,
    targets: state.targets,
    disabledTargets: state.disabledTargets,
    userProfile: state.userProfile,
  };
}

export function save(state) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(buildPayload(state))); } catch(e) {}
}

let _saveTimer = null;
export function debouncedSave(state) {
  clearTimeout(_saveTimer);
  _saveTimer = setTimeout(() => save(state), 500);
}

// ── Migrations ────────────────────────────────────────────────────────────────

// v2 → v3: extract embedded nutrient maps into a `foods` registry.
// After migration, plan items and recipe ingredients have no `nutrients` field.
// Custom ingredients are registered under 'custom_<id>'.
function migrateV2toV3(p) {
  const foods = {};

  const register = (ing) => {
    if (!ing || ing.type === 'recipe') return;
    if (!ing.type) ing.type = 'food'; // backfill missing type discriminator
    if (!ing.fdcId) return;
    const fdcId = String(ing.fdcId);
    if (ing.nutrients) {
      if (!foods[fdcId]) {
        foods[fdcId] = {
          fdcId,
          name: ing.name,
          nutrients: { ...ing.nutrients },
          ...(ing.servingMode ? { servingMode: true, servingLabel: ing.servingLabel } : {}),
        };
      } else {
        // Merge: add any nutrient keys not already present (first occurrence wins conflicts).
        const existing = foods[fdcId].nutrients;
        Object.entries(ing.nutrients).forEach(([k, v]) => { if (!(k in existing)) existing[k] = v; });
      }
    }
    delete ing.nutrients;
  };

  Object.values(p.plan || {}).forEach(day =>
    Object.values(day).forEach(meal => (meal || []).forEach(register))
  );
  Object.values(p.recipes || {}).forEach(r =>
    (r.ingredients || []).forEach(register)
  );
  // Ensure every custom ingredient is in the registry even if unused in the plan.
  Object.entries(p.customIngredients || {}).forEach(([id, ci]) => {
    const fdcId = 'custom_' + id;
    foods[fdcId] = {
      fdcId,
      name: ci.name,
      nutrients: ci.nutrients || {},
      ...(ci.servingMode ? { servingMode: true, servingLabel: ci.servingLabel } : {}),
    };
  });

  return { ...p, version: 3, foods };
}

function migrateV3toV4(p) {
  return {
    ...p,
    version: 4,
    foodAliases:  p.foodAliases  ?? {},
    foodServings: p.foodServings ?? {},
  };
}

function migrateV4toV5(p) {
  const foods = p.foods ? { ...p.foods } : {};

  // Build measures for custom ingredient food entries before stripping servingMode.
  Object.entries(p.customIngredients || {}).forEach(([id, ci]) => {
    const fdcId = 'custom_' + id;
    const food  = foods[fdcId];
    if (!food) return;
    if (!food.measures) {
      const basisUnit  = ci.nutrientBasis?.unit || (ci.servingMode ? 'serving' : 'g');
      const basisLabel = ci.nutrientBasis?.label || ci.servingLabel || basisUnit;
      if (basisUnit === 'serving') {
        food.measures = [{ label: basisLabel, factor: 1 }];
      } else if (basisUnit === 'ml') {
        food.measures = [{ label: 'ml', factor: 1 }, { label: 'g', factor: 1 }];
      } else {
        food.measures = [{ label: 'g', factor: 1 }];
      }
    }
  });

  // Fold foodServings into foods[fdcId].measures as userAdded entries.
  Object.entries(p.foodServings || {}).forEach(([fdcId, serving]) => {
    const food = foods[fdcId];
    if (!food || !serving?.label || !(serving.amountG > 0)) return;
    if (!food.measures) food.measures = [{ label: 'g', factor: 1 }];
    const existing = food.measures.find(m => m.label === serving.label);
    if (existing) { existing.factor = serving.amountG; existing.userAdded = true; }
    else food.measures.unshift({ label: serving.label, factor: serving.amountG, userAdded: true });
  });

  // Strip servingMode/servingLabel from food entries.
  Object.values(foods).forEach(food => {
    delete food.servingMode;
    delete food.servingLabel;
  });

  // Strip servingMode/servingLabel from customIngredients.
  const customIngredients = {};
  Object.entries(p.customIngredients || {}).forEach(([id, ci]) => {
    const { servingMode, servingLabel, ...rest } = ci;
    customIngredients[id] = rest;
  });

  // Strip servingMode from plan/recipe/extraFoods ingredients.
  const stripIng = ing => { delete ing.servingMode; };
  const plan = p.plan ? JSON.parse(JSON.stringify(p.plan)) : {};
  Object.values(plan).forEach(day =>
    Object.values(day).forEach(meal => (meal || []).forEach(stripIng))
  );
  const recipes = p.recipes ? JSON.parse(JSON.stringify(p.recipes)) : {};
  Object.values(recipes).forEach(r => (r.ingredients || []).forEach(stripIng));
  const extraFoods = (p.extraFoods || []).map(ing => { const { servingMode, ...rest } = ing; return rest; });

  const { foodServings, ...rest } = p;
  return { ...rest, version: 5, foods, customIngredients, plan, recipes, extraFoods };
}

const migrations = [
  { from: 2, migrate: migrateV2toV3 },
  { from: 3, migrate: migrateV3toV4 },
  { from: 4, migrate: migrateV4toV5 },
];

export function applyMigrations(payload) {
  let p = payload;
  for (const m of migrations) {
    if ((p.version || 1) <= m.from) p = m.migrate(p);
  }
  return p;
}

export function load() {
  try {
    const s = localStorage.getItem(STORAGE_KEY);
    if (s) return applyMigrations(JSON.parse(s));
    // Legacy migration from pre-v2 separate keys
    const oldPlan    = localStorage.getItem('nourish_plan');
    const oldProfile = localStorage.getItem('nourish_profile');
    if (oldPlan || oldProfile) {
      return applyMigrations({
        version: 1,
        plan:        oldPlan    ? JSON.parse(oldPlan)    : undefined,
        userProfile: oldProfile ? JSON.parse(oldProfile) : undefined,
      });
    }
  } catch(e) {}
  return null;
}
