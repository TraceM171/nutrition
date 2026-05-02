# Quantity & Unit Handling — Audit

Scope: how grams, source-provided units, custom units, and equivalences flow through Nourish. Catalogues storage shape, conversion paths, and bugs.

---

## 1. Unit Model Overview

### Canonical design (`docs/units-functionality.md`)

**Unit types:**
- **Base unit** — unit tied directly to nutritional info. One and only one per food. E.g. nutrients defined per 100 g → g is base unit.
- **Derived unit** — defined relative to the base unit via a fixed factor. E.g. ml at 0.92 g/ml. Chain must terminate at a base unit.
- **Serving** — recipe-only concept. Distributes recipe total dynamically: `1 serving = recipeWeight / yields`. Does NOT apply to individual foods or ingredients.

**Ingredient types:**
- **Imported** — from USDA/OFF. Base unit + derived units from source.
- **Forked** *(spec-defined; not yet implemented)* — user customisation of an imported food. Keeps same base unit, may add derived units and override nutrient values.
- **Custom** — fully user-defined base unit, nutrients, and derived units. Base unit can be swapped (making a derived unit the new base; nutrient values adapt).

**Rules:**
- One base unit per food — no exceptions.
- Food owns the unit list (base + all derived). Ingredient stores only which unit was chosen.
- Measures at food level must be additive (merge, never overwrite).
- Recipe has no units. Only servings.

---

### Unit types in play (current implementation — may diverge from spec)

1. **Grams (g)** — canonical SI unit; all nutrient math normalised to per-100g (or per-`nutrientBasis.qty`).
2. **USDA serving units** — derived in `extractMeasuresUSDA()`: `foodMeasures[].gramWeight`, `foodPortions[].gramWeight / amount`, plus liquid hint `ml/mL`.
3. **OFF serving units** — `serving_size` (text, may be "250 ml"), `serving_quantity` (number, grams), `serving_quantity_unit`. ml→g factor derived in `extractMeasuresOFF()`.
4. **Custom serving units** — `state.foodServings[fdcId] = { label, amountG }` map (one per food). *Should be a derived unit entry in `measures[]`, not a separate map — structural inconsistency.*
5. **Custom nutrient basis** — `foods[id].nutrientBasis = { qty, unit }` lets a food declare nutrients per N g/ml/serving instead of per 100 g. *This is the correct base-unit concept.*
6. **Recipe servings** — `recipe.yields` (count) + total ingredient grams via `getRecipeWeightG`. Each serving = `weight / yields`. *Correct per spec.*
7. **Ingredient amount fields** — both `qty` (count in selected unit) and `amountG` (grams) stored on the same ingredient, plus `unit` label.
8. **`servingMode` flag** — boolean on food + ingredient; when true, `qty` counts servings, `amountG` is unused (stored as 0). *Spec violation — "serving" is a recipe-only concept; this flag should not exist on foods/ingredients.*

### Storage shape

**Foods registry** (`state.foods[fdcId]`):
```
{ fdcId, name, nutrients, servingMode?, servingLabel?,
  nutrientBasis?: { qty, unit },
  measures?: [{ label, factor }] }
```

**Plan / recipe ingredient**:
```
food:    { type:'food', fdcId, name, amountG, unit, qty, servingMode?, nutrients? }
recipe:  { type:'recipe', recipeId, name, amountG, unit, qty }
```

**Custom servings map**: `state.foodServings[fdcId] = { label, amountG }`.

---

## 2. Conversion Pipeline

### Domain (`app/src/domain/`)

- `recipes.js:5-11` — `effectiveAmountG(ing, recipes)`: recipe ingredient w/ unit='serving' → `qty * recipeWeight / yields`. Else returns `ing.amountG || 0`.
- `recipes.js:26-68` — `getRecipeNutrientsPer100g`: scales each ingredient's nutrient by `amountG / basisQty` where `basisQty = foods[fdcId].nutrientBasis.qty || 100`.
- `nutrients.js:35-54` — `getNutrientVal`: dispatches on `servingMode` (scale by qty) vs gram mode (scale by `amountG / basisQty`).
- `nutrients.js:26-32` — `getIngredientNutrient` for `Carbohydrate`: net carbs = carbs − fiber − sugar alcohol.

### Sources (`app/src/sources/`)

- `usdaSource.js:29-54` — `extractMeasuresUSDA`: liquids → `[{ml,1},{g,1}]`; else from `foodMeasures[].gramWeight` and `foodPortions[]` with `factor = gramWeight / amount`.
- `offSource.js:84-101` — `extractMeasuresOFF`: parses ml from `serving_size`, derives factor `serving_quantity / ml_count`; returns `[{ml, factor},{g,1}]`.
- `offSource.js:21-82` — `normalizeOFFNutrients`: assumes per-100g.

### Views (`app/src/views/`)

- `unitSelector.js:13-30` — Builds visible unit list. If `ml` present, derives tbsp (×15) and tsp (×5), rounded to 3 dp.
- `unitSelector.js:49-55` — Unit switch: `newQty = currentQty * oldFactor / newFactor`.
- `searchModal.js:340-353` — On add: `amountG = qty * unitFactor` (rounded 0.1 g); persists `measures` to food registry **only when length > 1**.
- `recipeEditor.js:120-165` — `getRecipeIngMeasures` reconstructs unit list from `state.foods.measures` or falls back to `factor = amountG / qty`.
- `customIngEditor.js:296-314` — Stores custom serving via `FOOD_SERVING_SET`.

---

## 3. Bugs & Inconsistencies

Severity tags: **CRIT** = wrong nutrition output, **HIGH** = silent data corruption / round-trip loss, **MED** = edge cases, **LOW** = cosmetic.
Tags also include: **SPEC** = implementation contradicts `docs/units-functionality.md`.

### CRIT-1. Division by zero in recipe-ingredient unit selector
**`app/src/views/recipeEditor.js:125`**
```js
const currentServG = r && r.yields > 0
  ? getRecipeWeightG(r) / r.yields
  : (qty > 0 ? ing.amountG / qty : 100);
```
If `yields=0` and `qty=0`, fallback is 100 g/serving — silently wrong. If yields>0 path: `getRecipeWeightG` itself can be 0 for empty recipes → 0 g/serving propagates downstream as NaN once divided.

### CRIT-2. Liquid factor NaN when OFF lacks `serving_quantity`
**`app/src/sources/offSource.js:95-96`**
Missing `serving_quantity` → `parseFloat(undefined) = NaN` → guard `servingG > 0` skips assignment, leaving `factor` at default `1`. ml then treated 1:1 as g (e.g., "500 ml oil" stored at 500 g instead of ~460 g). Same risk in USDA: `usdaSource.js:47` reads `p.amount || 1`; if `gramWeight` is 0 or missing the factor is 0.

### CRIT-3. `servingMode` foods contribute 0 to recipes
**`app/src/domain/recipes.js:5-11`** + **`searchModal.js:361-363`**
Serving-mode ingredient stored as `amountG: 0`. `effectiveAmountG` returns 0 for any non-recipe ingredient → `getRecipeNutrientsPer100g` weight contribution = 0 → nutrients silently drop out of recipe totals. `getNutrientVal` handles servingMode correctly for direct plan items, but recipe aggregation does not.

### HIGH-4. `measures` array not stored for single-unit foods
**`app/src/views/searchModal.js:353`** — `...(_lastMeasures.length > 1 ? { measures: _lastMeasures } : {})`
Foods with only `g` aren't persisted with measures. Re-edit pulls from fallback (`amountG / qty`) and infers a phantom factor — e.g. 100 g flour edited later becomes "1 unit = 100 g" rather than "g unit". Round-trip changes the displayed unit.

### HIGH-5. `measures` stored at the food level → cross-instance contamination
Foods registry has one `measures[]` per `fdcId`. If recipe A uses cups and recipe B re-fetches and stores ml-only measures for the same food, A's editor now lacks cups. Unit choice should belong to the ingredient or be additive at the food level, not overwrite.

### HIGH-6. Display reconstruction loses unit on reload for gram-mode ingredients
**`app/src/views/planView.js:37-39`**, **`ingredientDetail.js:103`**
Display reads `ing.qty || ing.amountG` and `ing.unit || 'g'`. After save+reload, if measures absent from food registry (HIGH-4), recipe editor regenerates a unit list that may not contain the original `ing.unit` label → unit selector shows 'g' even though `ing.unit='tbsp'`.

### HIGH-7. v2→v3 migration discards per-ingredient nutrient overrides
**`app/src/store/persistence.js:35-72`** — `delete ing.nutrients` after registering first occurrence. Two ingredients with same `fdcId` but different nutrient maps (legitimate v2 use case for tweaked overrides) collapse to whichever entry registered first; subsequent entries lose their per-ingredient values silently.

### MED-8. `nutrientBasis.qty <= 0` defaults to 100 with no warning
**`app/src/domain/recipes.js:56-58`**, **`nutrients.js:41-43`**
A user typo (`qty=0`) silently defaults to per-100 g — inflating per-pill / per-50g nutrients ~2-100×. customIngEditor (`app/src/views/customIngEditor.js:155`) accepts `min="0.001"` but doesn't reject 0 or NaN at save.

### MED-9. tbsp/tsp factors rounded to 3 dp accumulate error
**`app/src/views/unitSelector.js:20-21`**
For non-water liquids (e.g., olive oil ~0.92 g/ml): `tbsp = round(0.92 * 15, 3) = 13.800`, but exact = 13.7895. Over many recipe uses, drift compounds. Also no source-of-truth for tbsp/tsp factor — recomputed each call from current `ml.factor`, so editing the ml row indirectly shifts tbsp values.

### MED-10. Net-carb math mixes basis assumptions
**`app/src/domain/nutrients.js:26-32`**
`getNutrientVal` already returns nutrients scaled by `amountG / basisQty` (or qty for serving-mode). Subtracting fiber/sugar-alcohol works only if all three share the same basis. If `nutrientBasis.unit='ml'` for one nutrient family and another has unit 'g', math is silently off — but the schema only stores one basis per food, so this is latent until someone introduces per-nutrient bases.

### MED-11. USDA `foodPortions` factor formula unverified for `amount != 1`
**`app/src/sources/usdaSource.js:50`** — `factor: gramWeight / amount`.
USDA's `amount` semantics differ across data types. For Branded foods, `amount` may be the count of portion units; for Foundation it's often 1. Confidence in formula correctness is uneven; needs spot-check against known foods (e.g., 1 cup flour = 125 g).

### MED-12. Barcode source fallback drops ml unit context
**`app/src/views/searchModal.js:261-274`** — `_barcodeFallbackUSDA` reuses USDA Branded entry, but USDA branded rarely encodes liquid ml factors. OFF→USDA fallback for a beverage loses ml selector → user must remeasure in g.

### MED-13. Custom serving label may collide with built-in unit labels
**`app/src/views/customIngEditor.js:299-306`** — accepts any non-empty `label`. User entering `g`, `ml`, `tbsp` shadows built-in measures; `unitSelector` builds list w/o dedup → two `g` rows.

### LOW-14. Rounding precision differs between storage and display
storage `amountG` rounded to 0.1 g (`searchModal.js:344`); display rounds qty to 0.01 (`planView.js:37`). Edit→save round-trip can flip 1.05 → 1.1 → 1.10 → 1.1.

### LOW-15. Memoised `recipeNutrientsPer100g` not invalidated on PAYLOAD_LOAD
**`app/src/domain/recipes.js:17-24`** — `_memoVersion` increments on mutations but not on full payload import. Stale values until next mutation if recipe IDs collide across imports (very low probability; collision possible after manual JSON edit).

### SPEC-16. `servingMode` on food/ingredient is a spec violation [CRIT + SPEC]
Per spec: "Serving — Only used for recipes to distribute dynamically its amount." Foods and ingredients have no serving concept; they use base or derived units only. The `servingMode` boolean on food + ingredient is an implementation artefact that contradicts the design and causes CRIT-3. **Fix: remove `servingMode` from food/ingredient. Represent "1 scoop = 30 g" as a named derived unit (`label:'scoop', factor:30`) in `measures[]`.** Existing `foodServings` data must be migrated into `measures[]` entries.

### SPEC-17. `foodServings` is a parallel structure that belongs in `measures[]` [HIGH + SPEC]
`state.foodServings[fdcId] = { label, amountG }` is a single custom derived unit stored outside the `measures[]` array. Per spec all derived units live in one list on the food. **Fix: fold `foodServings` into `food.measures` as `{ label, factor: amountG / basisQty }`. Remove `foodServings` slice from store + persistence. Requires schema migration (v3→v4).**

### ~~SPEC-18~~ NOT A BUG — Forked ingredient type IS implemented
`openCustomIngEditorForFork`, `backedByFdcId`, `nutrientOverrides`, `resolveForkedNutrients` all exist. Forked type fully functional.

### SPEC-19. Custom ingredient base-unit swap not implemented [MED + SPEC]
Spec: "User must be able to change the base unit, making a derived one the base one, and nutritional info will adapt." `customIngEditor.js` has no such operation. Nutrient values would need to be rescaled by `oldBasisQty * oldFactor / newBasisQty` when swapping base unit.

---

## 4. Open Questions — Resolved

All questions resolved against `docs/units-functionality.md`. No open design decisions remain before implementation.

1. **Should serving-mode foods be allowed inside recipes?**
   **CLOSED — No.** `servingMode` is a spec violation (SPEC-16). Remove from food/ingredient entirely. "1 scoop = 30 g" is a derived unit. Recipes reference ingredients by amount in any valid unit.

2. **Unit ownership: per-food vs per-ingredient.**
   **CLOSED — Food owns the list; ingredient stores the chosen unit.** Measures are food-level and must be additive (merge-on-fetch, never overwrite). HIGH-4 and HIGH-5 are confirmed bugs. Ingredient stores `unit` label + computed `amountG`; it does not store a measures list.

3. **Precedence: `nutrientBasis` vs `foodServings` vs `servingMode`.**
   **CLOSED — Only `nutrientBasis` survives.** `servingMode` removed (SPEC-16). `foodServings` folded into `measures[]` (SPEC-17). One base unit per food, declared by `nutrientBasis`. All other units are derived via factor.

4. **Re-fetch policy for `measures`.**
   **CLOSED.** Re-fetch merges source measures into `food.measures[]`: updates existing source-provided entries, adds new ones, never deletes. User-added derived units survive re-fetch. User-added entries identified by `userAdded: true` flag on the measure object.

5. **Is `nutrientBasis.qty < 1` supported end-to-end?**
   **CLOSED — Yes, by design.** Custom ingredients explicitly support any base qty (pills, capsules). MED-8 validation bug (accepting `qty=0` at save) is still a bug but the concept is valid.

6. **USDA `foodPortions.amount` semantics.**
   **STILL OPEN — data quality.** Not a design decision. Needs spot-check against known foods (1 cup all-purpose flour = 125 g, 1 tbsp olive oil = 13.5 g). Low priority; does not block implementation.

---

## 5. Recommended Fix Order

Phase A — Spec alignment (prerequisite for everything else):
1. **SPEC-16** — Remove `servingMode` from food/ingredient; migrate to derived unit in `measures[]`.
2. **SPEC-17** — Fold `foodServings` map into `measures[]`; schema v3→v4 migration.
3. **HIGH-4/5** — Make `food.measures` additive; always persist even for single-unit foods; tag user-added entries.

Phase B — Critical math bugs (unblock after Phase A):
4. **CRIT-3** — Now solved by SPEC-16 (once servingMode removed, zero-amountG path gone).
5. **CRIT-2** — Guard NaN factor in OFF/USDA; flag food as "weight unknown" rather than silently using 1:1.
6. **CRIT-1** — Clamp `currentServG` minimum; surface "set yields" warning in recipe editor.

Phase C — Data integrity:
7. **HIGH-6** — Unit round-trip stable once Phase A done; verify after.
8. **HIGH-7** — v2→v3 migration discards per-ingredient nutrient overrides; fix before adding v4 migration.
9. **MED-8** — Reject `nutrientBasis.qty <= 0` at save; surface inline error.

Phase D — Missing features:
10. **SPEC-19** — Implement base-unit swap in custom ingredient editor (confirmed new feature).

Phase E — Cleanup:
12. MED-9 through LOW-15 as low-priority cleanup.

---

## 6. Files Touched by Unit Logic

```
app/src/domain/recipes.js, nutrients.js, aggregation.js, blame.js
app/src/sources/usdaSource.js, offSource.js
app/src/views/unitSelector.js, recipeEditor.js, customIngEditor.js,
  ingredientDetail.js, planView.js, foodsView.js, searchModal.js
app/src/store/store.js, persistence.js
```
