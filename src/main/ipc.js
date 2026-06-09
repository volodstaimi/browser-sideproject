'use strict';

/**
 * The ONLY place ipcMain handlers are registered. Each handler resolves the
 * sender's window meta so incognito windows never write history/session, and
 * wraps thrown errors as { ok:false, error } instead of leaking stacks.
 */

const {
  ipcMain, app, dialog, shell, clipboard, webContents, session, BrowserWindow,
} = require('electron');
const fsp = require('fs/promises');

const stores = require('./stores');
const windows = require('./windows');
const downloads = require('./downloads');
const nav = require('./navigation');
const security = require('./security');

function meta(event) { return windows.getWindowMeta(event.sender); }
function winOf(event) {
  return windows.getWindowByHostId(event.sender.id) || BrowserWindow.fromWebContents(event.sender);
}

function handle(channel, fn) {
  ipcMain.handle(channel, async (event, payload = {}) => {
    try {
      return await fn(event, payload || {});
    } catch (err) {
      return { ok: false, error: String((err && err.message) || err) };
    }
  });
}

function register() {
  /* ---- Window controls ---- */
  ipcMain.on('window:minimize', (e) => { const w = winOf(e); if (w) w.minimize(); });
  ipcMain.on('window:close', (e) => { const w = winOf(e); if (w) w.close(); });
  handle('window:maximize-toggle', (e) => {
    const w = winOf(e);
    if (!w) return { isMaximized: false };
    if (w.isMaximized()) w.unmaximize(); else w.maximize();
    return { isMaximized: w.isMaximized() };
  });
  handle('window:is-maximized', (e) => {
    const w = winOf(e);
    return { isMaximized: w ? w.isMaximized() : false };
  });
  handle('window:set-fullscreen', (e, { value }) => {
    const w = winOf(e);
    if (w) w.setFullScreen(!!value);
    return { isFullScreen: w ? w.isFullScreen() : false };
  });
  handle('window:new', (_e, { url } = {}) => {
    const w = windows.createWindow({ url: url || null, incognito: false });
    return { windowId: w.id };
  });
  handle('window:new-incognito', (_e, { url } = {}) => {
    const w = windows.createWindow({ url: url || null, incognito: true });
    return { windowId: w.id };
  });

  /* ---- Navigation / omnibox ---- */
  handle('nav:navigate', (_e, { input }) => {
    const s = stores.settings.getAll();
    return nav.normalizeInput(input, s.searchEngineTemplate);
  });
  handle('omnibox:suggest', (_e, { query, openTabs = [] }) => buildSuggestions(query, openTabs));

  /* ---- Bookmarks ---- */
  handle('bookmarks:list', (_e, { folderId } = {}) => stores.bookmarks.list(folderId));
  handle('bookmarks:add', (_e, p) => stores.bookmarks.add(p));
  handle('bookmarks:update', (_e, p) => stores.bookmarks.update(p));
  handle('bookmarks:remove', (_e, p) => stores.bookmarks.remove(p));
  handle('bookmarks:remove-by-url', (_e, { url }) => stores.bookmarks.removeByUrl(url));
  handle('bookmarks:reorder', (_e, p) => stores.bookmarks.reorder(p));
  handle('bookmarks:folder-add', (_e, p) => stores.bookmarks.folderAdd(p));
  handle('bookmarks:folder-remove', (_e, p) => stores.bookmarks.folderRemove(p));
  handle('bookmarks:is-bookmarked', (_e, { url }) => stores.bookmarks.isBookmarked(url));

  /* ---- History ---- */
  ipcMain.on('history:add', (e, p) => {
    const m = meta(e);
    if (m && m.isIncognito) return;
    stores.history.add(p || {});
  });
  handle('history:list', (_e, p) => stores.history.list(p));
  handle('history:search', (_e, p) => stores.history.search(p));
  handle('history:top-sites', (_e, { limit } = {}) => ({ sites: stores.history.topSites(limit || 10) }));
  handle('history:remove', (_e, p) => stores.history.remove(p));
  handle('history:clear', async (_e, p = {}) => {
    const categories = p.categories || { history: true };
    let removed = 0;
    if (categories.history !== false) {
      removed = stores.history.clear({ range: p.range, since: p.since }).removed;
    }
    const ses = session.fromPartition(windows.NORMAL_PARTITION);
    if (categories.cookies) {
      try { await ses.clearStorageData({ storages: ['cookies', 'localstorage', 'indexdb', 'serviceworkers', 'cachestorage', 'websql', 'shadercache'] }); } catch { /* ignore */ }
    }
    if (categories.cache) {
      try { await ses.clearCache(); } catch { /* ignore */ }
    }
    if (categories.downloads) stores.downloads.clear();
    return { removed };
  });

  /* ---- Downloads ---- */
  handle('downloads:list', () => stores.downloads.list());
  handle('downloads:pause', (_e, { id }) => ({ ok: downloads.pause(id) }));
  handle('downloads:resume', (_e, { id }) => ({ ok: downloads.resume(id) }));
  handle('downloads:cancel', (_e, { id }) => ({ ok: downloads.cancel(id) }));
  handle('downloads:open-file', (_e, { id }) => downloads.openFile(id));
  handle('downloads:show-in-folder', (_e, { id }) => downloads.showInFolder(id));
  handle('downloads:remove', (_e, { id, deleteFile }) => downloads.removeRecord(id, deleteFile));
  handle('downloads:clear', () => stores.downloads.clear());

  /* ---- Settings ---- */
  handle('settings:get-all', () => ({ settings: stores.settings.getAll() }));
  handle('settings:get', (_e, { key }) => ({ value: stores.settings.get(key) }));
  handle('settings:set', (_e, { patch }) => stores.settings.set(patch || {}));
  handle('settings:reset', () => stores.settings.reset());
  handle('settings:choose-download-dir', async (e) => {
    const w = winOf(e);
    const res = await dialog.showOpenDialog(w, { properties: ['openDirectory', 'createDirectory'] });
    if (res.canceled || !res.filePaths.length) return { cancelled: true };
    return { dir: res.filePaths[0], cancelled: false };
  });

  /* ---- Session ---- */
  ipcMain.on('session:save', (e, p) => {
    const m = meta(e);
    if (m && m.isIncognito) return;
    stores.session.save({ tabs: p.tabs || [], activeTabId: p.activeTabId || null });
  });
  handle('session:restore', (e) => {
    const m = meta(e);
    if (m && m.isIncognito) return { tabs: [], activeIndex: 0, shouldRestore: false };
    const s = stores.settings.getAll();
    const raw = stores.session.raw();
    if (s.startupMode === 'restore' && s.restoreSession && raw.tabs && raw.tabs.length) {
      const idx = raw.tabs.findIndex((t) => t.tabId === raw.activeTabId);
      return {
        tabs: raw.tabs.map((t) => ({ url: t.url, title: t.title, pinned: t.pinned })),
        activeIndex: idx < 0 ? 0 : idx,
        shouldRestore: true,
      };
    }
    if (s.startupMode === 'urls' && s.startupUrls && s.startupUrls.length) {
      return { tabs: s.startupUrls.map((u) => ({ url: u, title: u })), activeIndex: 0, shouldRestore: true };
    }
    return { tabs: [], activeIndex: 0, shouldRestore: false };
  });

  /* ---- Print ---- */
  handle('print:to-pdf', async (e, { webContentsId }) => {
    const wc = webContents.fromId(webContentsId);
    if (!wc) return { ok: false, error: 'No page' };
    const data = await wc.printToPDF({ printBackground: true, landscape: false });
    const w = winOf(e);
    const res = await dialog.showSaveDialog(w, {
      defaultPath: 'page.pdf',
      filters: [{ name: 'PDF', extensions: ['pdf'] }],
    });
    if (res.canceled || !res.filePath) return { ok: false };
    await fsp.writeFile(res.filePath, data);
    shell.openPath(res.filePath);
    return { ok: true, savePath: res.filePath };
  });

  /* ---- App / shell / clipboard ---- */
  handle('app:get-info', (e) => {
    const m = meta(e);
    return {
      version: app.getVersion(),
      electron: process.versions.electron,
      chrome: process.versions.chrome,
      node: process.versions.node,
      v8: process.versions.v8,
      platform: process.platform,
      isIncognito: !!(m && m.isIncognito),
      partition: (m && m.partition) || windows.NORMAL_PARTITION,
      initialUrl: (m && m.initialUrl) || null,
    };
  });
  handle('shell:open-external', (_e, { url }) => {
    if (!security.isSafeExternal(url)) return { ok: false, error: 'Blocked unsafe URL' };
    shell.openExternal(url);
    return { ok: true };
  });
  handle('clipboard:write', (_e, { text }) => {
    if (typeof text === 'string') clipboard.writeText(text);
    return { ok: true };
  });
}

/* ------------------------------------------------------------------ */
/* Omnibox suggestion ranking                                         */
/* ------------------------------------------------------------------ */

function buildSuggestions(query, openTabs) {
  const q = String(query || '').trim();
  if (!q) return { suggestions: [] };
  const lq = q.toLowerCase();
  const s = stores.settings.getAll();
  const raw = [];

  for (const t of openTabs || []) {
    if ((t.title || '').toLowerCase().includes(lq) || (t.url || '').toLowerCase().includes(lq)) {
      raw.push({ type: 'open-tab', title: t.title || t.url, url: t.url, score: 1000, tabId: t.tabId });
    }
  }

  const norm = nav.normalizeInput(q, s.searchEngineTemplate);
  if (!norm.isSearch && norm.url) {
    raw.push({ type: 'url', title: q, url: norm.url, score: 900 });
  }

  for (const b of stores.bookmarks.search(q, 5)) {
    raw.push({ type: 'bookmark', title: b.title || b.url, url: b.url, score: 750 });
  }
  for (const h of stores.history.suggest(q, 6)) {
    raw.push({ type: 'history', title: h.title || h.url, url: h.url, score: 500 + Math.min(200, (h.visitCount || 1) * 5) });
  }
  raw.push({ type: 'search', title: q, url: nav.buildSearchURL(q, s.searchEngineTemplate), score: 300 });

  const seen = new Set();
  const out = [];
  for (const sug of raw.sort((a, b) => b.score - a.score)) {
    const key = sug.type === 'search' ? 'search'
      : sug.type === 'open-tab' ? 'tab:' + sug.tabId
        : nav.normalizeForCompare(sug.url);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(sug);
    if (out.length >= 8) break;
  }
  return { suggestions: out };
}

module.exports = { register };
