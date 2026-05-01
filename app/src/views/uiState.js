// Shared mutable UI state for cross-cutting concerns.
// All modules may read/write these directly.
export const config = { usdaKey: 'DEMO_KEY', pdfPagePerRecipe: true, pdfShowMacros: true, shoppingListFormat: 'interactive' };
export const ui     = { analysisDay: null, blameDetailRecipe: null };

export function bringToFront(el) {
  const openZs = [...document.querySelectorAll('.modal-overlay.open')]
    .map(m => parseInt(m.style.zIndex) || 100);
  el.style.zIndex = Math.max(100, ...openZs) + 1;
}

export function resetZ(el) { el.style.zIndex = ''; }

// Returns the ID of the topmost open modal-overlay (highest z-index), or null.
export function getTopmostOpenModalId() {
  const modals = [...document.querySelectorAll('.modal-overlay.open')];
  if (!modals.length) return null;
  modals.sort((a, b) => (parseInt(b.style.zIndex) || 100) - (parseInt(a.style.zIndex) || 100));
  return modals[0].id || null;
}
