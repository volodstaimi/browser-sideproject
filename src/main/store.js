'use strict';

/**
 * Tiny, dependency-free JSON persistence for the main process.
 *
 * Each store is one JSON file under app.getPath('userData'). Reads are served
 * from an in-memory cache; writes are debounced and flushed atomically
 * (write temp file, then rename) so a crash mid-write can't corrupt the store.
 */

const fs = require('fs');
const path = require('path');

class Store {
  /**
   * @param {string} dir       directory to hold the file (usually userData)
   * @param {string} filename  e.g. "bookmarks.json"
   * @param {object} defaults  value used when the file is missing/unreadable
   */
  constructor(dir, filename, defaults = {}) {
    this.file = path.join(dir, filename);
    this.tmp = this.file + '.tmp';
    this.defaults = defaults;
    this._data = this._load();
    this._saveTimer = null;
    this._pending = false;
  }

  _load() {
    try {
      const raw = fs.readFileSync(this.file, 'utf8');
      const parsed = JSON.parse(raw);
      // Shallow-merge defaults so newly added keys appear on upgrade.
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed) &&
          this.defaults && typeof this.defaults === 'object' && !Array.isArray(this.defaults)) {
        return Object.assign({}, this.defaults, parsed);
      }
      return parsed;
    } catch (err) {
      // Missing file is normal -> start from defaults silently.
      if (err && err.code !== 'ENOENT') {
        // File existed but was unreadable/corrupt: back it up, then reset.
        try {
          fs.renameSync(this.file, this.file + '.corrupt-' + Date.now());
        } catch { /* ignore */ }
        console.error('[store] corrupt file reset to defaults:', this.file, err.message);
      }
      return clone(this.defaults);
    }
  }

  /** Whole-document accessor. */
  get data() {
    return this._data;
  }

  /** Read a top-level key (object stores only). */
  get(key, fallback = undefined) {
    if (this._data && typeof this._data === 'object' && key in this._data) {
      return this._data[key];
    }
    return fallback;
  }

  /** Set a top-level key (object stores only) and schedule a save. */
  set(key, value) {
    if (!this._data || typeof this._data !== 'object' || Array.isArray(this._data)) {
      this._data = {};
    }
    this._data[key] = value;
    this.scheduleSave();
    return value;
  }

  /** Replace the entire document and schedule a save. */
  replace(value) {
    this._data = value;
    this.scheduleSave();
    return value;
  }

  /** Mutate in place via a callback, then schedule a save. */
  update(fn) {
    const result = fn(this._data);
    if (result !== undefined) this._data = result;
    this.scheduleSave();
    return this._data;
  }

  scheduleSave(delay = 250) {
    this._pending = true;
    if (this._saveTimer) return;
    this._saveTimer = setTimeout(() => {
      this._saveTimer = null;
      this.flush();
    }, delay);
  }

  /** Synchronously flush to disk (atomic). Call on app quit. */
  flush() {
    if (!this._pending) return;
    this._pending = false;
    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      fs.writeFileSync(this.tmp, JSON.stringify(this._data, null, 2), 'utf8');
      fs.renameSync(this.tmp, this.file);
    } catch (err) {
      // Best-effort persistence; never crash the app over a failed write.
      console.error('[store] failed to write', this.file, err);
    }
  }
}

function clone(value) {
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return Array.isArray(value) ? [] : {};
  }
}

module.exports = { Store };
