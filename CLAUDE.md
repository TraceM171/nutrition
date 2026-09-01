# Nourish — Project Guidelines

## What this is

A single-file, no-backend, vanilla browser app for meal planning and nutrient tracking. The final build output **must always be a single self-contained HTML file** (`meal-planner-dist.html`). All logic, storage, and API calls live in the browser.

Source lives in `app/`. `mcp-server/` is a separate, optional sibling package — an MCP server giving agents the same read/write access to a plan that the UI has (see `mcp-server/README.md`). It is not part of the single-file build; the app has zero runtime dependency on it.

This repo is the portable, self-contained instruction set — it holds every rule needed to work on the code correctly, even in a standalone clone. The parent project directory (one level up from this repo, if present) may also carry a `knowledge/` tree with the deeper project memory: decision rationale, historical audits, and current status/open items. See `../knowledge/_basic.md` when working from there.

## Source layout

```
app/
  meal-planner-v2.html    # legacy monolith (reference)
  meal-planner-dist.html  # built output (single self-contained HTML)
  build.js                # esbuild bundler → inlines JS + CSS into dist HTML
  package.json            # type:module; scripts: test, build, dev
  src/
    domain/               # pure functions — no DOM, no fetch, no localStorage
      aggregation.js      # sumDay, weeklyAvg, dayKcal
      blame.js            # buildBlameTree, getDayBlameTree, getWeeklyBlameTree
      constants.js        # DAYS, MEALS, MACRO_KEYS, NUTRIENT_SECTIONS, TARGETS
      id.js               # genId (namespaced: 'r…' recipes, 'c…' custom)
      nutrients.js        # getNutrientVal, getRecipeNutrientsPer100g (memoised), wouldCreateCycle, etc.
      recipes.js          # effectiveAmountG, getRecipeWeightG, netCarbsFromMap
      targets.js          # calcTargetsFromProfile, deriveMacrosFromKcal, getStatus, getPct, fmt
      tests/              # unit tests (Node --test); run `npm run test` for the current count
    sources/              # stateless network / local data access
      usdaSource.js       # searchUSDA, fetchFoodDetails, extractNutrients
      offSource.js        # searchOFF, normalizeOFFNutrients, lookupBarcodeOFF
      customSource.js     # search custom ingredients from state
      recipeSource.js     # search recipes from state
      barcode/decoder.js  # decodeBarcodeFromBlob (BarcodeDetector → ZBar WASM fallback)
    store/
      store.js            # state, dispatch, subscribe — tiny pub/sub
      persistence.js      # buildPayload, applyPayload, migrations (v1→v2→v3), debounced save
    views/                # render functions — read state, write innerHTML
      escape.js           # escapeHtml — must wrap every user/API string in templates
      nutrientGrid.js     # NutrientGrid partial (replaces both renderNutrients + detail copies)
      blamePanel.js       # BlamePanel partial (single renderer for day/week/recipe)
      planView.js
      nutrientsView.js
      recipesView.js
      recipeEditor.js
      customIngEditor.js
      foodsView.js
      searchModal.js
      ingredientDetail.js
      targetsView.js
      configView.js
      unitSelector.js
      uiState.js          # page navigation, overlay stack, Esc handling
      resize.js           # sidebar + blame-panel drag resize
backups/
  nourish-backup-*.json    # user's own local data exports, gitignored — not used by tests
```

Unit tests use a synthetic fixture (`app/src/domain/tests/fixture.json`), not real backup data — CI can't load gitignored files.

## Hard constraints

- **No backend, ever.** All logic, storage, and API calls stay in the browser. This is permanent.
- **No paid services.** USDA FDC (free key), Open Food Facts (no key), CDN libs (zero cost).
- **Single-file distribution.** Output is one HTML file shared by email / USB.
- **First-class Firefox support.** `privacy.resistFingerprinting` is a tested configuration. Never use Canvas 2D for reading pixel data — use the UPNG + ZBar WASM path for barcode images. Validate any new Canvas/WebGL/timing feature under that setting.
- **Transparent propagation.** Editing a custom ingredient must update every plan item and recipe ingredient referencing it. Schema v3 enforces this via the `foods` registry (P14).

## Development workflow

```bash
cd app
npm run test    # unit tests (Node built-in test runner)
npm run build   # esbuild → meal-planner-dist.html (single self-contained file)
npm run dev     # serve on :8080 for manual testing
```

Tests use Node's `--test` runner; no extra dependencies. Test files live in `src/domain/tests/`.


## Store and state

All mutable state lives in `state` (exported from `src/store/store.js`). Every mutation goes through `dispatch(action)`. Never mutate `state` directly outside a reducer.

Persisted slices: `plan`, `recipes`, `customIngredients`, `foods`, `targets`, `userProfile`.

The `foods` registry (`state.foods`) is the single source of truth for nutrient data. Plan items and recipe ingredients hold only `fdcId` references — no embedded nutrient maps. Custom-ingredient saves mirror into `foods` automatically in the reducer.

Persistence is a single debounced subscriber — no call site invokes `save` directly.

## Schema

Current version: **v3**. Migration runner in `persistence.js` handles v1→v2→v3 on load. Any schema change requires:
1. A new `migrations[n]` entry.
2. A bump to the `VERSION` constant.
3. A test in `domain/tests/` if the migration is non-trivial.

## Coding conventions

- All user-supplied and API-supplied strings interpolated into HTML **must** go through `escapeHtml` from `src/views/escape.js`. No exceptions.
- Event handlers use `data-action` delegation on page/modal roots — no `onclick="..."` strings in templates.
- Domain modules (`src/domain/`) must remain pure: no `document`, no `fetch`, no `localStorage`. If you find yourself importing from the DOM, the logic belongs in a view or source instead.
- `recipeNutrientsPer100g` is memoised by recipe id — do not break the memo key or add side effects inside it.
- `genId` in `id.js` uses a namespace prefix (`r` for recipes, `c` for custom); keep this consistent.


## External APIs

| API | Purpose | Key |
|-----|---------|-----|
| `api.nal.usda.gov/fdc/v1/foods/search` | Food name search | `DEMO_KEY` default; user can set own key in Config |
| `api.nal.usda.gov/fdc/v1/food/{id}` | Nutrient detail | Same key |
| `world.openfoodfacts.org/cgi/search.pl` | Branded food search | None |
| `world.openfoodfacts.org/api/v0/product/{barcode}.json` | Barcode lookup | None |

Lazy CDN deps (loaded on first use): `pako@2.1.0`, `upng-js@2.1.0`, `@undecaf/zbar-wasm@0.9.15`, `jspdf@2.5.2` — all from jsDelivr.

## Nutrient key convention

USDA nutrient keys are partial-matched via case-insensitive `.includes()` against `TARGETS` keys (e.g. `'Carbohydrate'` matches `'Carbohydrate, by difference'`). This is load-bearing — do not rename TARGETS keys or canonicalise nutrient keys in storage without regression-testing every `getNutrientVal` / `findNutrientVal` call site.

OFF nutrients are normalised once in `offSource.js` (`normalizeOFFNutrients`) into the same key space with hard-coded multipliers. That table is the only place the OFF→canonical mapping lives.
