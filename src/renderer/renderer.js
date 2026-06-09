'use strict';

/*
 * Aether chrome renderer. Owns the tab model, the <webview> lifecycle, and all
 * chrome UI (tab strip, omnibox + suggestions, toolbar, find bar, downloads,
 * bookmarks, context menus, theming). Talks to main only via window.browserAPI.
 *
 * Written as a single classic script (no ES modules) because the shell is
 * loaded over file:// where module imports are blocked.
 */

const api = window.browserAPI;

/* ------------------------------------------------------------------ */
/* Icons                                                              */
/* ------------------------------------------------------------------ */
const S = (p, opts = '') => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" ${opts}>${p}</svg>`;
const ICON = {
  back: S('<path d="M15 18l-6-6 6-6"/>'),
  forward: S('<path d="M9 18l6-6-6-6"/>'),
  reload: S('<path d="M21 12a9 9 0 1 1-2.64-6.36"/><path d="M21 3v6h-6"/>'),
  stop: S('<path d="M6 6l12 12M18 6L6 18"/>'),
  home: S('<path d="M3 11l9-8 9 8"/><path d="M5 10v10h14V10"/>'),
  lock: S('<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>'),
  info: S('<circle cx="12" cy="12" r="9"/><path d="M12 8h.01M11 12h1v4h1"/>'),
  file: S('<path d="M6 2h8l4 4v16H6z"/><path d="M14 2v4h4"/>'),
  globe: S('<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>'),
  search: S('<circle cx="11" cy="11" r="7"/><path d="M21 21l-4-4"/>'),
  star: S('<path d="M12 3l2.6 5.6 6.1.7-4.5 4.1 1.2 6L12 16.9 6.6 19.5l1.2-6L3.3 9.3l6.1-.7z"/>'),
  starFilled: S('<path d="M12 3l2.6 5.6 6.1.7-4.5 4.1 1.2 6L12 16.9 6.6 19.5l1.2-6L3.3 9.3l6.1-.7z" fill="currentColor"/>'),
  download: S('<path d="M12 3v12"/><path d="M7 11l5 5 5-5"/><path d="M5 21h14"/>'),
  menu: S('<circle cx="12" cy="5" r="1.6" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none"/><circle cx="12" cy="19" r="1.6" fill="currentColor" stroke="none"/>'),
  close: S('<path d="M5 5l14 14M19 5L5 19"/>'),
  minimize: S('<path d="M5 12h14"/>'),
  maximize: S('<rect x="5" y="5" width="14" height="14" rx="1"/>'),
  restore: S('<rect x="7" y="7" width="11" height="11" rx="1"/><path d="M7 4h10a3 3 0 0 1 3 3v10"/>'),
  plus: S('<path d="M12 5v14M5 12h14"/>'),
  x: S('<path d="M6 6l12 12M18 6L6 18"/>'),
  incognito: S('<circle cx="8" cy="15" r="3"/><circle cx="16" cy="15" r="3"/><path d="M3 11h18M8 11l1.5-4h5L16 11"/>'),
  folder: S('<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>'),
  openNew: S('<path d="M14 4h6v6"/><path d="M20 4l-9 9"/><path d="M19 13v6H5V5h6"/>'),
  copy: S('<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h8"/>'),
  print: S('<path d="M7 8V3h10v5"/><rect x="4" y="8" width="16" height="8" rx="1"/><path d="M7 16h10v5H7z"/>'),
  pdf: S('<path d="M6 2h8l4 4v16H6z"/><path d="M9 13h2a1.5 1.5 0 0 1 0 3H9zm0 0v6"/>'),
  settings: S('<circle cx="12" cy="12" r="3"/><path d="M19 12a7 7 0 0 0-.1-1l2-1.5-2-3.5-2.3 1a7 7 0 0 0-1.7-1l-.3-2.5h-4l-.3 2.5a7 7 0 0 0-1.7 1l-2.3-1-2 3.5 2 1.5a7 7 0 0 0 0 2l-2 1.5 2 3.5 2.3-1a7 7 0 0 0 1.7 1l.3 2.5h4l.3-2.5a7 7 0 0 0 1.7-1l2.3 1 2-3.5-2-1.5a7 7 0 0 0 .1-1z"/>'),
  history: S('<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/><path d="M12 8v4l3 2"/>'),
  bookmarks: S('<path d="M6 3h12v18l-6-4-6 4z"/>'),
  trash: S('<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>'),
  mute: S('<path d="M11 5L6 9H3v6h3l5 4z"/><path d="M16 9l5 6M21 9l-5 6"/>'),
  volume: S('<path d="M11 5L6 9H3v6h3l5 4z"/><path d="M15 9a4 4 0 0 1 0 6"/>'),
  pin: S('<path d="M12 3v7M8 10h8l-1 5H9z"/><path d="M12 15v6"/>'),
  duplicate: S('<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M4 16V6a2 2 0 0 1 2-2h10"/>'),
  newWindow: S('<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18"/>'),
  check: S('<path d="M5 12l5 5L20 6"/>'),
};

/* ------------------------------------------------------------------ */
/* State + DOM refs                                                   */
/* ------------------------------------------------------------------ */
const tabs = [];
let activeTabId = null;
let tabSeq = 0;
let meta = { isIncognito: false, partition: 'persist:aether', platform: 'win32' };
let settings = {};
const recentlyClosed = [];
let dragId = null;

const $ = (id) => document.getElementById(id);
const els = {};
['shell', 'titlebar', 'tabstrip', 'newTabBtn', 'titlebarDrag', 'windowControls', 'winMinimize',
 'winMaximize', 'winClose', 'toolbar', 'backBtn', 'forwardBtn', 'reloadBtn', 'homeBtn', 'omnibox',
 'securityIndicator', 'omniboxInput', 'zoomChip', 'bookmarkStar', 'downloadsBtn', 'dlRing', 'menuBtn',
 'bookmarksBar', 'pageArea', 'progressBar', 'findBar', 'findInput', 'findCount', 'findPrev', 'findNext',
 'findClose', 'webviews', 'statusBubble', 'suggestions', 'popoverLayer', 'toastContainer', 'ctxMenu']
  .forEach((id) => { els[id] = $(id); });

/* ------------------------------------------------------------------ */
/* Small helpers                                                      */
/* ------------------------------------------------------------------ */
function debounce(fn, ms) {
  let t;
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}
function getTab(id) { return tabs.find((t) => t.id === id); }
function activeTab() { return getTab(activeTabId); }
function escapeHtml(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function originOf(url) { try { return new URL(url).origin; } catch { return null; } }

function displayUrl(url) {
  if (!url || url === 'browser://newtab' || url === settings.newTabUrl) return '';
  if (url.startsWith('browser://')) return url;
  try {
    const u = new URL(url);
    let s = (u.protocol === 'http:' ? '' : '') + u.host + (u.pathname === '/' ? '' : u.pathname) + u.search + u.hash;
    return s || url;
  } catch { return url; }
}

function securityFor(url) {
  if (!url) return { cls: '', icon: 'search', label: '' };
  if (url.startsWith('https://')) return { cls: 'secure', icon: 'lock', label: '' };
  if (url.startsWith('browser://')) return { cls: 'info', icon: 'info', label: 'Aether' };
  if (url.startsWith('file://')) return { cls: 'secure', icon: 'file', label: '' };
  if (url.startsWith('http://')) return { cls: 'insecure', icon: 'info', label: 'Not secure' };
  return { cls: '', icon: 'globe', label: '' };
}

/* ------------------------------------------------------------------ */
/* Tabs                                                               */
/* ------------------------------------------------------------------ */
function createTab(url, opts = {}) {
  const id = 't' + (++tabSeq);
  const target = url || settings.newTabUrl || 'browser://newtab';

  const webview = document.createElement('webview');
  webview.setAttribute('partition', meta.partition);
  webview.setAttribute('allowpopups', '');
  webview.setAttribute('src', target);
  webview.dataset.tabId = id;

  const tab = {
    id, webview, url: target, title: 'New tab', favicon: null,
    isLoading: false, canGoBack: false, canGoForward: false,
    pinned: false, audible: false, muted: false, ready: false, zoom: 0,
  };

  const insertAt = opts.atIndex != null ? opts.atIndex : tabs.length;
  tabs.splice(insertAt, 0, tab);
  els.webviews.appendChild(webview);
  buildTabButton(tab, insertAt);
  wireWebview(tab);

  if (!opts.background) activateTab(id);
  scheduleSessionSave();
  return tab;
}

function buildTabButton(tab, index) {
  const btn = document.createElement('div');
  btn.className = 'tab';
  btn.draggable = true;
  btn.dataset.tabId = tab.id;
  btn.innerHTML = `<span class="tab-favicon"></span><span class="tab-title"></span><span class="tab-close" title="Close tab">${ICON.x}</span>`;
  tab.btn = btn;

  btn.addEventListener('mousedown', (e) => {
    if (e.button === 1) { e.preventDefault(); closeTab(tab.id); return; }
    if (e.button === 0 && !e.target.closest('.tab-close')) activateTab(tab.id);
  });
  btn.querySelector('.tab-close').addEventListener('click', (e) => { e.stopPropagation(); closeTab(tab.id); });
  btn.addEventListener('contextmenu', (e) => { e.preventDefault(); showTabContextMenu(tab, e.clientX, e.clientY); });

  btn.addEventListener('dragstart', () => { dragId = tab.id; btn.classList.add('dragging'); });
  btn.addEventListener('dragend', () => { btn.classList.remove('dragging'); dragId = null; persistTabOrder(); });

  const ref = els.tabstrip.children[index];
  els.tabstrip.insertBefore(btn, ref || null);
  updateTabButton(tab);
}

function updateTabButton(tab) {
  if (!tab.btn) return;
  const fav = tab.btn.querySelector('.tab-favicon');
  if (tab.isLoading) {
    fav.style.backgroundImage = 'none';
    fav.innerHTML = '<span class="spinner" style="display:block"></span>';
  } else if (tab.favicon) {
    fav.innerHTML = '';
    fav.style.backgroundImage = `url("${tab.favicon}")`;
  } else {
    fav.style.backgroundImage = 'none';
    fav.innerHTML = ICON.globe;
  }
  tab.btn.querySelector('.tab-title').textContent = tab.title || 'New tab';
  tab.btn.classList.toggle('pinned', tab.pinned);
}

function activateTab(id) {
  const tab = getTab(id);
  if (!tab) return;
  activeTabId = id;
  for (const t of tabs) {
    t.webview.classList.toggle('active', t.id === id);
    if (t.btn) t.btn.classList.toggle('active', t.id === id);
  }
  if (tab.btn) tab.btn.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  setOmniboxToUrl();
  updateSecurity();
  updateNavButtons();
  updateReloadButton();
  updateBookmarkStar();
  updateZoomChip();
  closeFindBar();
  try { tab.webview.focus(); } catch { /* not ready */ }
  scheduleSessionSave();
}

function closeTab(id) {
  const idx = tabs.findIndex((t) => t.id === id);
  if (idx < 0) return;
  const tab = tabs[idx];
  if (!meta.isIncognito && tab.url && !tab.url.startsWith('browser://')) {
    recentlyClosed.push({ url: tab.url, title: tab.title });
    if (recentlyClosed.length > 25) recentlyClosed.shift();
  }
  tab.webview.remove();
  if (tab.btn) tab.btn.remove();
  tabs.splice(idx, 1);

  if (tabs.length === 0) { api.window.close(); return; }
  if (activeTabId === id) {
    const next = tabs[Math.min(idx, tabs.length - 1)];
    activateTab(next.id);
  }
  scheduleSessionSave();
}

function persistTabOrder() {
  // Re-sync the tabs array to DOM order after a drag.
  const order = [...els.tabstrip.children].map((c) => c.dataset.tabId);
  tabs.sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
  scheduleSessionSave();
}

els && els.tabstrip && els.tabstrip.addEventListener('dragover', (e) => {
  e.preventDefault();
  const after = getDragAfterElement(e.clientX);
  const dragging = els.tabstrip.querySelector('.dragging');
  if (!dragging) return;
  if (after == null) els.tabstrip.appendChild(dragging);
  else els.tabstrip.insertBefore(dragging, after);
});
function getDragAfterElement(x) {
  const others = [...els.tabstrip.querySelectorAll('.tab:not(.dragging)')];
  return others.reduce((closest, child) => {
    const box = child.getBoundingClientRect();
    const offset = x - box.left - box.width / 2;
    if (offset < 0 && offset > closest.offset) return { offset, element: child };
    return closest;
  }, { offset: -Infinity, element: null }).element;
}

/* horizontal wheel scroll on tab strip */
els.tabstrip.addEventListener('wheel', (e) => {
  if (e.deltaY !== 0) { els.tabstrip.scrollLeft += e.deltaY; e.preventDefault(); }
}, { passive: false });

/* ------------------------------------------------------------------ */
/* Webview wiring                                                     */
/* ------------------------------------------------------------------ */
function wireWebview(tab) {
  const w = tab.webview;
  w.addEventListener('page-title-updated', (e) => {
    tab.title = e.title; updateTabButton(tab); scheduleSessionSave();
  });
  w.addEventListener('page-favicon-updated', (e) => {
    tab.favicon = (e.favicons && e.favicons[0]) || null; updateTabButton(tab);
  });
  w.addEventListener('did-start-loading', () => {
    tab.isLoading = true; updateTabButton(tab);
    if (tab.id === activeTabId) { startProgress(); updateReloadButton(); }
  });
  w.addEventListener('did-stop-loading', () => {
    tab.isLoading = false; updateTabButton(tab);
    refreshNavState(tab);
    recordHistory(tab);
    if (tab.id === activeTabId) { finishProgress(); updateReloadButton(); updateBookmarkStar(); }
    scheduleSessionSave();
  });
  w.addEventListener('did-navigate', (e) => {
    tab.url = e.url; updateTabButton(tab);
    refreshNavState(tab);
    applyZoom(tab);
    if (tab.id === activeTabId) { setOmniboxToUrl(); updateSecurity(); updateBookmarkStar(); }
  });
  w.addEventListener('did-navigate-in-page', (e) => {
    if (!e.isMainFrame) return;
    tab.url = e.url;
    if (tab.id === activeTabId) { setOmniboxToUrl(); updateSecurity(); }
    refreshNavState(tab);
  });
  w.addEventListener('did-fail-load', (e) => {
    if (e.isMainFrame && e.errorCode !== -3) {
      const q = `code=${e.errorCode}&desc=${encodeURIComponent(e.errorDescription || '')}&url=${encodeURIComponent(e.validatedURL || tab.url || '')}`;
      try { w.loadURL('browser://error?' + q); } catch { /* ignore */ }
    }
  });
  w.addEventListener('dom-ready', () => { tab.ready = true; refreshNavState(tab); applyZoom(tab); });
  w.addEventListener('context-menu', (e) => { e.preventDefault(); showPageContextMenu(tab, e.params); });
  w.addEventListener('found-in-page', (e) => updateFindCount(e.result));
  w.addEventListener('media-started-playing', () => { tab.audible = true; });
  w.addEventListener('media-paused', () => { tab.audible = false; });
  w.addEventListener('enter-html-full-screen', () => document.documentElement.classList.add('chrome-hidden'));
  w.addEventListener('leave-html-full-screen', () => document.documentElement.classList.remove('chrome-hidden'));
  w.addEventListener('update-target-url', (e) => showStatus(e.url));
}

function refreshNavState(tab) {
  try { tab.canGoBack = tab.webview.canGoBack(); tab.canGoForward = tab.webview.canGoForward(); } catch { /* not ready */ }
  if (tab.id === activeTabId) updateNavButtons();
}

function recordHistory(tab) {
  if (meta.isIncognito) return;
  if (!tab.url || tab.url.startsWith('browser://') || tab.url === 'about:blank') return;
  api.history.add({ url: tab.url, title: tab.title, favicon: tab.favicon, transition: 'link' });
}

/* ------------------------------------------------------------------ */
/* Navigation actions                                                 */
/* ------------------------------------------------------------------ */
async function navigateTo(input, { newTab = false } = {}) {
  const res = await api.nav.navigate(input);
  if (!res || !res.url) return;
  if (newTab) createTab(res.url);
  else { const t = activeTab(); if (t) { try { t.webview.loadURL(res.url); } catch { t.webview.setAttribute('src', res.url); } } }
}
function goBack() { const t = activeTab(); try { if (t && t.webview.canGoBack()) t.webview.goBack(); } catch {} }
function goForward() { const t = activeTab(); try { if (t && t.webview.canGoForward()) t.webview.goForward(); } catch {} }
function reload(hard) { const t = activeTab(); if (!t) return; try { hard ? t.webview.reloadIgnoringCache() : t.webview.reload(); } catch {} }
function stop() { const t = activeTab(); try { t && t.webview.stop(); } catch {} }
function goHome() { navigateTo(settings.homeUrl || 'browser://newtab'); }

function updateNavButtons() {
  const t = activeTab();
  els.backBtn.disabled = !(t && t.canGoBack);
  els.forwardBtn.disabled = !(t && t.canGoForward);
}
function updateReloadButton() {
  const t = activeTab();
  els.reloadBtn.innerHTML = (t && t.isLoading) ? ICON.stop : ICON.reload;
  els.reloadBtn.title = (t && t.isLoading) ? 'Stop' : 'Reload (Ctrl+R)';
}

/* progress bar */
let progressTimer = null;
function startProgress() {
  clearTimeout(progressTimer);
  els.progressBar.classList.add('active');
  els.progressBar.style.width = '8%';
  let p = 8;
  progressTimer = setInterval(() => { p = Math.min(p + Math.random() * 12, 85); els.progressBar.style.width = p + '%'; }, 220);
}
function finishProgress() {
  clearInterval(progressTimer);
  els.progressBar.style.width = '100%';
  setTimeout(() => { els.progressBar.classList.remove('active'); els.progressBar.style.width = '0'; }, 220);
}

let statusTimer = null;
function showStatus(text) {
  if (!text) { els.statusBubble.hidden = true; return; }
  els.statusBubble.textContent = text;
  els.statusBubble.hidden = false;
  clearTimeout(statusTimer);
  statusTimer = setTimeout(() => { els.statusBubble.hidden = true; }, 2500);
}

/* ------------------------------------------------------------------ */
/* Omnibox + suggestions                                              */
/* ------------------------------------------------------------------ */
let omniFocused = false;
const sgState = { items: [], selected: -1, query: '' };

function setOmniboxToUrl() {
  if (omniFocused) return;
  const t = activeTab();
  els.omniboxInput.value = displayUrl(t ? t.url : '');
}
function updateSecurity() {
  const t = activeTab();
  const sec = securityFor(t ? t.url : '');
  els.securityIndicator.className = 'security-indicator ' + sec.cls;
  els.securityIndicator.innerHTML = ICON[sec.icon] + (sec.label ? `<span>${sec.label}</span>` : '');
}

const querySuggest = debounce(async (q) => {
  if (!omniFocused || !q) return;
  const openTabs = tabs.map((t) => ({ tabId: t.id, url: t.url, title: t.title }));
  const res = await api.omnibox.suggest(q, openTabs);
  if (sgState.query !== q) return; // stale
  renderSuggestions(q, (res && res.suggestions) || []);
}, 60);

function renderSuggestions(query, items) {
  sgState.items = items;
  sgState.selected = items.length ? 0 : -1;
  if (!items.length) { hideSuggestions(); return; }
  const lq = query.toLowerCase();
  els.suggestions.innerHTML = items.map((s, i) => {
    const iconKey = s.type === 'search' ? 'search' : s.type === 'bookmark' ? 'star' : s.type === 'open-tab' ? 'duplicate' : s.type === 'history' ? 'history' : 'globe';
    const primary = boldMatch(s.title || s.url, lq);
    const secondary = s.type === 'search' ? 'Search' : (s.type === 'open-tab' ? 'Switch to this tab' : displayUrl(s.url));
    return `<div class="sg-row${i === 0 ? ' selected' : ''}" data-i="${i}">
      <span class="sg-icon">${ICON[iconKey]}</span>
      <span class="sg-text"><span class="sg-primary">${primary}</span><span class="sg-secondary">${escapeHtml(secondary)}</span></span>
    </div>`;
  }).join('');
  positionSuggestions();
  els.suggestions.hidden = false;
  [...els.suggestions.querySelectorAll('.sg-row')].forEach((row) => {
    row.addEventListener('mouseenter', () => setSelected(parseInt(row.dataset.i, 10)));
    row.addEventListener('mousedown', (e) => { e.preventDefault(); acceptSuggestion(items[parseInt(row.dataset.i, 10)]); });
  });
}
function boldMatch(text, lq) {
  const t = String(text || '');
  const idx = t.toLowerCase().indexOf(lq);
  if (idx < 0 || !lq) return escapeHtml(t);
  return escapeHtml(t.slice(0, idx)) + '<b>' + escapeHtml(t.slice(idx, idx + lq.length)) + '</b>' + escapeHtml(t.slice(idx + lq.length));
}
function positionSuggestions() {
  const r = els.omnibox.getBoundingClientRect();
  els.suggestions.style.left = r.left + 'px';
  els.suggestions.style.top = (r.bottom + 4) + 'px';
  els.suggestions.style.width = r.width + 'px';
}
function hideSuggestions() { els.suggestions.hidden = true; els.suggestions.innerHTML = ''; sgState.items = []; sgState.selected = -1; }
function setSelected(i) {
  sgState.selected = i;
  [...els.suggestions.querySelectorAll('.sg-row')].forEach((row, idx) => row.classList.toggle('selected', idx === i));
}
function acceptSuggestion(s) {
  if (!s) return;
  omniFocused = false;
  hideSuggestions();
  els.omniboxInput.blur();
  if (s.type === 'open-tab' && s.tabId) { activateTab(s.tabId); return; }
  const t = activeTab();
  if (t) { try { t.webview.loadURL(s.url); } catch { t.webview.setAttribute('src', s.url); } }
}

function bindOmnibox() {
  const input = els.omniboxInput;
  input.addEventListener('focus', () => {
    omniFocused = true;
    els.omnibox.classList.add('focused');
    const t = activeTab();
    if (t && t.url && !t.url.startsWith('browser://newtab')) input.value = t.url;
    setTimeout(() => input.select(), 0);
  });
  input.addEventListener('blur', () => {
    omniFocused = false;
    els.omnibox.classList.remove('focused');
    setTimeout(hideSuggestions, 120);
    setOmniboxToUrl();
  });
  input.addEventListener('input', () => {
    sgState.query = input.value;
    if (!input.value) { hideSuggestions(); return; }
    querySuggest(input.value);
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); if (sgState.items.length) setSelected((sgState.selected + 1) % sgState.items.length); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); if (sgState.items.length) setSelected((sgState.selected - 1 + sgState.items.length) % sgState.items.length); }
    else if (e.key === 'Enter') {
      e.preventDefault();
      if (sgState.selected >= 0 && sgState.items[sgState.selected]) acceptSuggestion(sgState.items[sgState.selected]);
      else if (e.ctrlKey) { navigateTo('www.' + input.value.trim() + '.com'); input.blur(); }
      else { navigateTo(input.value, { newTab: e.altKey }); input.blur(); }
    } else if (e.key === 'Escape') {
      hideSuggestions(); input.blur();
    }
  });
  els.securityIndicator.addEventListener('click', () => showSiteInfo());
}

/* ------------------------------------------------------------------ */
/* Zoom                                                               */
/* ------------------------------------------------------------------ */
function zoomPercent(level) { return Math.round(Math.pow(1.2, level) * 100); }
function applyZoom(tab) {
  const origin = originOf(tab.url);
  const level = (origin && settings.perOriginZoom && settings.perOriginZoom[origin] != null)
    ? settings.perOriginZoom[origin] : (settings.defaultZoom || 0);
  tab.zoom = level;
  try { tab.webview.setZoomLevel(level); } catch { /* not ready */ }
  if (tab.id === activeTabId) updateZoomChip();
}
function changeZoom(delta) {
  const t = activeTab(); if (!t) return;
  if (delta === 0) t.zoom = 0; else t.zoom = Math.max(-5, Math.min(5, (t.zoom || 0) + delta));
  try { t.webview.setZoomLevel(t.zoom); } catch {}
  updateZoomChip();
  const origin = originOf(t.url);
  if (origin && settings.persistPerOriginZoom !== false) {
    const map = Object.assign({}, settings.perOriginZoom);
    if (t.zoom === 0) delete map[origin]; else map[origin] = t.zoom;
    settings.perOriginZoom = map;
    api.settings.set({ perOriginZoom: map });
  }
}
function updateZoomChip() {
  const t = activeTab();
  const lvl = t ? (t.zoom || 0) : 0;
  if (lvl === 0) { els.zoomChip.hidden = true; }
  else { els.zoomChip.hidden = false; els.zoomChip.textContent = zoomPercent(lvl) + '%'; }
}

/* ------------------------------------------------------------------ */
/* Find in page                                                       */
/* ------------------------------------------------------------------ */
function openFindBar() {
  els.findBar.hidden = false;
  els.findInput.focus();
  els.findInput.select();
}
function closeFindBar() {
  if (els.findBar.hidden) return;
  els.findBar.hidden = true;
  const t = activeTab();
  try { t && t.webview.stopFindInPage('clearSelection'); } catch {}
  els.findCount.textContent = '0/0';
}
function bindFind() {
  els.findInput.addEventListener('input', () => {
    const t = activeTab(); if (!t) return;
    if (els.findInput.value) { try { t.webview.findInPage(els.findInput.value); } catch {} }
    else { try { t.webview.stopFindInPage('clearSelection'); } catch {} els.findCount.textContent = '0/0'; }
  });
  els.findInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); findStep(!e.shiftKey); }
    else if (e.key === 'Escape') { closeFindBar(); }
  });
  els.findNext.addEventListener('click', () => findStep(true));
  els.findPrev.addEventListener('click', () => findStep(false));
  els.findClose.addEventListener('click', closeFindBar);
}
function findStep(forward) {
  const t = activeTab(); if (!t || !els.findInput.value) return;
  try { t.webview.findInPage(els.findInput.value, { forward, findNext: true }); } catch {}
}
function updateFindCount(result) {
  if (!result) return;
  if (result.matches != null) els.findCount.textContent = `${result.activeMatchOrdinal || 0}/${result.matches}`;
}

/* ------------------------------------------------------------------ */
/* Bookmarks                                                          */
/* ------------------------------------------------------------------ */
async function updateBookmarkStar() {
  const t = activeTab();
  if (!t || !t.url || t.url.startsWith('browser://')) { els.bookmarkStar.classList.remove('bookmarked'); return; }
  const r = await api.bookmarks.isBookmarked(t.url);
  els.bookmarkStar.classList.toggle('bookmarked', !!(r && r.bookmarked));
}
async function toggleBookmark() {
  const t = activeTab();
  if (!t || !t.url || t.url.startsWith('browser://')) return;
  const r = await api.bookmarks.isBookmarked(t.url);
  if (r && r.bookmarked) { showBookmarkEditor(t, r.id); }
  else {
    const res = await api.bookmarks.add({ url: t.url, title: t.title, favicon: t.favicon, folderId: 'bar' });
    updateBookmarkStar();
    showBookmarkEditor(t, res.bookmark && res.bookmark.id, true);
  }
}
function showBookmarkEditor(tab, id, isNew) {
  const pop = popover(els.bookmarkStar, `
    <h3>${isNew ? 'Bookmark added' : 'Edit bookmark'}</h3>
    <label>Name</label>
    <input id="bmName" value="${escapeHtml(tab.title || tab.url)}" />
    <div class="popover-actions">
      <button class="btn btn-text" id="bmRemove">Remove</button>
      <button class="btn" id="bmCancel">Cancel</button>
      <button class="btn btn-primary" id="bmSave">Done</button>
    </div>`);
  pop.querySelector('#bmName').focus();
  pop.querySelector('#bmSave').onclick = async () => { await api.bookmarks.update(id, { title: pop.querySelector('#bmName').value }); closePopovers(); };
  pop.querySelector('#bmCancel').onclick = closePopovers;
  pop.querySelector('#bmRemove').onclick = async () => { await api.bookmarks.remove(id); updateBookmarkStar(); closePopovers(); toast('Bookmark removed'); };
}

async function buildBookmarksBar() {
  if (els.bookmarksBar.hidden) return;
  const { bookmarks } = await api.bookmarks.list('bar');
  if (!bookmarks.length) { els.bookmarksBar.innerHTML = '<span class="bm-empty">Bookmark pages to see them here</span>'; return; }
  els.bookmarksBar.innerHTML = '';
  bookmarks.forEach((b) => {
    const chip = document.createElement('div');
    chip.className = 'bm-chip';
    chip.title = b.url;
    chip.innerHTML = `<span class="bm-favicon" style="${b.favicon ? `background-image:url('${b.favicon}')` : ''}">${b.favicon ? '' : ICON.globe}</span><span class="bm-label">${escapeHtml(b.title || b.url)}</span>`;
    chip.addEventListener('click', () => navigateTo(b.url));
    chip.addEventListener('auxclick', (e) => { if (e.button === 1) createTab(b.url, { background: true }); });
    chip.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      contextMenu(e.clientX, e.clientY, [
        { label: 'Open', icon: 'openNew', action: () => navigateTo(b.url) },
        { label: 'Open in new tab', icon: 'duplicate', action: () => createTab(b.url, { background: true }) },
        { sep: true },
        { label: 'Remove', icon: 'trash', action: async () => { await api.bookmarks.remove(b.id); buildBookmarksBar(); updateBookmarkStar(); } },
      ]);
    });
    els.bookmarksBar.appendChild(chip);
  });
}
function updateBookmarksBarVisibility() {
  els.bookmarksBar.hidden = !settings.showBookmarksBar;
  if (settings.showBookmarksBar) buildBookmarksBar();
}
function updateHomeButton() { els.homeBtn.hidden = !settings.showHomeButton; }

/* ------------------------------------------------------------------ */
/* Downloads UI                                                       */
/* ------------------------------------------------------------------ */
const dlActive = new Map();
function bindDownloads() {
  api.on('downloads:started', (rec) => {
    dlActive.set(rec.id, rec);
    els.downloadsBtn.hidden = false;
    els.downloadsBtn.classList.add('downloading');
    updateDlRing();
    if (dlPopoverOpen()) refreshDlPopover();
  });
  api.on('downloads:progress', (p) => {
    const rec = dlActive.get(p.id); if (rec) Object.assign(rec, p);
    updateDlRing();
    if (dlPopoverOpen()) refreshDlPopover();
  });
  api.on('downloads:done', (d) => {
    const rec = dlActive.get(d.id); if (rec) { rec.state = d.state; rec.savePath = d.savePath; }
    dlActive.delete(d.id);
    if (![...dlActive.values()].some((r) => r.state === 'progressing')) {
      els.downloadsBtn.classList.remove('downloading');
      els.downloadsBtn.classList.add('dl-complete');
      setTimeout(() => els.downloadsBtn.classList.remove('dl-complete'), 600);
    }
    updateDlRing();
    if (dlPopoverOpen()) refreshDlPopover();
  });
  api.on('downloads:changed', () => { if (dlPopoverOpen()) refreshDlPopover(); });
}
function updateDlRing() {
  const inflight = [...dlActive.values()].filter((r) => r.state === 'progressing');
  if (!inflight.length) { els.dlRing.style.setProperty('--p', 0); return; }
  const pct = inflight.reduce((m, r) => Math.max(m, r.totalBytes ? (r.receivedBytes / r.totalBytes) * 100 : 0), 0);
  els.dlRing.style.setProperty('--p', Math.round(pct));
}
function dlPopoverOpen() { return !!els.popoverLayer.querySelector('.dl-popover'); }
async function openDownloadsPopover() {
  const res = await api.downloads.list();
  const persisted = (res && res.downloads) || [];
  const active = [...dlActive.values()];
  const merged = [...active, ...persisted.filter((p) => !dlActive.has(p.id))].slice(0, 30);
  const body = merged.length ? merged.map(dlItemHtml).join('') : '<div class="dl-empty">No downloads yet</div>';
  const pop = popover(els.downloadsBtn, `<div class="dl-popover"><div class="dl-head">Downloads</div><div class="dl-list">${body}</div><div class="dl-foot"><button class="btn btn-text" id="dlSeeAll">See all downloads</button></div></div>`, true);
  wireDlItems(pop);
  pop.querySelector('#dlSeeAll').onclick = () => { closePopovers(); createTab('browser://downloads'); };
}
function refreshDlPopover() { /* simple: re-open in place */ if (dlPopoverOpen()) { closePopovers(); openDownloadsPopover(); } }
function fmtBytes(n) { if (!n) return '0 B'; const u = ['B', 'KB', 'MB', 'GB']; const i = Math.floor(Math.log(n) / Math.log(1024)); return (n / Math.pow(1024, i)).toFixed(i ? 1 : 0) + ' ' + u[i]; }
function dlItemHtml(r) {
  const pct = r.totalBytes ? Math.round((r.receivedBytes / r.totalBytes) * 100) : 0;
  const inProgress = r.state === 'progressing';
  const sub = inProgress
    ? `${fmtBytes(r.receivedBytes)} / ${r.totalBytes ? fmtBytes(r.totalBytes) : '?'} · ${fmtBytes(r.speedBytesPerSec || 0)}/s`
    : (r.state === 'completed' ? fmtBytes(r.receivedBytes) : r.state);
  const actions = inProgress
    ? `<button class="icon-btn" data-act="cancel" data-id="${r.id}" title="Cancel">${ICON.x}</button>`
    : (r.state === 'completed'
      ? `<button class="icon-btn" data-act="open" data-id="${r.id}" title="Open">${ICON.openNew}</button><button class="icon-btn" data-act="folder" data-id="${r.id}" title="Show in folder">${ICON.folder}</button>`
      : `<button class="icon-btn" data-act="remove" data-id="${r.id}" title="Remove">${ICON.trash}</button>`);
  return `<div class="dl-item"><span class="dl-ico">${ICON.download}</span>
    <span class="dl-meta"><div class="dl-name">${escapeHtml(r.filename)}</div><div class="dl-sub">${escapeHtml(sub)}</div>${inProgress ? `<div class="dl-bar"><i style="width:${pct}%"></i></div>` : ''}</span>
    <span class="dl-actions">${actions}</span></div>`;
}
function wireDlItems(pop) {
  pop.querySelectorAll('[data-act]').forEach((b) => {
    b.onclick = async () => {
      const id = b.dataset.id;
      if (b.dataset.act === 'cancel') api.downloads.cancel(id);
      else if (b.dataset.act === 'open') api.downloads.openFile(id);
      else if (b.dataset.act === 'folder') api.downloads.showInFolder(id);
      else if (b.dataset.act === 'remove') { await api.downloads.remove(id); refreshDlPopover(); }
    };
  });
}

/* ------------------------------------------------------------------ */
/* Overflow menu                                                      */
/* ------------------------------------------------------------------ */
function openOverflowMenu() {
  const t = activeTab();
  const zoomLvl = t ? (t.zoom || 0) : 0;
  const items = [
    { label: 'New tab', icon: 'plus', accel: 'Ctrl+T', action: () => handleCommand('new-tab') },
    { label: 'New window', icon: 'newWindow', accel: 'Ctrl+N', action: () => handleCommand('new-window') },
    { label: 'New incognito window', icon: 'incognito', accel: 'Ctrl+Shift+N', action: () => handleCommand('new-incognito') },
    { sep: true },
    { label: 'History', icon: 'history', accel: 'Ctrl+H', action: () => handleCommand('open-history') },
    { label: 'Downloads', icon: 'download', accel: 'Ctrl+J', action: () => handleCommand('open-downloads') },
    { label: 'Bookmarks', icon: 'bookmarks', accel: 'Ctrl+Shift+O', action: () => handleCommand('open-bookmarks') },
    { sep: true },
    { zoom: true, level: zoomLvl },
    { sep: true },
    { label: 'Find in page', icon: 'search', accel: 'Ctrl+F', action: () => handleCommand('find') },
    { label: 'Print', icon: 'print', accel: 'Ctrl+P', action: () => handleCommand('print') },
    { label: 'Save as PDF', icon: 'pdf', action: () => handleCommand('print-pdf') },
    { sep: true },
    { label: 'Settings', icon: 'settings', action: () => handleCommand('open-settings') },
    { label: 'About Aether', icon: 'info', action: () => handleCommand('about') },
  ];
  const html = items.map((it) => {
    if (it.sep) return '<div class="menu-sep"></div>';
    if (it.zoom) {
      return `<div class="menu-row"><span class="mr-label">Zoom</span><div class="zoom-controls"><button data-z="out">${ICON.x.replace('M6 6l12 12M18 6L6 18', 'M5 12h14')}</button><span class="zoom-val">${zoomPercent(it.level)}%</span><button data-z="in">${ICON.plus}</button></div></div>`;
    }
    return `<div class="menu-item" data-act="${escapeHtml(it.label)}"><span class="mi-icon">${ICON[it.icon] || ''}</span><span class="mi-label">${it.label}</span><span class="mi-accel">${it.accel || ''}</span></div>`;
  }).join('');
  const pop = popover(els.menuBtn, html, true);
  items.forEach((it) => {
    if (it.sep || it.zoom) return;
    const node = pop.querySelector(`.menu-item[data-act="${cssEsc(it.label)}"]`);
    if (node) node.onclick = () => { closePopovers(); it.action(); };
  });
  const zin = pop.querySelector('[data-z="in"]'); const zout = pop.querySelector('[data-z="out"]');
  if (zin) zin.onclick = () => { changeZoom(0.5); const v = pop.querySelector('.zoom-val'); if (v) v.textContent = zoomPercent(activeTab().zoom) + '%'; };
  if (zout) zout.onclick = () => { changeZoom(-0.5); const v = pop.querySelector('.zoom-val'); if (v) v.textContent = zoomPercent(activeTab().zoom) + '%'; };
}
function cssEsc(s) { return String(s).replace(/"/g, '\\"'); }

/* ------------------------------------------------------------------ */
/* Context menus                                                      */
/* ------------------------------------------------------------------ */
function showPageContextMenu(tab, params) {
  const items = [];
  if (params.linkURL) {
    items.push({ label: 'Open link in new tab', icon: 'duplicate', action: () => createTab(params.linkURL, { background: true }) });
    items.push({ label: 'Open link in incognito window', icon: 'incognito', action: () => api.window.openIncognito(params.linkURL) });
    items.push({ label: 'Copy link address', icon: 'copy', action: () => api.clipboardWriteText(params.linkURL) });
    items.push({ sep: true });
  }
  if (params.mediaType === 'image' && params.srcURL) {
    items.push({ label: 'Open image in new tab', icon: 'openNew', action: () => createTab(params.srcURL, { background: true }) });
    items.push({ label: 'Save image as…', icon: 'download', action: () => { try { tab.webview.downloadURL(params.srcURL); } catch {} } });
    items.push({ label: 'Copy image address', icon: 'copy', action: () => api.clipboardWriteText(params.srcURL) });
    items.push({ sep: true });
  }
  if (params.selectionText) {
    items.push({ label: 'Copy', icon: 'copy', action: () => { try { tab.webview.copy(); } catch {} } });
    const sel = params.selectionText.slice(0, 40);
    items.push({ label: `Search for “${sel}”`, icon: 'search', action: () => navigateTo(params.selectionText, { newTab: true }) });
    items.push({ sep: true });
  }
  if (params.isEditable) {
    items.push({ label: 'Cut', action: () => { try { tab.webview.cut(); } catch {} } });
    items.push({ label: 'Copy', action: () => { try { tab.webview.copy(); } catch {} } });
    items.push({ label: 'Paste', action: () => { try { tab.webview.paste(); } catch {} } });
    items.push({ label: 'Select all', action: () => { try { tab.webview.selectAll(); } catch {} } });
    items.push({ sep: true });
  }
  items.push({ label: 'Back', icon: 'back', disabled: !tab.canGoBack, action: goBack });
  items.push({ label: 'Forward', icon: 'forward', disabled: !tab.canGoForward, action: goForward });
  items.push({ label: 'Reload', icon: 'reload', action: () => reload(false) });
  items.push({ sep: true });
  items.push({ label: 'Print…', icon: 'print', action: () => handleCommand('print') });
  items.push({ label: 'Inspect', icon: 'settings', action: () => { try { tab.webview.inspectElement(params.x, params.y); } catch {} } });
  contextMenu(params.x, params.y, items);
}

function showTabContextMenu(tab, x, y) {
  contextMenu(x, y, [
    { label: 'New tab', icon: 'plus', action: () => createTab() },
    { label: 'Reload', icon: 'reload', action: () => { try { tab.webview.reload(); } catch {} } },
    { label: 'Duplicate', icon: 'duplicate', action: () => createTab(tab.url) },
    { label: tab.muted ? 'Unmute site' : 'Mute site', icon: tab.muted ? 'volume' : 'mute', action: () => { tab.muted = !tab.muted; try { tab.webview.setAudioMuted(tab.muted); } catch {} } },
    { label: tab.pinned ? 'Unpin' : 'Pin', icon: 'pin', action: () => { tab.pinned = !tab.pinned; updateTabButton(tab); } },
    { sep: true },
    { label: 'Close', icon: 'x', action: () => closeTab(tab.id) },
    { label: 'Close other tabs', action: () => { tabs.filter((t) => t.id !== tab.id).forEach((t) => closeTab(t.id)); } },
    { label: 'Close tabs to the right', action: () => { const i = tabs.indexOf(tab); tabs.slice(i + 1).forEach((t) => closeTab(t.id)); } },
  ]);
}

function contextMenu(x, y, items) {
  closePopovers();
  const menu = els.ctxMenu;
  menu.innerHTML = items.map((it, i) => it.sep ? '<div class="menu-sep"></div>'
    : `<div class="menu-item ${it.disabled ? 'disabled' : ''}" data-i="${i}"><span class="mi-icon">${it.icon ? ICON[it.icon] : ''}</span><span class="mi-label">${escapeHtml(it.label)}</span></div>`).join('');
  menu.hidden = false;
  const mw = menu.offsetWidth, mh = menu.offsetHeight;
  menu.style.left = Math.min(x, window.innerWidth - mw - 8) + 'px';
  menu.style.top = Math.min(y, window.innerHeight - mh - 8) + 'px';
  items.forEach((it, i) => {
    if (it.sep || it.disabled) return;
    const node = menu.querySelector(`.menu-item[data-i="${i}"]`);
    if (node) node.onclick = () => { menu.hidden = true; it.action(); };
  });
}

/* ------------------------------------------------------------------ */
/* Popovers + toasts                                                  */
/* ------------------------------------------------------------------ */
function popover(anchor, html, isMenu) {
  closePopovers();
  const pop = document.createElement('div');
  pop.className = isMenu ? 'popover menu-pop' : 'popover';
  if (isMenu) pop.style.padding = '6px 0';
  pop.innerHTML = html;
  els.popoverLayer.appendChild(pop);
  const r = anchor.getBoundingClientRect();
  const pw = pop.offsetWidth;
  let left = r.right - pw;
  if (left < 8) left = r.left;
  pop.style.left = Math.max(8, Math.min(left, window.innerWidth - pw - 8)) + 'px';
  pop.style.top = (r.bottom + 6) + 'px';
  return pop;
}
function closePopovers() { els.popoverLayer.innerHTML = ''; els.ctxMenu.hidden = true; }

function toast(message, action) {
  const t = document.createElement('div');
  t.className = 'toast';
  t.innerHTML = `<span>${escapeHtml(message)}</span>${action ? `<span class="toast-action">${escapeHtml(action.label)}</span>` : ''}`;
  els.toastContainer.appendChild(t);
  if (action) t.querySelector('.toast-action').onclick = () => { action.fn(); t.remove(); };
  setTimeout(() => { t.classList.add('leaving'); setTimeout(() => t.remove(), 240); }, 3200);
}

function showSiteInfo() {
  const t = activeTab(); if (!t) return;
  const sec = securityFor(t.url);
  const msg = sec.cls === 'secure' ? 'Connection is secure' : sec.cls === 'info' ? 'Aether internal page' : sec.cls === 'insecure' ? 'Your connection to this site is not secure' : 'Site information';
  popover(els.securityIndicator, `<h3>${escapeHtml(msg)}</h3><div style="font-size:12px;color:var(--fg-secondary);word-break:break-all">${escapeHtml(t.url || '')}</div>`);
}

/* ------------------------------------------------------------------ */
/* Command dispatch (menu accelerators + UI)                          */
/* ------------------------------------------------------------------ */
function handleCommand(command, args) {
  switch (command) {
    case 'new-tab': createTab(); els.omniboxInput.focus(); break;
    case 'open-tab': createTab(args && args.url, { background: !!(args && args.background) }); break;
    case 'new-window': api.window.open(); break;
    case 'new-incognito': api.window.openIncognito(); break;
    case 'close-tab': if (activeTabId) closeTab(activeTabId); break;
    case 'reopen-tab': { const r = recentlyClosed.pop(); if (r) createTab(r.url); break; }
    case 'reload': reload(false); break;
    case 'reload-hard': reload(true); break;
    case 'stop': stop(); break;
    case 'back': goBack(); break;
    case 'forward': goForward(); break;
    case 'home': goHome(); break;
    case 'zoom-in': changeZoom(0.5); break;
    case 'zoom-out': changeZoom(-0.5); break;
    case 'zoom-reset': changeZoom(0); break;
    case 'fullscreen': toggleWindowFullscreen(); break;
    case 'devtools': { const t = activeTab(); try { t && t.webview.isDevToolsOpened() ? t.webview.closeDevTools() : t.webview.openDevTools(); } catch {} break; }
    case 'toggle-bookmarks-bar': api.settings.set({ showBookmarksBar: !settings.showBookmarksBar }); break;
    case 'find': openFindBar(); break;
    case 'focus-omnibox': els.omniboxInput.focus(); els.omniboxInput.select(); break;
    case 'print': { const t = activeTab(); try { t && t.webview.print(); } catch {} break; }
    case 'print-pdf': { const t = activeTab(); try { api.print.toPdf(t.webview.getWebContentsId()); } catch {} break; }
    case 'open-history': openInternal('history'); break;
    case 'open-downloads': openInternal('downloads'); break;
    case 'open-bookmarks': openInternal('bookmarks'); break;
    case 'open-settings': openInternal('settings'); break;
    case 'open-newtab': createTab('browser://newtab'); break;
    case 'about': openInternal('settings'); break;
    case 'next-tab': cycleTab(1); break;
    case 'prev-tab': cycleTab(-1); break;
    case 'last-tab': if (tabs.length) activateTab(tabs[tabs.length - 1].id); break;
    case 'goto-tab': if (args && tabs[args.index]) activateTab(tabs[args.index].id); break;
    case 'bookmark': toggleBookmark(); break;
    default: break;
  }
}
function openInternal(page) {
  const existing = tabs.find((t) => t.url === 'browser://' + page);
  if (existing) { activateTab(existing.id); return; }
  createTab('browser://' + page);
}
function cycleTab(dir) {
  if (!tabs.length) return;
  const i = tabs.findIndex((t) => t.id === activeTabId);
  const next = (i + dir + tabs.length) % tabs.length;
  activateTab(tabs[next].id);
}
let winFullscreen = false;
function toggleWindowFullscreen() { winFullscreen = !winFullscreen; api.window.setFullscreen(winFullscreen); }

/* ------------------------------------------------------------------ */
/* Theme + window state                                               */
/* ------------------------------------------------------------------ */
function applyTheme() {
  const t = settings.theme || 'system';
  let dark = t === 'dark';
  if (t === 'system') dark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
}
function setMaximized(b) {
  els.shell.classList.toggle('maximized', b);
  els.winMaximize.innerHTML = b ? ICON.restore : ICON.maximize;
  els.winMaximize.title = b ? 'Restore' : 'Maximize';
}

/* ------------------------------------------------------------------ */
/* Session                                                            */
/* ------------------------------------------------------------------ */
const scheduleSessionSave = debounce(saveSessionNow, 800);
function saveSessionNow() {
  if (meta.isIncognito) return;
  api.session.save({
    tabs: tabs.map((t) => ({ tabId: t.id, url: t.url, title: t.title, pinned: t.pinned })),
    activeTabId,
  });
}

/* ------------------------------------------------------------------ */
/* Static icon setup + event binding                                  */
/* ------------------------------------------------------------------ */
function setupIcons() {
  els.newTabBtn.innerHTML = ICON.plus;
  els.winMinimize.innerHTML = ICON.minimize;
  els.winMaximize.innerHTML = ICON.maximize;
  els.winClose.innerHTML = ICON.close;
  els.backBtn.innerHTML = ICON.back;
  els.forwardBtn.innerHTML = ICON.forward;
  els.reloadBtn.innerHTML = ICON.reload;
  els.homeBtn.innerHTML = ICON.home;
  els.bookmarkStar.innerHTML = ICON.star;
  els.downloadsBtn.insertAdjacentHTML('afterbegin', ICON.download);
  els.menuBtn.innerHTML = ICON.menu;
  els.findPrev.innerHTML = ICON.back;
  els.findNext.innerHTML = ICON.forward;
  els.findClose.innerHTML = ICON.close;
  if (els.brandBadge) els.brandBadge.innerHTML = ICON.incognito + '<span style="margin-left:6px;font-size:12px">Incognito</span>';
}

function bindEvents() {
  els.newTabBtn.onclick = () => handleCommand('new-tab');
  els.winMinimize.onclick = () => api.window.minimize();
  els.winMaximize.onclick = () => api.window.maximizeToggle();
  els.winClose.onclick = () => api.window.close();
  els.titlebarDrag.addEventListener('dblclick', () => api.window.maximizeToggle());
  els.backBtn.onclick = goBack;
  els.forwardBtn.onclick = goForward;
  els.reloadBtn.onclick = () => { const t = activeTab(); (t && t.isLoading) ? stop() : reload(false); };
  els.homeBtn.onclick = goHome;
  els.bookmarkStar.onclick = toggleBookmark;
  els.menuBtn.onclick = openOverflowMenu;
  els.downloadsBtn.onclick = openDownloadsPopover;

  bindOmnibox();
  bindFind();
  bindDownloads();

  window.addEventListener('resize', () => { if (!els.suggestions.hidden) positionSuggestions(); });
  window.addEventListener('mousedown', (e) => {
    if (!els.popoverLayer.contains(e.target) && !e.target.closest('.icon-btn') && !e.target.closest('.security-indicator')) closePopovers();
    if (els.ctxMenu && !els.ctxMenu.contains(e.target)) els.ctxMenu.hidden = true;
  });
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { if ((settings.theme || 'system') === 'system') applyTheme(); });

  api.on('window:maximize-state', ({ isMaximized }) => setMaximized(isMaximized));
  api.on('window:focus-state', ({ isFocused }) => els.shell.classList.toggle('blurred', !isFocused));
  api.on('menu:command', ({ command, args }) => handleCommand(command, args));
  api.on('settings:changed', ({ settings: s }) => {
    settings = s; applyTheme(); updateHomeButton(); updateBookmarksBarVisibility();
  });
  api.on('bookmarks:changed', () => { buildBookmarksBar(); updateBookmarkStar(); });
  api.on('session:request-snapshot', () => saveSessionNow());
}

/* ------------------------------------------------------------------ */
/* Startup                                                            */
/* ------------------------------------------------------------------ */
async function start() {
  meta = await api.app.getInfo();
  document.documentElement.dataset.platform = meta.platform;
  document.documentElement.dataset.incognito = meta.isIncognito ? 'true' : 'false';

  const sres = await api.settings.getAll();
  settings = sres.settings || {};

  applyTheme();
  setupIcons();
  bindEvents();
  updateHomeButton();
  updateBookmarksBarVisibility();

  if (meta.initialUrl) {
    createTab(meta.initialUrl);
  } else {
    let restored = false;
    try {
      const r = await api.session.restore();
      if (r && r.shouldRestore && r.tabs && r.tabs.length) {
        r.tabs.forEach((t, i) => createTab(t.url, { background: i !== r.activeIndex }));
        const activeT = tabs[r.activeIndex] || tabs[0];
        if (activeT) activateTab(activeT.id);
        restored = true;
      }
    } catch { /* ignore */ }
    if (!restored) createTab(settings.newTabUrl || 'browser://newtab');
  }

  try { const m = await api.window.isMaximized(); setMaximized(m.isMaximized); } catch {}
  updateNavButtons();
  updateReloadButton();
}

start();
