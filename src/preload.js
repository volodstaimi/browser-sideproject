'use strict';

/**
 * Preload for the CHROME renderer (the browser shell). Exposes a narrow,
 * channel-whitelisted `window.browserAPI`. Never exposes raw ipcRenderer.
 */

const { contextBridge, ipcRenderer } = require('electron');

const invoke = (channel, payload) => ipcRenderer.invoke(channel, payload);
const send = (channel, payload) => ipcRenderer.send(channel, payload);

const EVENT_CHANNELS = new Set([
  'window:maximize-state',
  'window:focus-state',
  'menu:command',
  'downloads:started',
  'downloads:progress',
  'downloads:done',
  'downloads:changed',
  'settings:changed',
  'bookmarks:changed',
  'history:changed',
  'session:request-snapshot',
]);

function subscribe(channel, callback) {
  if (!EVENT_CHANNELS.has(channel)) return () => {};
  const listener = (_event, payload) => callback(payload);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
}

const api = {
  window: {
    minimize: () => send('window:minimize'),
    close: () => send('window:close'),
    maximizeToggle: () => invoke('window:maximize-toggle'),
    isMaximized: () => invoke('window:is-maximized'),
    setFullscreen: (value) => invoke('window:set-fullscreen', { value }),
    open: (url) => invoke('window:new', { url }),
    openIncognito: (url) => invoke('window:new-incognito', { url }),
  },
  nav: {
    navigate: (input) => invoke('nav:navigate', { input }),
  },
  omnibox: {
    suggest: (query, openTabs) => invoke('omnibox:suggest', { query, openTabs }),
  },
  bookmarks: {
    list: (folderId) => invoke('bookmarks:list', { folderId }),
    add: (b) => invoke('bookmarks:add', b),
    update: (id, patch) => invoke('bookmarks:update', { id, patch }),
    remove: (id) => invoke('bookmarks:remove', { id }),
    removeByUrl: (url) => invoke('bookmarks:remove-by-url', { url }),
    reorder: (folderId, orderedIds) => invoke('bookmarks:reorder', { folderId, orderedIds }),
    folderAdd: (name, parentId) => invoke('bookmarks:folder-add', { name, parentId }),
    folderRemove: (id) => invoke('bookmarks:folder-remove', { id }),
    isBookmarked: (url) => invoke('bookmarks:is-bookmarked', { url }),
  },
  history: {
    add: (entry) => send('history:add', entry),
    list: (opts) => invoke('history:list', opts || {}),
    search: (query, limit) => invoke('history:search', { query, limit }),
    topSites: (limit) => invoke('history:top-sites', { limit }),
    remove: (ids) => invoke('history:remove', { ids }),
    clear: (opts) => invoke('history:clear', opts || {}),
  },
  downloads: {
    list: () => invoke('downloads:list'),
    pause: (id) => invoke('downloads:pause', { id }),
    resume: (id) => invoke('downloads:resume', { id }),
    cancel: (id) => invoke('downloads:cancel', { id }),
    openFile: (id) => invoke('downloads:open-file', { id }),
    showInFolder: (id) => invoke('downloads:show-in-folder', { id }),
    remove: (id, deleteFile) => invoke('downloads:remove', { id, deleteFile }),
    clear: () => invoke('downloads:clear'),
  },
  settings: {
    getAll: () => invoke('settings:get-all'),
    get: (key) => invoke('settings:get', { key }),
    set: (patch) => invoke('settings:set', { patch }),
    reset: () => invoke('settings:reset'),
    chooseDownloadDir: () => invoke('settings:choose-download-dir'),
  },
  session: {
    save: (snapshot) => send('session:save', snapshot),
    restore: () => invoke('session:restore'),
  },
  print: {
    toPdf: (webContentsId) => invoke('print:to-pdf', { webContentsId }),
  },
  app: {
    getInfo: () => invoke('app:get-info'),
  },
  shellOpenExternal: (url) => invoke('shell:open-external', { url }),
  clipboardWriteText: (text) => invoke('clipboard:write', { text }),
  on: subscribe,
};

contextBridge.exposeInMainWorld('browserAPI', api);
