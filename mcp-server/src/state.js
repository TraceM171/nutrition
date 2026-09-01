import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname } from 'node:path';
import { homedir } from 'node:os';
import { join } from 'node:path';

import { state } from '../../app/src/store/store.js';
import { buildPayload, applyMigrations, applyPayload } from '../../app/src/store/persistence.js';
import { invalidateRecipeMemo } from '../../app/src/domain/recipes.js';
import { TARGETS } from '../../app/src/domain/constants.js';

export function getDataFilePath() {
  return process.env.NOURISH_DATA_FILE || join(homedir(), '.nourish', 'data.json');
}

// One-time shape seed — mirrors the browser's init(): a fresh in-memory plan
// has DAYS×MEALS arrays and the full TARGETS metadata before anything loads on top.
function seedDefaults() {
  state.targets = JSON.parse(JSON.stringify(TARGETS));
  applyPayload(state, { plan: {} }); // triggers the DAYS/MEALS backfill in applyPayload
}

let _seeded = false;

// Loads the payload file (if any) onto the shared `state` singleton. Always
// re-reads from disk and re-parses fresh — never reuses a previously-parsed
// object, since `applyMigrations` mutates its input in place for v1/v2 payloads.
export function loadPayload(filePath = getDataFilePath()) {
  if (!_seeded) { seedDefaults(); _seeded = true; }
  if (!existsSync(filePath)) return;
  const raw = JSON.parse(readFileSync(filePath, 'utf8'));
  const migrated = applyMigrations(raw);
  applyPayload(state, migrated);
  invalidateRecipeMemo();
}

export function savePayload(filePath = getDataFilePath()) {
  const dir = dirname(filePath);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(filePath, JSON.stringify(buildPayload(state), null, 2));
}

export { state };
