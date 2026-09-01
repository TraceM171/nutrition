import { config } from './uiState.js';
import { setMcpBridgeEnabled, setMcpBridgePort } from '../bridge/mcpBridge.js';

export function renderConfig() {
  const keyInput  = document.getElementById('usda-key-input');
  const keyStatus = document.getElementById('api-key-status');
  keyInput.value = config.usdaKey;
  keyStatus.textContent = config.usdaKey === 'DEMO_KEY'
    ? 'Using shared DEMO_KEY — searches may be slow or rate-limited'
    : '✓ Custom key active';
  keyStatus.style.color = config.usdaKey === 'DEMO_KEY' ? 'var(--warn)' : 'var(--good)';
  const splitToggle = document.getElementById('pdf-split-toggle');
  if (splitToggle) splitToggle.checked = config.pdfPagePerRecipe;
  const macrosToggle = document.getElementById('pdf-macros-toggle');
  if (macrosToggle) macrosToggle.checked = config.pdfShowMacros;
  const excludeUnusedToggle = document.getElementById('pdf-exclude-unused-toggle');
  if (excludeUnusedToggle) excludeUnusedToggle.checked = config.pdfExcludeUnused;
  const fmtRadio = document.querySelector(`input[name="shopping-format"][value="${config.shoppingListFormat}"]`);
  if (fmtRadio) fmtRadio.checked = true;
  const mcpToggle = document.getElementById('mcp-bridge-toggle');
  if (mcpToggle) mcpToggle.checked = config.mcpBridgeEnabled;
  const mcpPortInput = document.getElementById('mcp-bridge-port-input');
  if (mcpPortInput) mcpPortInput.value = config.mcpBridgePort;
}

export function saveApiKey() {
  const val = document.getElementById('usda-key-input').value.trim();
  config.usdaKey = val || 'DEMO_KEY';
  try { localStorage.setItem('nourish_usda_key', config.usdaKey); } catch(e) {}
  const status = document.getElementById('api-key-status');
  status.textContent = config.usdaKey === 'DEMO_KEY' ? 'Using shared DEMO_KEY' : '✓ Custom key saved';
  status.style.color = config.usdaKey === 'DEMO_KEY' ? 'var(--warn)' : 'var(--good)';
}

export function loadApiKey() {
  try {
    const stored = localStorage.getItem('nourish_usda_key');
    if (stored) config.usdaKey = stored;
  } catch(e) {}
  try {
    const stored = localStorage.getItem('nourish_pdf_split');
    if (stored !== null) config.pdfPagePerRecipe = stored === '1';
  } catch(e) {}
  try {
    const stored = localStorage.getItem('nourish_pdf_macros');
    if (stored !== null) config.pdfShowMacros = stored === '1';
  } catch(e) {}
  try {
    const stored = localStorage.getItem('nourish_pdf_exclude_unused');
    if (stored !== null) config.pdfExcludeUnused = stored === '1';
  } catch(e) {}
  try {
    const stored = localStorage.getItem('nourish_shopping_format');
    if (stored) config.shoppingListFormat = stored;
  } catch(e) {}
  try {
    const stored = localStorage.getItem('nourish_mcp_bridge_port');
    if (stored) config.mcpBridgePort = parseInt(stored, 10) || config.mcpBridgePort;
  } catch(e) {}
  try {
    const stored = localStorage.getItem('nourish_mcp_bridge_enabled');
    if (stored === '1') config.mcpBridgeEnabled = true;
  } catch(e) {}
}

export function toggleMcpBridge(el) {
  setMcpBridgeEnabled(el.checked);
  try { localStorage.setItem('nourish_mcp_bridge_enabled', el.checked ? '1' : '0'); } catch(e) {}
}

export function setMcpBridgePortFromInput(el) {
  const port = parseInt(el.value, 10);
  if (!port || port < 1 || port > 65535) return;
  setMcpBridgePort(port);
  try { localStorage.setItem('nourish_mcp_bridge_port', String(port)); } catch(e) {}
}

export function togglePdfSplit(el) {
  config.pdfPagePerRecipe = el.checked;
  try { localStorage.setItem('nourish_pdf_split', el.checked ? '1' : '0'); } catch(e) {}
}

export function togglePdfMacros(el) {
  config.pdfShowMacros = el.checked;
  try { localStorage.setItem('nourish_pdf_macros', el.checked ? '1' : '0'); } catch(e) {}
}

export function togglePdfExcludeUnused(el) {
  config.pdfExcludeUnused = el.checked;
  try { localStorage.setItem('nourish_pdf_exclude_unused', el.checked ? '1' : '0'); } catch(e) {}
}

export function setShoppingFormat(val) {
  config.shoppingListFormat = val;
  try { localStorage.setItem('nourish_shopping_format', val); } catch(e) {}
}
