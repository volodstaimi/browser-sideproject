'use strict';

/**
 * Preload injected into every <webview> guest. The privileged window.browserAPI
 * is exposed ONLY to internal `browser://` pages. External web pages get
 * nothing — even though this same file runs in them, the protocol gate keeps
 * the API out of their world.
 */

const { contextBridge, ipcRenderer } = require('electron');

const isInternal = (() => {
  try { return window.location.protocol === 'browser:'; } catch { return false; }
})();

if (isInternal) {
  const invoke = (channel, payload) => ipcRenderer.invoke(channel, payload);
  const send = (channel, payload) => ipcRenderer.send(channel, payload);

  const EVENT_CHANNELS = new Set([
    'bookmarks:changed',
    'history:changed',
    'downloads:started',
    'downloads:progress',
    'downloads:done',
    'downloads:changed',
    'settings:changed',
    'reading:changed',
  ]);

  function subscribe(channel, callback) {
    if (!EVENT_CHANNELS.has(channel)) return () => {};
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on(channel, listener);
    return () => ipcRenderer.removeListener(channel, listener);
  }

  const api = {
    isInternalPage: true,
    nav: {
      navigate: (input) => invoke('nav:navigate', { input }),
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
    app: {
      getInfo: () => invoke('app:get-info'),
    },
    reader: {
      get: (id) => invoke('reader:get', { id }),
    },
    readingList: {
      list: () => invoke('reading:list'),
      add: (item) => invoke('reading:add', item),
      setRead: (id, read) => invoke('reading:set-read', { id, read }),
      remove: (id) => invoke('reading:remove', { id }),
    },
    shellOpenExternal: (url) => invoke('shell:open-external', { url }),
    clipboardWriteText: (text) => invoke('clipboard:write', { text }),
    on: subscribe,
  };

  contextBridge.exposeInMainWorld('browserAPI', api);
}
