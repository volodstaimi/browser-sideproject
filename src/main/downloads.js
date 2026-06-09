'use strict';

/**
 * Download manager. Attaches `will-download` to each session (default + every
 * incognito partition). Live DownloadItems are held in a Map so pause/resume/
 * cancel work; terminal-state records are persisted (skipped for incognito).
 * Progress is throttled (~250ms) with a self-computed speed.
 */

const { shell, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const stores = require('./stores');

const live = new Map(); // id -> Electron DownloadItem
let broadcast = () => {};

function init({ broadcast: b }) {
  broadcast = b || (() => {});
}

function uniqueName(dir, filename) {
  const ext = path.extname(filename);
  const base = path.basename(filename, ext);
  let candidate = filename;
  let i = 1;
  while (fs.existsSync(path.join(dir, candidate))) {
    candidate = `${base} (${i})${ext}`;
    i += 1;
  }
  return candidate;
}

function attachToSession(ses, { incognito = false } = {}) {
  ses.on('will-download', (_event, item) => {
    const id = crypto.randomUUID();
    const settings = stores.settings.getAll();
    const filename = item.getFilename();

    if (!settings.promptForDownloadLocation) {
      const dir = settings.downloadDir || '';
      try {
        if (dir) {
          fs.mkdirSync(dir, { recursive: true });
          item.setSavePath(path.join(dir, uniqueName(dir, filename)));
        }
      } catch { /* fall back to Electron default dialog */ }
    }

    const record = {
      id,
      url: item.getURL(),
      filename,
      savePath: item.getSavePath() || '',
      mime: item.getMimeType(),
      totalBytes: item.getTotalBytes(),
      receivedBytes: 0,
      state: 'progressing',
      startTime: Date.now(),
      endTime: null,
      paused: false,
      incognito,
    };
    live.set(id, item);
    broadcast('downloads:started', record);

    let lastEmit = 0;
    let lastBytes = 0;
    let lastTime = Date.now();

    item.on('updated', (_e, state) => {
      const received = item.getReceivedBytes();
      const total = item.getTotalBytes();
      const t = Date.now();
      if (t - lastEmit >= 250) {
        const dt = (t - lastTime) / 1000;
        const speed = dt > 0 ? (received - lastBytes) / dt : 0;
        lastEmit = t; lastBytes = received; lastTime = t;
        broadcast('downloads:progress', {
          id,
          receivedBytes: received,
          totalBytes: total,
          state: state === 'interrupted' ? 'interrupted' : 'progressing',
          paused: item.isPaused(),
          speedBytesPerSec: Math.max(0, speed),
        });
      }
    });

    item.once('done', (_e, state) => {
      live.delete(id);
      const finalState = state === 'completed' ? 'completed'
        : state === 'cancelled' ? 'cancelled' : 'interrupted';
      const finalRecord = {
        ...record,
        state: finalState,
        receivedBytes: item.getReceivedBytes(),
        totalBytes: item.getTotalBytes() || item.getReceivedBytes(),
        savePath: item.getSavePath() || record.savePath,
        endTime: Date.now(),
        paused: false,
      };
      if (!incognito) {
        // Don't persist the throwaway incognito flag.
        const { incognito: _omit, ...persistable } = finalRecord;
        stores.downloads.upsert(persistable);
      }
      broadcast('downloads:done', { id, state: finalState, savePath: finalRecord.savePath });
      broadcast('downloads:changed', {});
    });
  });
}

function pause(id) { const it = live.get(id); if (it) { it.pause(); return true; } return false; }
function resume(id) { const it = live.get(id); if (it && it.canResume()) { it.resume(); return true; } return false; }
function cancel(id) { const it = live.get(id); if (it) { it.cancel(); return true; } return false; }

function openFile(id) {
  const rec = stores.downloads.get(id);
  if (!rec || !rec.savePath) return { ok: false, error: 'File not found' };
  if (!fs.existsSync(rec.savePath)) return { ok: false, error: 'File no longer exists' };
  shell.openPath(rec.savePath);
  return { ok: true };
}

function showInFolder(id) {
  const rec = stores.downloads.get(id);
  if (!rec || !rec.savePath || !fs.existsSync(rec.savePath)) return { ok: false };
  shell.showItemInFolder(rec.savePath);
  return { ok: true };
}

function removeRecord(id, deleteFile) {
  const rec = stores.downloads.get(id);
  if (deleteFile && rec && rec.savePath) {
    try { fs.unlinkSync(rec.savePath); } catch { /* ignore */ }
  }
  return stores.downloads.remove({ id });
}

module.exports = {
  init,
  attachToSession,
  pause,
  resume,
  cancel,
  openFile,
  showInFolder,
  removeRecord,
};
