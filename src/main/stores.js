'use strict';

/**
 * Typed persistence stores layered over the generic atomic JSON Store.
 * All five domains live here so their shapes and the change-bus stay in sync.
 *
 * Each mutation emits on `bus` ('bookmarks' | 'history' | 'downloads' |
 * 'settings'); main wires those to broadcast() so every window + open
 * browser:// page refreshes.
 *
 * initStores() must run after the userData path is finalized (app ready).
 */

const { app, nativeTheme } = require('electron');
const crypto = require('crypto');
const { EventEmitter } = require('events');
const { Store } = require('./store');
const nav = require('./navigation');

const bus = new EventEmitter();
bus.setMaxListeners(100);

const uuid = () => crypto.randomUUID();
const now = () => Date.now();

const HISTORY_CAP = 10000;

let bookmarksDB = null;
let historyDB = null;
let downloadsDB = null;
let settingsDB = null;
let sessionDB = null;
let readingDB = null;

const SETTINGS_DEFAULTS = {
  theme: 'system', // 'system' | 'light' | 'dark'
  homeUrl: 'browser://newtab',
  newTabUrl: 'browser://newtab',
  searchEngine: 'google', // google | bing | duckduckgo | custom
  searchEngineTemplate: nav.SEARCH_ENGINES.google,
  searchSuggestions: false,
  downloadDir: '',
  promptForDownloadLocation: false,
  restoreSession: true,
  startupMode: 'newtab', // newtab | restore | urls
  startupUrls: [],
  showBookmarksBar: false,
  showHomeButton: false,
  defaultZoom: 0,
  perOriginZoom: {},
  persistPerOriginZoom: true,
  blockPopups: true,
  sendDoNotTrack: false,
  // --- competitive features ---
  adblockEnabled: true,
  adblockAllowlist: [], // origins where the blocker is paused
  hibernateEnabled: false,
  hibernateMinutes: 30,
  forceDark: false, // force a dark filter on sites that lack a dark theme
  accentColor: '', // '' = theme default; otherwise a hex like '#a970ff'
  verticalTabs: false,
  sidebarEnabled: true,
  sidebarApps: [
    { id: 'whatsapp', name: 'WhatsApp', url: 'https://web.whatsapp.com/' },
    { id: 'messenger', name: 'Messenger', url: 'https://www.messenger.com/' },
    { id: 'telegram', name: 'Telegram', url: 'https://web.telegram.org/' },
    { id: 'discord', name: 'Discord', url: 'https://discord.com/app' },
    { id: 'gmail', name: 'Gmail', url: 'https://mail.google.com/' },
  ],
  translateTarget: 'en',
  showResourceMonitor: false,
};

function initStores() {
  const dir = app.getPath('userData');

  bookmarksDB = new Store(dir, 'bookmarks.json', {
    schemaVersion: 1,
    folders: [{ id: 'bar', name: 'Bookmarks bar', parentId: null, order: 0, createdAt: now() }],
    bookmarks: [],
  });
  // Guarantee the bookmarks-bar root always exists.
  if (!bookmarksDB.data.folders.some((f) => f.id === 'bar')) {
    bookmarksDB.data.folders.unshift({ id: 'bar', name: 'Bookmarks bar', parentId: null, order: 0, createdAt: now() });
    bookmarksDB.scheduleSave();
  }

  historyDB = new Store(dir, 'history.json', { schemaVersion: 1, entries: [] });
  downloadsDB = new Store(dir, 'downloads.json', { schemaVersion: 1, items: [] });
  settingsDB = new Store(dir, 'settings.json', { schemaVersion: 1, settings: { ...SETTINGS_DEFAULTS } });
  sessionDB = new Store(dir, 'session.json', {
    schemaVersion: 1,
    session: { savedAt: 0, activeTabId: null, windowBounds: null, maximized: false, tabs: [] },
  });
  readingDB = new Store(dir, 'reading-list.json', { schemaVersion: 1, items: [] });

  // Default download dir if unset.
  if (!settingsDB.data.settings.downloadDir) {
    settingsDB.data.settings.downloadDir = safeDownloadsPath();
    settingsDB.scheduleSave();
  }
}

function safeDownloadsPath() {
  try { return app.getPath('downloads'); } catch { return app.getPath('home'); }
}

function flushAll() {
  [bookmarksDB, historyDB, downloadsDB, settingsDB, sessionDB, readingDB].forEach((s) => s && s.flush());
}

/* ------------------------------------------------------------------ */
/* Bookmarks                                                          */
/* ------------------------------------------------------------------ */

const bookmarks = {
  list(folderId) {
    const all = bookmarksDB.data;
    const list = folderId
      ? all.bookmarks.filter((b) => (b.folderId || 'bar') === folderId)
      : all.bookmarks.slice();
    list.sort((a, b) => (a.order || 0) - (b.order || 0));
    return { bookmarks: list, folders: all.folders.slice() };
  },

  add({ url, title, favicon = null, folderId = 'bar' }) {
    if (!url) throw new Error('url required');
    const order = nextOrder(bookmarksDB.data.bookmarks, folderId);
    const bookmark = {
      id: uuid(), url, title: title || url, favicon, folderId,
      order, createdAt: now(), updatedAt: now(),
    };
    bookmarksDB.data.bookmarks.push(bookmark);
    bookmarksDB.scheduleSave();
    bus.emit('bookmarks');
    return { bookmark };
  },

  update({ id, patch = {} }) {
    const b = bookmarksDB.data.bookmarks.find((x) => x.id === id);
    if (!b) throw new Error('bookmark not found');
    if (patch.title !== undefined) b.title = patch.title;
    if (patch.url !== undefined) b.url = patch.url;
    if (patch.folderId !== undefined) b.folderId = patch.folderId;
    b.updatedAt = now();
    bookmarksDB.scheduleSave();
    bus.emit('bookmarks');
    return { bookmark: b };
  },

  remove({ id }) {
    bookmarksDB.data.bookmarks = bookmarksDB.data.bookmarks.filter((b) => b.id !== id);
    bookmarksDB.scheduleSave();
    bus.emit('bookmarks');
    return { ok: true };
  },

  removeByUrl(url) {
    const target = nav.normalizeForCompare(url);
    const before = bookmarksDB.data.bookmarks.length;
    bookmarksDB.data.bookmarks = bookmarksDB.data.bookmarks
      .filter((b) => nav.normalizeForCompare(b.url) !== target);
    if (bookmarksDB.data.bookmarks.length !== before) {
      bookmarksDB.scheduleSave();
      bus.emit('bookmarks');
    }
    return { ok: true };
  },

  reorder({ folderId = 'bar', orderedIds = [] }) {
    orderedIds.forEach((id, i) => {
      const b = bookmarksDB.data.bookmarks.find((x) => x.id === id);
      if (b) { b.folderId = folderId; b.order = i; }
    });
    bookmarksDB.scheduleSave();
    bus.emit('bookmarks');
    return { ok: true };
  },

  folderAdd({ name, parentId = null }) {
    const folder = {
      id: uuid(), name: name || 'New folder', parentId,
      order: bookmarksDB.data.folders.length, createdAt: now(),
    };
    bookmarksDB.data.folders.push(folder);
    bookmarksDB.scheduleSave();
    bus.emit('bookmarks');
    return { folder };
  },

  folderRemove({ id }) {
    if (id === 'bar') throw new Error('cannot remove the bookmarks bar');
    // Recursively collect this folder + descendants.
    const toRemove = new Set([id]);
    let grew = true;
    while (grew) {
      grew = false;
      for (const f of bookmarksDB.data.folders) {
        if (f.parentId && toRemove.has(f.parentId) && !toRemove.has(f.id)) {
          toRemove.add(f.id); grew = true;
        }
      }
    }
    bookmarksDB.data.folders = bookmarksDB.data.folders.filter((f) => !toRemove.has(f.id));
    bookmarksDB.data.bookmarks = bookmarksDB.data.bookmarks
      .filter((b) => !toRemove.has(b.folderId || 'bar'));
    bookmarksDB.scheduleSave();
    bus.emit('bookmarks');
    return { ok: true };
  },

  isBookmarked(url) {
    const target = nav.normalizeForCompare(url);
    const hit = bookmarksDB.data.bookmarks.find((b) => nav.normalizeForCompare(b.url) === target);
    return hit ? { bookmarked: true, id: hit.id } : { bookmarked: false };
  },

  search(query, limit = 8) {
    const q = String(query || '').toLowerCase();
    if (!q) return [];
    return bookmarksDB.data.bookmarks
      .filter((b) => (b.title || '').toLowerCase().includes(q) || (b.url || '').toLowerCase().includes(q))
      .slice(0, limit);
  },
};

function nextOrder(items, folderId) {
  const inFolder = items.filter((b) => (b.folderId || 'bar') === folderId);
  return inFolder.reduce((m, b) => Math.max(m, (b.order || 0) + 1), 0);
}

/* ------------------------------------------------------------------ */
/* History                                                            */
/* ------------------------------------------------------------------ */

const history = {
  add({ url, title, favicon = null, transition = 'link' }) {
    if (!url || nav.isInternal(url)) return;
    if (!/^https?:|^file:|^ftp:/i.test(url)) return; // only real navigations
    const key = nav.normalizeForCompare(url);
    let entry = historyDB.data.entries.find((e) => nav.normalizeForCompare(e.url) === key);
    if (entry) {
      entry.visitCount = (entry.visitCount || 1) + 1;
      entry.lastVisit = now();
      if (title) entry.title = title;
      if (favicon) entry.favicon = favicon;
      entry.transition = transition;
    } else {
      historyDB.data.entries.push({
        id: uuid(), url, title: title || url, favicon,
        lastVisit: now(), visitCount: 1, transition,
      });
    }
    if (historyDB.data.entries.length > HISTORY_CAP) {
      historyDB.data.entries.sort((a, b) => b.lastVisit - a.lastVisit);
      historyDB.data.entries.length = HISTORY_CAP;
    }
    historyDB.scheduleSave();
    bus.emit('history');
  },

  list({ limit = 150, offset = 0, before } = {}) {
    let entries = historyDB.data.entries.slice().sort((a, b) => b.lastVisit - a.lastVisit);
    if (before) entries = entries.filter((e) => e.lastVisit < before);
    const total = entries.length;
    return { entries: entries.slice(offset, offset + limit), total };
  },

  search({ query, limit = 50 }) {
    const q = String(query || '').toLowerCase();
    if (!q) return { entries: this.list({ limit }).entries };
    const matched = historyDB.data.entries
      .filter((e) => (e.title || '').toLowerCase().includes(q) || (e.url || '').toLowerCase().includes(q));
    matched.sort((a, b) => frecency(b) - frecency(a));
    return { entries: matched.slice(0, limit) };
  },

  /** Used by the omnibox; returns ranked entries with a score. */
  suggest(query, limit = 8) {
    const q = String(query || '').toLowerCase();
    if (!q) return [];
    return historyDB.data.entries
      .filter((e) => (e.title || '').toLowerCase().includes(q) || (e.url || '').toLowerCase().includes(q))
      .map((e) => ({ entry: e, score: frecency(e) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map((x) => x.entry);
  },

  remove({ ids = [] }) {
    const set = new Set(ids);
    historyDB.data.entries = historyDB.data.entries.filter((e) => !set.has(e.id));
    historyDB.scheduleSave();
    bus.emit('history');
    return { ok: true };
  },

  clear({ range = 'all', since } = {}) {
    const cutoff = since != null ? since : rangeCutoff(range);
    const before = historyDB.data.entries.length;
    if (cutoff === 0) {
      historyDB.data.entries = [];
    } else {
      historyDB.data.entries = historyDB.data.entries.filter((e) => e.lastVisit < cutoff);
    }
    const removed = before - historyDB.data.entries.length;
    historyDB.scheduleSave();
    bus.emit('history');
    return { removed };
  },

  topSites(limit = 10) {
    const map = new Map();
    for (const e of historyDB.data.entries) {
      try {
        const origin = new URL(e.url).origin;
        const cur = map.get(origin);
        if (!cur || frecency(e) > cur.score) {
          map.set(origin, { url: e.url, title: e.title, favicon: e.favicon, score: frecency(e) });
        } else {
          cur.score += e.visitCount || 1;
        }
      } catch { /* skip */ }
    }
    return [...map.values()].sort((a, b) => b.score - a.score).slice(0, limit);
  },
};

function frecency(e) {
  const ageDays = (now() - (e.lastVisit || 0)) / 86400000;
  const recency = 1 / (1 + ageDays); // 1 today -> decays
  return (e.visitCount || 1) * (0.3 + 0.7 * recency);
}

function rangeCutoff(range) {
  const t = now();
  switch (range) {
    case 'last-hour': return t - 3600e3;
    case 'last-day': return t - 86400e3;
    case 'last-week': return t - 7 * 86400e3;
    case 'all':
    default: return 0; // 0 => wipe everything
  }
}

/* ------------------------------------------------------------------ */
/* Downloads (persisted terminal-state records)                       */
/* ------------------------------------------------------------------ */

const downloads = {
  list() {
    const items = downloadsDB.data.items.slice().sort((a, b) => b.startTime - a.startTime);
    return { downloads: items };
  },
  upsert(item) {
    const idx = downloadsDB.data.items.findIndex((d) => d.id === item.id);
    if (idx >= 0) downloadsDB.data.items[idx] = { ...downloadsDB.data.items[idx], ...item };
    else downloadsDB.data.items.unshift(item);
    downloadsDB.scheduleSave();
    bus.emit('downloads');
  },
  get(id) { return downloadsDB.data.items.find((d) => d.id === id); },
  remove({ id }) {
    downloadsDB.data.items = downloadsDB.data.items.filter((d) => d.id !== id);
    downloadsDB.scheduleSave();
    bus.emit('downloads');
    return { ok: true };
  },
  clear() {
    downloadsDB.data.items = [];
    downloadsDB.scheduleSave();
    bus.emit('downloads');
    return { ok: true };
  },
};

/* ------------------------------------------------------------------ */
/* Settings                                                           */
/* ------------------------------------------------------------------ */

const settings = {
  getAll() { return { ...SETTINGS_DEFAULTS, ...settingsDB.data.settings }; },
  get(key) { return this.getAll()[key]; },

  set(patch = {}) {
    const cur = this.getAll();
    const next = { ...cur };

    if (patch.theme && ['system', 'light', 'dark'].includes(patch.theme)) {
      next.theme = patch.theme;
      try { nativeTheme.themeSource = patch.theme; } catch { /* ignore */ }
    }
    if (patch.searchEngine && ['google', 'bing', 'duckduckgo', 'custom'].includes(patch.searchEngine)) {
      next.searchEngine = patch.searchEngine;
      if (patch.searchEngine !== 'custom') {
        next.searchEngineTemplate = nav.SEARCH_ENGINES[patch.searchEngine];
      }
    }
    if (patch.searchEngineTemplate && patch.searchEngineTemplate.includes('%s')) {
      next.searchEngineTemplate = patch.searchEngineTemplate;
    }
    const passthrough = [
      'homeUrl', 'newTabUrl', 'searchSuggestions', 'downloadDir', 'promptForDownloadLocation',
      'restoreSession', 'startupUrls', 'showBookmarksBar', 'showHomeButton',
      'persistPerOriginZoom', 'blockPopups', 'sendDoNotTrack',
      'adblockEnabled', 'adblockAllowlist', 'hibernateEnabled', 'hibernateMinutes',
      'forceDark', 'accentColor', 'verticalTabs', 'sidebarEnabled', 'sidebarApps',
      'translateTarget', 'showResourceMonitor',
    ];
    for (const k of passthrough) if (patch[k] !== undefined) next[k] = patch[k];

    if (patch.startupMode && ['newtab', 'restore', 'urls'].includes(patch.startupMode)) {
      next.startupMode = patch.startupMode;
    }
    if (patch.defaultZoom !== undefined) {
      next.defaultZoom = clamp(Number(patch.defaultZoom) || 0, -5, 5);
    }
    if (patch.perOriginZoom && typeof patch.perOriginZoom === 'object') {
      next.perOriginZoom = patch.perOriginZoom;
    }

    settingsDB.data.settings = next;
    settingsDB.scheduleSave();
    bus.emit('settings');
    return { settings: next };
  },

  setOriginZoom(origin, level) {
    if (!origin) return;
    const s = this.getAll();
    if (!s.persistPerOriginZoom) return;
    const map = { ...s.perOriginZoom };
    if (level === 0) delete map[origin]; else map[origin] = level;
    settingsDB.data.settings = { ...s, perOriginZoom: map };
    settingsDB.scheduleSave();
    // no broadcast needed for zoom map
  },

  reset() {
    settingsDB.data.settings = { ...SETTINGS_DEFAULTS, downloadDir: safeDownloadsPath() };
    try { nativeTheme.themeSource = 'system'; } catch { /* ignore */ }
    settingsDB.scheduleSave();
    bus.emit('settings');
    return { settings: this.getAll() };
  },
};

function clamp(n, lo, hi) { return Math.max(lo, Math.min(hi, n)); }

/* ------------------------------------------------------------------ */
/* Session                                                            */
/* ------------------------------------------------------------------ */

const session = {
  save(snapshot) {
    sessionDB.data.session = { ...sessionDB.data.session, ...snapshot, savedAt: now() };
    sessionDB.scheduleSave();
  },
  saveWindowBounds(bounds, maximized) {
    sessionDB.data.session.windowBounds = bounds;
    sessionDB.data.session.maximized = !!maximized;
    sessionDB.scheduleSave();
  },
  getWindowBounds() {
    return { bounds: sessionDB.data.session.windowBounds, maximized: sessionDB.data.session.maximized };
  },
  raw() { return sessionDB.data.session; },
  clear() {
    sessionDB.data.session = { savedAt: 0, activeTabId: null, windowBounds: null, maximized: false, tabs: [] };
    sessionDB.scheduleSave();
  },
};

/* ------------------------------------------------------------------ */
/* Reading list                                                       */
/* ------------------------------------------------------------------ */

const readingList = {
  list() {
    return { items: readingDB.data.items.slice().sort((a, b) => b.added - a.added) };
  },
  add({ url, title, favicon = null }) {
    if (!url) throw new Error('url required');
    const key = nav.normalizeForCompare(url);
    if (readingDB.data.items.some((i) => nav.normalizeForCompare(i.url) === key)) {
      return { ok: true, duplicate: true };
    }
    readingDB.data.items.unshift({ id: uuid(), url, title: title || url, favicon, added: now(), read: false });
    readingDB.scheduleSave();
    bus.emit('reading');
    return { ok: true };
  },
  setRead({ id, read = true }) {
    const it = readingDB.data.items.find((x) => x.id === id);
    if (it) { it.read = !!read; readingDB.scheduleSave(); bus.emit('reading'); }
    return { ok: true };
  },
  remove({ id }) {
    readingDB.data.items = readingDB.data.items.filter((i) => i.id !== id);
    readingDB.scheduleSave();
    bus.emit('reading');
    return { ok: true };
  },
};

module.exports = {
  bus,
  initStores,
  flushAll,
  bookmarks,
  history,
  downloads,
  settings,
  session,
  readingList,
  SETTINGS_DEFAULTS,
};
