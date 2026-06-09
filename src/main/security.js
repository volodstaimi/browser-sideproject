'use strict';

/**
 * Centralized web-contents and session hardening.
 *
 * - Forces guest <webview> webPreferences in will-attach-webview (the page can
 *   influence these, so we overwrite them in main).
 * - Denies native popups; routes window.open / target=_blank to a tab (or a new
 *   window for shift-click) in the owning chrome window.
 * - Blocks top-level navigation of the chrome renderer itself.
 * - Per-session permission policy (permissive in normal windows, restrictive in
 *   incognito for sensitive permissions).
 */

const { app, session } = require('electron');
const path = require('path');

const WEBVIEW_PRELOAD = path.join(__dirname, '..', 'webview-preload.js');

// Maps a guest webContents id -> its host (chrome window) webContents id.
const guestToHost = new Map();

const SENSITIVE_PERMISSIONS = new Set([
  'media', 'geolocation', 'notifications', 'midi', 'midiSysex',
  'camera', 'microphone', 'hid', 'serial', 'usb',
]);

/**
 * @param {object} deps
 * @param {(hostId:number, url:string, disposition:string)=>void} deps.routeOpenURL
 */
function setupSecurity(deps) {
  app.on('web-contents-created', (_event, contents) => {
    const type = contents.getType();

    if (type === 'webview') {
      contents.setWindowOpenHandler(({ url, disposition }) => {
        const hostId = guestToHost.get(contents.id);
        try { deps.routeOpenURL(hostId, url, disposition); } catch { /* ignore */ }
        return { action: 'deny' };
      });
      // Block dangerous top-level navigations inside guests: javascript: always,
      // and file: unless the current page is itself trusted (browser:// or file://).
      contents.on('will-navigate', (e, url) => {
        const cur = contents.getURL() || '';
        const fromTrusted = /^(browser:|file:)/i.test(cur);
        if (/^javascript:/i.test(url)) { e.preventDefault(); return; }
        if (/^file:/i.test(url) && !fromTrusted) e.preventDefault();
      });
      return;
    }

    if (type === 'window') {
      // Force guest security every time a <webview> attaches.
      contents.on('will-attach-webview', (_e, webPreferences /* , params */) => {
        webPreferences.preload = WEBVIEW_PRELOAD;
        webPreferences.nodeIntegration = false;
        webPreferences.nodeIntegrationInSubFrames = false;
        webPreferences.contextIsolation = true;
        webPreferences.sandbox = false; // preload needs require()
        delete webPreferences.preloadURL;
      });
      contents.on('did-attach-webview', (_e, guest) => {
        guestToHost.set(guest.id, contents.id);
        guest.on('destroyed', () => guestToHost.delete(guest.id));
      });
      // The chrome renderer must never navigate its own top frame.
      contents.on('will-navigate', (e) => e.preventDefault());
      // And never spawn its own native popups.
      contents.setWindowOpenHandler(() => ({ action: 'deny' }));
    }
  });
}

/** Apply permission + misc policy to a session (default or an incognito partition). */
function applySessionSecurity(ses, { incognito = false } = {}) {
  ses.setPermissionRequestHandler((_wc, permission, callback) => {
    if (incognito && SENSITIVE_PERMISSIONS.has(permission)) return callback(false);
    return callback(true);
  });
  ses.setPermissionCheckHandler((_wc, permission) => {
    if (incognito && SENSITIVE_PERMISSIONS.has(permission)) return false;
    return true;
  });
}

/** Is this URL safe to hand to the OS via shell.openExternal? */
function isSafeExternal(url) {
  try {
    const proto = new URL(url).protocol.toLowerCase();
    return ['http:', 'https:', 'mailto:', 'tel:'].includes(proto);
  } catch {
    return false;
  }
}

module.exports = { setupSecurity, applySessionSecurity, isSafeExternal, WEBVIEW_PRELOAD };
