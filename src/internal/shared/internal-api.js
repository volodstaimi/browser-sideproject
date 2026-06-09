/*
 * Shared bootstrap for browser:// internal pages.
 * - Applies the current theme (and keeps it in sync).
 * - Exposes window.AetherInternal = { api, escapeHtml, fmtBytes, timeAgo }.
 * window.browserAPI is the privileged bridge injected by webview-preload.js.
 */
(function () {
  const api = window.browserAPI || null;

  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => (
      { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
    ));
  }
  function fmtBytes(n) {
    if (!n && n !== 0) return '';
    if (n < 1024) return n + ' B';
    const u = ['KB', 'MB', 'GB', 'TB'];
    let i = -1; let v = n;
    do { v /= 1024; i += 1; } while (v >= 1024 && i < u.length - 1);
    return v.toFixed(1) + ' ' + u[i];
  }
  function timeAgo(ts) {
    const s = Math.floor((Date.now() - ts) / 1000);
    if (s < 60) return 'just now';
    if (s < 3600) return Math.floor(s / 60) + ' min ago';
    if (s < 86400) return Math.floor(s / 3600) + ' hr ago';
    return new Date(ts).toLocaleDateString();
  }

  async function applyTheme() {
    if (!api) return;
    try {
      const { settings } = await api.settings.getAll();
      const t = (settings && settings.theme) || 'system';
      const dark = t === 'dark' || (t === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
      document.documentElement.dataset.theme = dark ? 'dark' : 'light';
      const info = await api.app.getInfo();
      document.documentElement.dataset.incognito = info && info.isIncognito ? 'true' : 'false';
    } catch { /* ignore */ }
  }

  // Apply immediately (before paint where possible) and keep in sync.
  applyTheme();
  if (api && api.on) api.on('settings:changed', applyTheme);
  try { window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyTheme); } catch { /* ignore */ }

  window.AetherInternal = { api, escapeHtml, fmtBytes, timeAgo, applyTheme };
}());
