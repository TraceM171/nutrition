import { config } from './uiState.js';

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
  const fmtRadio = document.querySelector(`input[name="shopping-format"][value="${config.shoppingListFormat}"]`);
  if (fmtRadio) fmtRadio.checked = true;
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
    const stored = localStorage.getItem('nourish_shopping_format');
    if (stored) config.shoppingListFormat = stored;
  } catch(e) {}
}

export function togglePdfSplit(el) {
  config.pdfPagePerRecipe = el.checked;
  try { localStorage.setItem('nourish_pdf_split', el.checked ? '1' : '0'); } catch(e) {}
}

export function togglePdfMacros(el) {
  config.pdfShowMacros = el.checked;
  try { localStorage.setItem('nourish_pdf_macros', el.checked ? '1' : '0'); } catch(e) {}
}

export function setShoppingFormat(val) {
  config.shoppingListFormat = val;
  try { localStorage.setItem('nourish_shopping_format', val); } catch(e) {}
}
