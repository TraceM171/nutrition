import { WebSocketServer } from 'ws';
import { state, savePayload } from './state.js';
import { subscribe } from '../../app/src/store/store.js';
import { buildPayload, applyMigrations, applyPayload } from '../../app/src/store/persistence.js';
import { invalidateRecipeMemo } from '../../app/src/domain/recipes.js';

// Live sync with an open browser tab (decision-sync-mechanism.md). Applying an
// incoming browser message mutates `state` directly (mirrors the app's own
// doImport/_applySelectivePayload pattern) rather than going through dispatch,
// so it never re-triggers the broadcast subscriber below — no echo guard needed
// here. The browser side does need one, since it re-renders via a real dispatch.
export function startBridge(port = Number(process.env.NOURISH_BRIDGE_PORT) || 8137) {
  const clients = new Set();

  const broadcast = () => {
    const msg = JSON.stringify(buildPayload(state));
    for (const ws of clients) if (ws.readyState === ws.OPEN) ws.send(msg);
  };

  subscribe(() => broadcast());

  const wss = new WebSocketServer({ port });

  wss.on('connection', ws => {
    clients.add(ws);
    ws.send(JSON.stringify(buildPayload(state)));

    ws.on('message', raw => {
      try {
        const migrated = applyMigrations(JSON.parse(raw.toString()));
        applyPayload(state, migrated);
        invalidateRecipeMemo();
        savePayload();
      } catch (e) {
        // Malformed message from the page — ignore, keep the connection open.
      }
    });

    ws.on('close', () => clients.delete(ws));
    ws.on('error', () => clients.delete(ws));
  });

  wss.on('error', e => {
    console.error(`[nourish-mcp] bridge failed to start on port ${port}: ${e.message}`);
  });

  wss.on('listening', () => {
    console.error(`[nourish-mcp] bridge listening on ws://localhost:${port}`);
  });

  return wss;
}
