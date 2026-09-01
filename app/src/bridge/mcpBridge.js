// Opt-in live sync with a locally-running Nourish MCP server (decision-sync-mechanism.md).
// Inert by default: config.mcpBridgeEnabled starts false, and every failure mode here
// (connection refused, malformed message) is silent — a user who never runs the MCP
// server sees zero difference from the app with this module absent.
import { state, dispatch, subscribe } from '../store/store.js';
import { applyMigrations, applyPayload, buildPayload } from '../store/persistence.js';
import { invalidateRecipeMemo } from '../domain/recipes.js';
import { config } from '../views/uiState.js';

let _ws = null;
let _reconnectTimer = null;
let _sendTimer = null;
let _applyingRemote = false; // guards against re-broadcasting a change we just received

function _url() {
  return `ws://localhost:${config.mcpBridgePort || 8137}`;
}

function _connect() {
  if (_ws || !config.mcpBridgeEnabled) return;
  let ws;
  try { ws = new WebSocket(_url()); } catch (e) { _scheduleReconnect(); return; }
  _ws = ws;

  ws.addEventListener('message', ev => {
    try {
      const migrated = applyMigrations(JSON.parse(ev.data));
      _applyingRemote = true;
      applyPayload(state, migrated);
      invalidateRecipeMemo();
      dispatch({ type: 'PAYLOAD_LOAD' });
    } catch (e) {
      // Malformed message — ignore, keep the connection open.
    } finally {
      _applyingRemote = false;
    }
  });
  ws.addEventListener('close', () => { _ws = null; if (config.mcpBridgeEnabled) _scheduleReconnect(); });
  ws.addEventListener('error', () => {}); // 'close' follows; nothing else to do here
}

function _disconnect() {
  clearTimeout(_reconnectTimer);
  _reconnectTimer = null;
  if (_ws) { try { _ws.close(); } catch (e) {} _ws = null; }
}

function _scheduleReconnect() {
  clearTimeout(_reconnectTimer);
  _reconnectTimer = setTimeout(_connect, 3000);
}

function _send() {
  clearTimeout(_sendTimer);
  _sendTimer = setTimeout(() => {
    if (_ws && _ws.readyState === WebSocket.OPEN) {
      try { _ws.send(JSON.stringify(buildPayload(state))); } catch (e) {}
    }
  }, 500);
}

export function initMcpBridge() {
  subscribe(() => {
    if (_applyingRemote || !config.mcpBridgeEnabled) return;
    _send();
  });
  if (config.mcpBridgeEnabled) _connect();
}

export function setMcpBridgeEnabled(on) {
  config.mcpBridgeEnabled = on;
  if (on) _connect(); else _disconnect();
}

export function setMcpBridgePort(port) {
  config.mcpBridgePort = port;
  if (config.mcpBridgeEnabled) { _disconnect(); _connect(); }
}
