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
const adblock = require('./adblock');
const ipc = require('./ipc');
const { buildAppMenu } = require('./appMenu');

// Must run synchronously before app is ready.
protocolHandler.registerPrivileged();
app.setName('Aether');

const SMOKE_TEST = process.argv.includes('--smoke');
const UI_TEST = process.argv.includes('--uitest');

// In the automated smoke/ui check there is often no real GPU/display, and
// Chromium's GPU process can stall on teardown. Disable it for that path only.
if (SMOKE_TEST || UI_TEST) {
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
  adblock.init({ broadcast: windows.broadcastAll });
  windows.ensureSessionSecurity(windows.NORMAL_PARTITION, false);

  buildAppMenu(windows);
  ipc.register();
  wireBroadcasts();

  windows.createWindow({});

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) windows.createWindow({});
  });

  if (SMOKE_TEST) runSmokeTest();
  if (UI_TEST) runUiTest();
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
  stores.bus.on('reading', () => windows.broadcastAll('reading:changed', {}));
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
/** Interactive UI test: drive the renderer's overlays and assert show/hide. */
async function runUiTest() {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  let w = null;
  for (let i = 0; i < 60; i += 1) { w = windows.all()[0]; if (w && !w.win.webContents.isLoading()) break; await wait(200); }
  if (!w) { console.log('UITEST_FAIL no window'); app.exit(1); return; }
  await wait(1400);
  const wc = w.win.webContents;
  const js = (code) => wc.executeJavaScript(code, true);
  const results = [];
  const check = (name, cond, extra) => {
    results.push(!!cond);
    console.log((cond ? 'PASS ' : 'FAIL ') + name + (extra ? ' :: ' + extra : ''));
  };
  const vis = async (id) => JSON.parse(await js(`(()=>{const e=document.getElementById('${id}');if(!e)return JSON.stringify({display:'missing'});return JSON.stringify({hidden:e.hidden,display:getComputedStyle(e).display});})()`));

  try {
    for (const id of ['cmdPalette', 'findBar', 'sidebarPanel', 'resMonitor', 'vtabs', 'bookmarksBar', 'homeBtn', 'downloadsBtn']) {
      const v = await vis(id);
      check('initial-hidden:' + id, v.display === 'none', JSON.stringify(v));
    }
    await js("handleCommand('command-palette')"); await wait(150);
    check('cmd-opens', (await vis('cmdPalette')).display !== 'none');
    await js("window.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape'}))"); await wait(150);
    check('cmd-closes-esc', (await vis('cmdPalette')).display === 'none');
    await js("handleCommand('find')"); await wait(150);
    check('find-opens', (await vis('findBar')).display !== 'none');
    await js("document.getElementById('findClose').click()"); await wait(150);
    check('find-closes', (await vis('findBar')).display === 'none');
    await js("handleCommand('toggle-vertical-tabs')"); await wait(600);
    const vt = JSON.parse(await js("JSON.stringify({d:getComputedStyle(document.getElementById('vtabs')).display,p:document.getElementById('tabstrip').parentElement.id})"));
    check('vtabs-on', vt.d !== 'none' && vt.p === 'vtabs', JSON.stringify(vt));
    await js("handleCommand('toggle-vertical-tabs')"); await wait(600);
    const vt2 = JSON.parse(await js("JSON.stringify({d:getComputedStyle(document.getElementById('vtabs')).display,p:document.getElementById('tabstrip').parentElement.id})"));
    check('vtabs-off', vt2.d === 'none' && vt2.p === 'titlebar', JSON.stringify(vt2));
    await js("document.querySelector('#sidebarRail .rail-btn[data-app]').click()"); await wait(300);
    const sp = JSON.parse(await js("JSON.stringify({d:getComputedStyle(document.getElementById('sidebarPanel')).display,t:document.getElementById('sidebarPanelTitle').textContent})"));
    check('sidebar-opens', sp.d !== 'none' && sp.t !== 'Panel', JSON.stringify(sp));
    await js("document.getElementById('sidebarPanelClose').click()"); await wait(200);
    check('sidebar-closes', (await vis('sidebarPanel')).display === 'none');
    await js("handleCommand('toggle-res-monitor')"); await wait(400);
    check('resmon-on', (await vis('resMonitor')).display !== 'none');
    await js("handleCommand('toggle-res-monitor')"); await wait(300);
    check('resmon-off', (await vis('resMonitor')).display === 'none');
  } catch (e) { console.log('UITEST_ERROR', e.message); }

  const passed = results.filter(Boolean).length;
  console.log('UITEST_DONE ' + passed + '/' + results.length + ' passed');
  await wait(300);
  process.exit(passed === results.length ? 0 : 2);
}

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
      // Give the first guest (browser://newtab) a moment to finish loading.
      setTimeout(async () => {
        try {
          const probe = await w.win.webContents.executeJavaScript(
            'JSON.stringify({api: !!window.browserAPI, tabs: document.querySelectorAll("webview").length, theme: document.documentElement.dataset.theme, rail: document.querySelectorAll("#sidebarRail .rail-btn").length, shield: !!document.getElementById("shieldBtn"), cmd: !!document.getElementById("cmdPalette"), sidebar: document.documentElement.dataset.sidebar})');
          console.log('SMOKE_PROBE', probe);
          const ab = await w.win.webContents.executeJavaScript('window.browserAPI.adblock.stats()');
          console.log('SMOKE_ADBLOCK', JSON.stringify(ab));
        } catch (e) { console.log('SMOKE_PROBE_FAIL', e.message); }
        try {
          const { webContents } = require('electron');
          const guests = webContents.getAllWebContents()
            .filter((wc) => wc.getType() === 'webview')
            .map((wc) => ({ url: wc.getURL(), title: wc.getTitle() }));
          console.log('SMOKE_GUESTS', JSON.stringify(guests));
        } catch (e) { console.log('SMOKE_GUESTS_FAIL', e.message); }
        console.log('SMOKE_OK renderer-loaded in', Date.now() - started, 'ms');
        try { stores.flushAll(); } catch { /* ignore */ }
        // process.exit can deadlock in headless/no-GPU teardown; the runner reaps us.
        setTimeout(() => process.exit(0), 300);
      }, 1500);
    } else if (Date.now() - started > 15000) {
      clearInterval(timer);
      console.error('SMOKE_FAIL renderer did not load');
      app.exit(1);
    }
  }, 200);
}
