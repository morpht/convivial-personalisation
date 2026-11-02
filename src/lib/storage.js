/**
 * @file
 * Versioned, write-behind storage for the profile blob.
 *
 * Layout in localStorage (key `convivial_personalisation`):
 *   { _version: 3, <siteId>: { _schema: 3, store: {}, counters: {}, ... } }
 *
 * Writes mark the blob dirty; one serialisation happens at the end of
 * collect(), on pagehide/visibilitychange, or on an idle callback. This
 * replaces the per-write JSON round trip of v1.
 */

import { getTime, isLocalStorageAvailable, getPath, safeKey } from './utility';
import { valuesOf, termOf } from './vector';

export const SCHEMA = 3;
export const STORAGE_KEY = 'convivial_personalisation';
const isRecord = (value) =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

/** Unwrap old processor output, including accidentally nested wrappers. */
function unwrapTemp(value) {
  const seen = new Set();
  while (
    isRecord(value) &&
    Object.prototype.hasOwnProperty.call(value, 'value')
  ) {
    if (seen.has(value)) return undefined;
    seen.add(value);
    value = value.value;
  }
  return value;
}

/** Flatten metadata lists at the write boundary. */
function tempValue(raw) {
  if (!Array.isArray(raw)) return raw;
  return valuesOf(raw)
    .map((entry) => {
      if (typeof entry !== 'object') return String(entry);
      const term = termOf(entry);
      return term
        ? term.id + (term.name ? '|' + term.name : '')
        : JSON.stringify(entry);
    })
    .join(', ');
}

const EMPTY = () => ({
  _schema: SCHEMA,
  store: {},
  counters: {},
  accumulators: {},
  dimensions: {},
  log: {},
  fetchers: {},
  temp: {},
  profiles: {},
  seen: [],
  suppress: [],
  meta: {},
});

/** Migrations keyed by the schema they upgrade FROM. */
const MIGRATIONS = {
  // v1 (no _schema): drop the client identifier, drop the "[object Object]"
  // search log entry (v1 defect D2). Dimensions, counters, store carry over.
  1: (data) => {
    const out = Object.assign(EMPTY(), data);
    delete out._clientId;
    delete out._licenseKey;
    delete out._version;
    delete out.dimensions_fast;
    delete out.dimensions_t;
    delete out.vec;
    if (out.log) {
      Object.keys(out.log).forEach((type) => {
        if (out.log[type] && typeof out.log[type] === 'object')
          delete out.log[type]['[object Object]'];
      });
    }
    out._schema = 2;
    return out;
  },
  // Temp is page-scoped and recollected. Preserve the visitor's other data.
  2: (data) => ({ ...data, _schema: 3, temp: {} }),
};

export class Storage {
  /**
   * @param {string} siteId
   * @param {object} opts { persist: boolean, key: string, now: fn }
   */
  constructor(siteId, opts = {}) {
    if (!safeKey(siteId) || String(siteId).startsWith('_')) {
      throw new Error('Invalid personalisation site ID');
    }
    this.siteId = siteId;
    this.key = opts.key || STORAGE_KEY;
    this.available = isLocalStorageAvailable();
    this.persist = opts.persist !== false && this.available;
    this.now = opts.now || getTime;
    this.dirty = false;
    this._flushTimer = null;
    // Original values are only kept in memory for legacy .value paths.
    this._tempValues = new Map();
    this.data = this._load();
    this.clearTemp();
    if (this.migrated) this.dirty = true;
    this._bindFlush();
  }

  _readRoot() {
    if (!this.available) return {};
    try {
      const root = JSON.parse(localStorage.getItem(this.key));
      if (!isRecord(root)) return {};
      delete root._clientId;
      delete root._licenseKey;
      return root;
    } catch (e) {
      return {};
    }
  }

  _load() {
    if (!this.persist) return EMPTY();
    const root = this._readRoot();
    let data = root[this.siteId];
    if (!isRecord(data)) return EMPTY();
    let schema = data._schema || 1;
    if (schema > SCHEMA) {
      // An older bundle must not overwrite a newer storage schema.
      this.futureSchema = true;
      this.persist = false;
      return EMPTY();
    }
    while (schema < SCHEMA) {
      const migrate = MIGRATIONS[schema];
      if (!migrate) break;
      data = migrate(data, this.now());
      schema = data._schema;
      this.migrated = true; // persist the upgraded blob on the next flush
    }
    const clean = EMPTY();
    Object.keys(clean).forEach((key) => {
      if (key === '_schema') return;
      if (Array.isArray(clean[key])) {
        if (Array.isArray(data[key])) clean[key] = data[key];
      } else if (isRecord(data[key])) {
        clean[key] = data[key];
      }
    });
    delete clean.meta.seed;
    return clean;
  }

  /** Read only the output index when consent prevents loading profiles. */
  publishedKeys() {
    const published = getPath(this._readRoot(), [
      this.siteId,
      'meta',
      'published',
    ]);
    return isRecord(published) ? Object.keys(published) : [];
  }

  _bindFlush() {
    if (typeof window === 'undefined' || !window.addEventListener) return;
    const flush = () => this.flush();
    window.addEventListener('pagehide', flush);
    window.addEventListener('beforeunload', flush);
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') flush();
      });
    }
  }

  markDirty() {
    this.dirty = true;
    if (this._flushTimer) return;
    const schedule =
      typeof requestIdleCallback === 'function'
        ? (fn) => requestIdleCallback(fn, { timeout: 1000 })
        : (fn) => setTimeout(fn, 250);
    this._flushTimer = schedule(() => {
      this._flushTimer = null;
      this.flush();
    });
  }

  /** Serialise once. Safe to call repeatedly. */
  flush() {
    this.normalizeTemp();
    if (!this.dirty || !this.persist) return false;
    const root = this._readRoot();
    root._version = SCHEMA;
    delete root._clientId; // v1 client identifier: no longer stored (privacy)
    delete root._licenseKey;
    const copy = Object.assign({}, this.data);
    root[this.siteId] = copy;
    try {
      localStorage.setItem(this.key, JSON.stringify(root));
      this.dirty = false;
      return true;
    } catch (e) {
      // QuotaExceededError or private mode: keep working in memory.
      return false;
    }
  }

  /** Remove this site's data entirely (erase). */
  erase() {
    this.data = EMPTY();
    this._tempValues.clear();
    this.dirty = false;
    if (!this.available) return;
    try {
      const root = this._readRoot();
      delete root[this.siteId];
      if (Object.keys(root).filter((k) => k !== '_version').length === 0)
        localStorage.removeItem(this.key);
      else localStorage.setItem(this.key, JSON.stringify(root));
    } catch (e) {
      /* ignore */
    }
  }

  /** Switch persistence on/off at runtime (consent changes). */
  setPersist(on) {
    if (on && !this.persist && this.available && !this.futureSchema) {
      this.persist = true;
      this.dirty = true;
      this.flush();
    } else if (!on && this.persist) {
      this.persist = false;
      this.erase();
    }
  }

  // ---- accessors used by plugins -------------------------------------------

  /** Page metadata and compatibility values must expire together. */
  clearTemp() {
    this.data.temp = {};
    this._tempValues.clear();
  }

  /** Older plugins can write wrappers directly instead of using set(). */
  normalizeTemp() {
    if (!isRecord(this.data.temp)) {
      this.clearTemp();
      return;
    }
    Object.entries(this.data.temp).forEach(([key, value]) => {
      if (Array.isArray(value) || unwrapTemp(value) !== value)
        this.set('temp', key, value);
      else {
        // Legacy plugins can mutate an array returned by a .value read.
        const entry = this._tempValues.get(key);
        if (entry && entry.flat === value && Array.isArray(entry.value)) {
          const flat = tempValue(entry.value);
          if (flat !== value) {
            entry.flat = flat;
            this.data.temp[key] = flat;
            this.markDirty();
          }
        }
      }
    });
    this._tempValues.forEach((entry, key) => {
      if (
        !Object.prototype.hasOwnProperty.call(this.data.temp, key) ||
        this.data.temp[key] !== entry.flat
      )
        this._tempValues.delete(key);
    });
  }

  get(path) {
    const parts = Array.isArray(path) ? path : String(path).split('.');
    if (parts[0] === 'temp') this.normalizeTemp();
    // Old paths retain the original type, including arrays and indexed reads.
    // New temp.<key> paths always expose the flat representation.
    if (parts.length >= 3 && parts[0] === 'temp' && parts[2] === 'value') {
      const flat = getPath(this.data, parts.slice(0, 2));
      const entry = this._tempValues.get(parts[1]);
      const value =
        entry && entry.flat === flat ? entry.value : unwrapTemp(flat);
      return getPath({ value }, parts.slice(2));
    }
    return getPath(this.data, parts);
  }

  set(type, key, value) {
    if (!safeKey(type) || !safeKey(key)) return;
    if (!isRecord(this.data[type])) this.data[type] = {};
    if (type === 'temp') {
      const raw = unwrapTemp(value);
      const flat = tempValue(raw);
      this._tempValues.set(key, { flat, value: raw });
      this.data.temp[key] = flat;
    } else this.data[type][key] = value;
    this.markDirty();
  }

  del(type, key) {
    if (!safeKey(type) || !safeKey(key)) return;
    if (this.data[type]) delete this.data[type][key];
    if (type === 'temp') this._tempValues.delete(key);
    this.markDirty();
  }

  inc(type, key, increment = 1) {
    if (!safeKey(type) || !safeKey(key)) return;
    if (!isRecord(this.data[type])) this.data[type] = {};
    const n = parseFloat(increment);
    this.data[type][key] =
      (parseFloat(this.data[type][key]) || 0) + (isFinite(n) ? n : 1);
    this.markDirty();
    return this.data[type][key];
  }

  incSub(type, key, subKey, increment = 1) {
    if (![type, key, subKey].every(safeKey)) return;
    if (!isRecord(this.data[type])) this.data[type] = {};
    if (!isRecord(this.data[type][key])) this.data[type][key] = {};
    const n = parseFloat(increment);
    this.data[type][key][subKey] =
      (parseFloat(this.data[type][key][subKey]) || 0) + (isFinite(n) ? n : 1);
    this.markDirty();
    return this.data[type][key][subKey];
  }

  /**
   * Append to a capped log. Values are strings (D2). Evicts oldest while the
   * log is at or over `size` (D14).
   */
  log(type, value, size) {
    if (!safeKey(type)) return;
    if (value === undefined || value === null) return;
    const key = typeof value === 'string' ? value : JSON.stringify(value);
    if (!safeKey(key)) return;
    this.data.log = this.data.log || {};
    const log = (this.data.log[type] = this.data.log[type] || {});
    if (
      size !== undefined &&
      size !== null &&
      Object.keys(log).length >= size &&
      !(key in log)
    ) {
      const entries = Object.entries(log).sort((a, b) => a[1] - b[1]);
      while (entries.length >= size && entries.length)
        delete log[entries.shift()[0]];
    }
    log[key] = this.now();
    this.markDirty();
  }
}
