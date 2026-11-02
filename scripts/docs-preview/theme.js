// Apply the saved preference before CSS loads to avoid a theme flash.
(() => {
  let theme = 'system';
  try { theme = localStorage.getItem('docs-theme') || theme; }
  catch { /* Storage can be unavailable in private browser contexts. */ }
  if (!['light', 'system', 'dark'].includes(theme)) theme = 'system';
  document.documentElement.dataset.theme = theme;
  document.documentElement.dataset.appearance = theme === 'system'
    ? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
    : theme;
})();
