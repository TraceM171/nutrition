let _timer  = null;
let _undoFn = null;

export function showUndo(message, undoFn) {
  _undoFn = undoFn;
  document.getElementById('snackbar-msg').textContent = message;
  const el = document.getElementById('snackbar');
  clearTimeout(_timer);
  el.classList.add('show');
  _timer = setTimeout(hideSnackbar, 5000);
}

export function hideSnackbar() {
  clearTimeout(_timer);
  _timer = null;
  document.getElementById('snackbar').classList.remove('show');
  _undoFn = null;
}

export function executeUndo() {
  const fn = _undoFn;
  hideSnackbar();
  fn?.();
}
