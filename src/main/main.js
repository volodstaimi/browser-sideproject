'use strict';

/**
 * Aether — application entry (main process).
 *
 * Order matters: the privileged `browser://` scheme is registered at module
 * load (before app 'ready'); everything else is wired inside whenReady.
 */

const { app, nativeTheme, BrowserWindow } = require('electron');

const protocolHandler = require('./protocol');
const stores = require('./stores');
const windows = require('./windows');
const security = require('./security');
const downloads = require('./downloads');
const ipc = require('./ipc');
const { buildAppMenu } = require('./appMenu');

// Must run synchronously before app is ready.
protocolHandler.registerPrivileged();
app.setName('Aether');

const SMOKE_TEST = process.argv.includes('--smoke');

// In the automated smoke check there is often no real GPU/display, and
// Chromium's GPU process can stall on teardown. Disable it for that path only.
if (SMOKE_TEST) {
  app.disableHardwareAcceleration();
  app.commandLine.appendSwitch('disable-gpu');
  app.commandLine.appendSwitch('disable-gpu-compositing');
  app.commandLine.appendSwitch('in-process-gpu');
}

// Single-instance: focus the existing window in the primary instance instead.
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    const existing = windows.all()[0];
    if (existing && !existing.win.isDestroyed()) {
      if (existing.win.isMinimized()) existing.win.restore();
      existing.win.focus();
    } else {
      windows.createWindow({});
    }
  });

  app.whenReady().then(bootstrap);
}

function bootstrap() {
  stores.initStores();

  // Apply persisted theme to the native layer.
  try { nativeTheme.themeSource = stores.settings.get('theme') || 'system'; } catch { /* ignore */ }

  protocolHandler.registerHandler();

  // Route guest window.open / target=_blank to a tab (or a new window).
  security.setupSecurity({ routeOpenURL });

  downloads.init({ broadcast: windows.broadcastAll });
  windows.ensureSessionSecurity(windows.NORMAL_PARTITION, false);

  buildAppMenu(windows);
  ipc.register();
  wireBroadcasts();

  windows.createWindow({});

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) windows.createWindow({});
  });

  if (SMOKE_TEST) runSmokeTest();
}

function routeOpenURL(hostId, url, disposition) {
  const meta = windows.getMetaByHostId(hostId);
  if (!meta) {
    windows.createWindow({ url });
    return;
  }
  if (disposition === 'new-window') {
    windows.createWindow({ url, incognito: meta.isIncognito });
  } else {
    windows.sendToWindow(meta.win, 'menu:command', {
      command: 'open-tab',
      args: { url, background: disposition === 'background-tab' },
    });
  }
}

function wireBroadcasts() {
  stores.bus.on('bookmarks', () => windows.broadcastAll('bookmarks:changed', {}));
  stores.bus.on('history', () => windows.broadcastAll('history:changed', {}));
  stores.bus.on('downloads', () => windows.broadcastAll('downloads:changed', {}));
  stores.bus.on('settings', () => windows.broadcastAll('settings:changed', { settings: stores.settings.getAll() }));
  nativeTheme.on('updated', () => windows.broadcastAll('settings:changed', { settings: stores.settings.getAll() }));
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  try { stores.flushAll(); } catch { /* ignore */ }
});

/**
 * Headless-ish launch check: open, confirm the renderer + first guest page
 * loaded, report, then force-exit. We use app.exit (not app.quit) because the
 * GUI teardown loop can stall under a non-interactive session; this is only the
 * smoke path, never normal shutdown.
 */
function runSmokeTest() {
  const started = Date.now();
  let wired = false;
  const timer = setInterval(async () => {
    const w = windows.all()[0];
    if (!wired && w) {
      wired = true;
      w.win.webContents.on('console-message', (_e, level, message) => {
        if (level >= 2) console.log('SMOKE_RENDERER_' + (level === 3 ? 'ERROR' : 'WARN') + ':', message);
      });
    }
    if (w && !w.win.isDestroyed() && !w.win.webContents.isLoading()) {
      clearInterval(timer);
      try {
        const probe = await w.win.webContents.executeJavaScript(
          'JSON.stringify({api: !!window.browserAPI, tabs: document.querySelectorAll("webview").length, theme: document.documentElement.dataset.theme})');
        console.log('SMOKE_PROBE', probe);
      } catch (e) { console.log('SMOKE_PROBE_FAIL', e.message); }
      // eslint-disable-next-line no-console
      console.log('SMOKE_OK renderer-loaded in', Date.now() - started, 'ms');
      try { stores.flushAll(); } catch { /* ignore */ }
      // process.exit can deadlock in headless/no-GPU teardown; the runner reaps us.
      setTimeout(() => process.exit(0), 400);
    } else if (Date.now() - started > 15000) {
      clearInterval(timer);
      console.error('SMOKE_FAIL renderer did not load');
      app.exit(1);
    }
  }, 200);
}
