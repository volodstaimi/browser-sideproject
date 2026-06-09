'use strict';

/**
 * The privileged `browser://` scheme that serves the internal pages
 * (newtab, history, bookmarks, downloads, settings, error) plus shared
 * assets from src/internal/<host>/.
 *
 * registerPrivileged() MUST run at module top level before app 'ready'.
 * registerHandler() runs inside whenReady.
 */

const { protocol } = require('electron');
const path = require('path');
const fsp = require('fs/promises');

const INTERNAL_ROOT = path.join(__dirname, '..', 'internal');
const ALLOWED = new Set(['newtab', 'history', 'bookmarks', 'downloads', 'settings', 'error', 'shared']);

const CONTENT_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

function contentType(file) {
  return CONTENT_TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream';
}

function registerPrivileged() {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: 'browser',
      privileges: {
        standard: true,
        secure: true,
        supportFetchAPI: true,
        corsEnabled: true,
        stream: true,
        allowServiceWorkers: false,
      },
    },
  ]);
}

function registerHandler() {
  protocol.handle('browser', async (request) => {
    try {
      const url = new URL(request.url);
      const host = (url.hostname || 'newtab').toLowerCase();
      if (!ALLOWED.has(host)) {
        return new Response('Unknown internal page', { status: 404, headers: { 'content-type': 'text/plain' } });
      }
      let rel = decodeURIComponent(url.pathname).replace(/^\/+/, '');
      if (!rel) rel = 'index.html';

      const baseDir = path.join(INTERNAL_ROOT, host);
      const filePath = path.normalize(path.join(baseDir, rel));
      const indexPath = path.normalize(path.join(baseDir, 'index.html'));
      // Path-traversal guard: resolved file must stay inside its host dir.
      if (filePath !== indexPath && !filePath.startsWith(path.normalize(baseDir + path.sep))) {
        return new Response('Forbidden', { status: 403, headers: { 'content-type': 'text/plain' } });
      }

      const data = await fsp.readFile(filePath);
      return new Response(data, {
        status: 200,
        headers: { 'content-type': contentType(filePath), 'cache-control': 'no-cache' },
      });
    } catch (err) {
      if (err && err.code === 'ENOENT') {
        return new Response('Not found', { status: 404, headers: { 'content-type': 'text/plain' } });
      }
      return new Response('Internal error: ' + (err && err.message), { status: 500, headers: { 'content-type': 'text/plain' } });
    }
  });
}

function internalURL(page) {
  return 'browser://' + String(page || 'newtab');
}

module.exports = { registerPrivileged, registerHandler, internalURL, INTERNAL_ROOT };
