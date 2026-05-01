import { bringToFront, resetZ } from './uiState.js';

let _onConfirm = null;

export function openDeleteConfirm(name, onConfirm) {
  _onConfirm = onConfirm;
  document.getElementById('delete-confirm-name').textContent = name;
  const el = document.getElementById('delete-confirm-modal');
  el.classList.add('open');
  bringToFront(el);
}

export function closeDeleteConfirm() {
  const el = document.getElementById('delete-confirm-modal');
  el.classList.remove('open');
  resetZ(el);
  _onConfirm = null;
}

export function executeDeleteConfirm() {
  const fn = _onConfirm;
  closeDeleteConfirm();
  fn?.();
}
