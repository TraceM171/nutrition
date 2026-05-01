export function initBlameResize() {
  const panel  = document.getElementById('blame-panel');
  const handle = document.getElementById('blame-resize');
  const saved  = localStorage.getItem('blamePanelWidth');
  if (saved) panel.style.width = parseInt(saved) + 'px';

  handle.addEventListener('pointerdown', e => {
    handle.setPointerCapture(e.pointerId);
    const startX = e.clientX;
    const startW = panel.offsetWidth;
    panel.classList.add('resizing');
    document.body.style.cursor     = 'col-resize';
    document.body.style.userSelect = 'none';

    function onMove(ev) {
      // dragging left = larger panel (panel is anchored to the right)
      const w = Math.max(280, Math.min(700, startW + startX - ev.clientX));
      panel.style.width = w + 'px';
    }
    function onUp() {
      panel.classList.remove('resizing');
      document.body.style.cursor     = '';
      document.body.style.userSelect = '';
      localStorage.setItem('blamePanelWidth', panel.offsetWidth);
      handle.removeEventListener('pointermove', onMove);
      handle.removeEventListener('pointerup',   onUp);
    }
    handle.addEventListener('pointermove', onMove);
    handle.addEventListener('pointerup',   onUp);
    e.preventDefault();
  });
}

export function initSidebarResize() {
  const sidebar = document.querySelector('.sidebar');
  const handle  = document.getElementById('sidebar-drag');
  const saved   = localStorage.getItem('sidebarWidth');
  if (saved) sidebar.style.width = parseInt(saved) + 'px';

  handle.addEventListener('pointerdown', e => {
    handle.setPointerCapture(e.pointerId);
    const startX = e.clientX;
    const startW = sidebar.offsetWidth;
    sidebar.classList.add('resizing');
    document.body.style.cursor     = 'col-resize';
    document.body.style.userSelect = 'none';

    function onMove(ev) {
      const w = Math.max(120, Math.min(400, startW + ev.clientX - startX));
      sidebar.style.width = w + 'px';
    }
    function onUp() {
      sidebar.classList.remove('resizing');
      document.body.style.cursor     = '';
      document.body.style.userSelect = '';
      localStorage.setItem('sidebarWidth', sidebar.offsetWidth);
      handle.removeEventListener('pointermove', onMove);
      handle.removeEventListener('pointerup',   onUp);
    }
    handle.addEventListener('pointermove', onMove);
    handle.addEventListener('pointerup',   onUp);
    e.preventDefault();
  });
}
