(() => {
  const modeKey = 'route-optimization:mode:v1';
  const paletteKey = 'route-optimization:palette:v1';
  const modes = ['auto', 'light', 'dark'];
  const palettes = ['blue', 'plum', 'copper'];
  const system = window.matchMedia('(prefers-color-scheme: dark)');
  const root = document.documentElement;
  const browserColor = document.querySelector('meta[name="theme-color"]');
  let mode = 'auto';
  let palette = 'blue';

  function loadPreferences() {
    try {
      const saved = localStorage.getItem(modeKey);
      const legacy = localStorage.getItem('preferredTheme');
      const color = localStorage.getItem(paletteKey);
      mode = modes.includes(saved) ? saved : 'auto';
      palette = palettes.includes(color) ? color : 'blue';
      if (saved === null && ['light', 'dark'].includes(legacy)) {
        mode = legacy;
        localStorage.setItem(modeKey, mode);
      }
    } catch { /* Keep the session preferences when storage is unavailable. */ }
  }

  function render() {
    const theme = mode === 'auto' ? (system.matches ? 'dark' : 'light') : mode;
    root.dataset.theme = theme;
    root.dataset.palette = palette;
    root.classList.toggle('dark', theme === 'dark');
    browserColor.content = getComputedStyle(root).getPropertyValue('--paper').trim();
    for (const button of document.querySelectorAll('#appearanceDialog button[data-mode], #appearanceDialog button[data-palette]')) {
      const selected = button.dataset.mode === mode || button.dataset.palette === palette;
      button.setAttribute('aria-pressed', String(selected));
    }
  }
  loadPreferences();
  render();
  system.addEventListener('change', () => { if (mode === 'auto') render(); });
  window.addEventListener('storage', event => {
    if (event.key === null || event.key === modeKey || event.key === paletteKey) {
      loadPreferences();
      render();
    }
  });
  document.addEventListener('DOMContentLoaded', () => {
    const dialog = document.getElementById('appearanceDialog');
    const opener = document.getElementById('appearanceButton');
    opener.addEventListener('click', () => dialog.showModal());
    document.getElementById('closeAppearance').addEventListener('click', () => dialog.close());
    dialog.addEventListener('close', () => opener.focus());
    dialog.addEventListener('click', event => {
      const button = event.target.closest('button');
      if (!button) return;
      let key;
      let value;
      if (modes.includes(button.dataset.mode)) {
        key = modeKey;
        mode = value = button.dataset.mode;
      } else if (palettes.includes(button.dataset.palette)) {
        key = paletteKey;
        palette = value = button.dataset.palette;
      } else return;
      try { localStorage.setItem(key, value); } catch { /* Selection still applies for this visit. */ }
      render();
    });
    render();
  });
})();
