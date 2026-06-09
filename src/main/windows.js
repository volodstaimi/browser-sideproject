'use strict';

/**
 * Window manager + cross-window broadcast.
 *
 * Each chrome window is a frameless BrowserWindow loading the renderer shell.
 * The shell itself always uses the normal partition (it only renders local UI);
 * incognito isolation lives in the <webview> partition the renderer picks up
 * from app:get-info.
 */

const { BrowserWindow, session, webContents } = require('electron');
const path = require('path');
const stores = require('./stores');
const security = require('./security');
const downloads = require('./downloads');
const protocolHandler = require('./protocol');

const PRELOAD = path.join(__dirname, '..', 'preload.js');
const CHROME_HTML = path.join(__dirname, '..', 'renderer', 'index.html');
const NORMAL_PARTITION = 'persist:aether';

const windows = new Map(); // host webContents.id -> { win, isIncognito, partition, initialUrl }
const readySessions = new Set();
let incognitoSeq = 0;

function ensureSessionSecurity(partition, incognito) {
  if (readySessions.has(partition)) return session.fromPartition(partition);
  const ses = session.fromPartition(partition);
  security.applySessionSecurity(ses, { incognito });
  downloads.attachToSession(ses, { incognito });
  protocolHandler.attachHandler(ses); // serve browser:// in this partition too
  readySessions.add(partition);
  return ses;
}

function createWindow({ url = null, incognito = false } = {}) {
  const partition = incognito ? `incognito-${++incognitoSeq}` : NORMAL_PARTITION;
  ensureSessionSecurity(partition, incognito);
  ensureSessionSecurity(NORMAL_PARTITION, false); // shell session

  const restore = !incognito ? stores.session.getWindowBounds() : { bounds: null, maximized: false };
  const b = restore.bounds || {};

  const win = new BrowserWindow({
    width: b.width || 1280,
    height: b.height || 820,
    x: b.x,
    y: b.y,
    minWidth: 530,
    minHeight: 380,
    frame: false,
    show: false,
    backgroundColor: incognito ? '#202124' : '#f1f3f4',
    titleBarStyle: process.platform === 'darwin' ? 'hidden' : 'default',
    trafficLightPosition: process.platform === 'darwin' ? { x: 12, y: 13 } : undefined,
    webPreferences: {
      preload: PRELOAD,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      webviewTag: true,
      spellcheck: true,
      partition: NORMAL_PARTITION,
    },
  });

  windows.set(win.webContents.id, { win, isIncognito: incognito, partition, initialUrl: url });

  win.loadFile(CHROME_HTML);

  win.once('ready-to-show', () => {
    win.show();
    if (!incognito && restore.maximized) win.maximize();
  });

  const sendState = () => {
    if (win.isDestroyed()) return;
    win.webContents.send('window:maximize-state', {
      isMaximized: win.isMaximized(),
      isFullScreen: win.isFullScreen(),
    });
  };
  win.on('maximize', sendState);
  win.on('unmaximize', sendState);
  win.on('enter-full-screen', sendState);
  win.on('leave-full-screen', sendState);
  win.on('focus', () => !win.isDestroyed() && win.webContents.send('window:focus-state', { isFocused: true }));
  win.on('blur', () => !win.isDestroyed() && win.webContents.send('window:focus-state', { isFocused: false }));

  win.on('close', () => {
    if (!incognito) {
      try { stores.session.saveWindowBounds(win.getNormalBounds(), win.isMaximized()); } catch { /* ignore */ }
    }
  });
  win.on('closed', () => windows.delete(win.webContents.id));

  return win;
}

function getWindowMeta(wc) {
  if (!wc) return null;
  return windows.get(wc.id) || null;
}

function getWindowByHostId(id) {
  const meta = windows.get(id);
  return meta ? meta.win : null;
}

function getMetaByHostId(id) {
  return windows.get(id) || null;
}

/** Broadcast a store-change / downloads event to every renderer (host + guests). */
function broadcastAll(channel, payload) {
  for (const wc of webContents.getAllWebContents()) {
    if (!wc.isDestroyed()) {
      try { wc.send(channel, payload); } catch { /* ignore */ }
    }
  }
}

function sendToWindow(win, channel, payload) {
  if (win && !win.isDestroyed()) win.webContents.send(channel, payload);
}

function count() { return windows.size; }
function all() { return [...windows.values()]; }

module.exports = {
  createWindow,
  getWindowMeta,
  getWindowByHostId,
  getMetaByHostId,
  broadcastAll,
  sendToWindow,
  ensureSessionSecurity,
  count,
  all,
  NORMAL_PARTITION,
};
