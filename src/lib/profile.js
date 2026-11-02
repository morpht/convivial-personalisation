/**
 * @file
 * The visitor's profiles (interest vectors with configured names and decay),
 * plain dimension counters, the seen buffer and the suppression store.
 *
 * A profile is a first-class entity: `profiles.<name> = { v, t, n, decay, cfg }`.
 * Decay is exponential with a half-life (`decay`, seconds) and applied lazily:
 * whenever a profile is touched, the stored vector is multiplied by
 * 0.5^(age / decay) first. Applying it in steps is identical to applying it
 * once, so no history is kept.
 */

import { getTime, safeKey } from './utility';
import { mergeProfileConfig, configHash } from './vector';

const MIN_NORM = 1e-3;
const CAP = 10; // accumulator length cap: a heavy reader cannot swamp the blend

export function decayFactor(age, halfLife) {
  if (!halfLife || halfLife <= 0) return 1;
  if (!age || age <= 0) return 1;
  return Math.pow(0.5, age / halfLife);
}

export class Profile {
  /**
   * @param {Storage} storage
   * @param {object} profileConfig the site's `profile` block (fields, weights, dims…)
   * @param {function} now
   */
  constructor(storage, profileConfig = {}, now = getTime, trace = null) {
    this.storage = storage;
    this.cfg = mergeProfileConfig(profileConfig);
    this.now = now;
    this.hash = configHash(this.cfg);
    this.trace = trace;
  }

  get data() {
    return this.storage.data;
  }

  // ---- profiles ------------------------------------------------------------

  /** Names of the stored profiles. */
  names() {
    return Object.keys(this.data.profiles || {});
  }

  _ensure(name, decay) {
    const d = this.data;
    d.profiles = d.profiles || {};
    let p = d.profiles[name];
    // A config change (dims, fields, weights, stoplist) invalidates the vector.
    if (
      !p ||
      !Array.isArray(p.v) ||
      p.v.length !== this.cfg.dims ||
      p.cfg !== this.hash
    ) {
      this.trace?.('profile.reset', {
        name,
        reason: !p
          ? 'new profile'
          : !Array.isArray(p.v)
            ? 'invalid stored vector'
            : p.v.length !== this.cfg.dims
              ? 'vector size changed'
              : 'profile configuration changed',
        previousConfig: p?.cfg,
        config: this.hash,
        dims: this.cfg.dims,
      });
      p = d.profiles[name] = {
        v: new Array(this.cfg.dims).fill(0),
        t: this.now(),
        n: 0,
        decay: decay || (p && p.decay) || 0,
        cfg: this.hash,
      };
      this.storage.markDirty();
    }
    if (decay && p.decay !== decay) {
      p.decay = decay;
      this.storage.markDirty();
    }
    return p;
  }

  /**
   * Fold a page vector into a named profile.
   * @param {string} name   profile name from the processor config
   * @param {number} decay  half-life in seconds (from the processor config)
   * @param {Float32Array|number[]} pageVec unit vector
   * @param {number} weight engagement weight (default 1)
   */
  fold(name, decay, pageVec, weight = 1) {
    if (!pageVec || !safeKey(name)) return;
    const p = this._ensure(name, decay);
    const now = this.now();
    const f = decayFactor(now - p.t, p.decay);
    this.trace?.('profile.fold.start', () => ({
      name,
      weight,
      decay: p.decay,
      age: now - p.t,
      decayFactor: f,
      before: p.v,
      pageVector: pageVec,
    }));
    let norm = 0;
    for (let i = 0; i < this.cfg.dims; i++) {
      p.v[i] = p.v[i] * f + weight * pageVec[i];
      norm += p.v[i] * p.v[i];
    }
    norm = Math.sqrt(norm);
    if (norm > CAP)
      for (let i = 0; i < this.cfg.dims; i++) p.v[i] *= CAP / norm;
    p.t = now;
    p.n = (p.n || 0) * f + 1;
    this.storage.markDirty();
    this.trace?.('profile.fold.complete', () => ({
      name,
      weight,
      norm,
      capScale: norm > CAP ? CAP / norm : 1,
      vector: p.v,
      n: p.n,
    }));
  }

  /**
   * The normalised vector of a profile with its confidence (decayed
   * accumulator length clipped to [0, 1]: one clearly-read page ≈ 1).
   * @returns {{v: Float32Array|null, confidence: number, n: number, decay: number}}
   */
  vector(name, trace = this.trace) {
    const p = (this.data.profiles || {})[name];
    if (!p || !Array.isArray(p.v) || p.cfg !== this.hash) {
      trace?.('profile.unavailable', {
        name,
        reason: !p
          ? 'no stored profile'
          : !Array.isArray(p.v)
            ? 'invalid stored vector'
            : 'profile configuration changed',
      });
      return { v: null, confidence: 0, n: 0, decay: p ? p.decay : 0 };
    }
    const f = decayFactor(this.now() - p.t, p.decay);
    const out = new Float32Array(p.v.length);
    let norm = 0;
    for (let i = 0; i < p.v.length; i++) {
      out[i] = p.v[i] * f;
      norm += out[i] * out[i];
    }
    norm = Math.sqrt(norm);
    trace?.('profile.vector', () => ({
      name,
      age: this.now() - p.t,
      decayFactor: f,
      norm,
      confidence: norm < MIN_NORM ? 0 : Math.min(1, norm),
      n: (p.n || 0) * f,
      usable: norm >= MIN_NORM,
      minimumNorm: MIN_NORM,
    }));
    if (norm < MIN_NORM)
      return { v: null, confidence: 0, n: 0, decay: p.decay };
    for (let i = 0; i < out.length; i++) out[i] /= norm;
    return {
      v: out,
      confidence: Math.min(1, norm),
      n: (p.n || 0) * f,
      decay: p.decay,
    };
  }

  // ---- dimensions (plain counters, as v1) -----------------------------------

  dimensionAdd(key, value, amount = 1) {
    this.storage.incSub('dimensions', key, value, amount);
  }

  dimensionSub(key, value, amount = 1) {
    if (!safeKey(key) || !safeKey(value)) return;
    const table = (this.data.dimensions || {})[key];
    if (!table || table[value] === undefined) return;
    table[value] = Math.max(0, (parseFloat(table[value]) || 0) - amount);
    if (table[value] <= 0) delete table[value];
    this.storage.markDirty();
  }

  dimension(key) {
    return Object.assign({}, (this.data.dimensions || {})[key] || {});
  }

  /** Sorted [value, count] pairs. */
  ranked(key) {
    return Object.entries(this.dimension(key)).sort((a, b) => b[1] - a[1]);
  }

  top(key) {
    const r = this.ranked(key);
    return r.length ? r[0][0] : null;
  }

  tops(key, n = 3) {
    return this.ranked(key)
      .slice(0, n)
      .map((e) => e[0]);
  }

  /** Margin between first and second, relative to first. 0 when flat or empty. */
  confidence(key) {
    const r = this.ranked(key);
    if (!r.length || r[0][1] <= 0) return 0;
    const second = r.length > 1 ? r[1][1] : 0;
    return (r[0][1] - second) / r[0][1];
  }

  // ---- seen ----------------------------------------------------------------

  /** Record a viewed item id in a capped ring buffer. */
  markSeen(id, size = 200) {
    if (id === undefined || id === null || id === '') return;
    const now = this.now();
    const key = String(id);
    let seen = Array.isArray(this.data.seen) ? this.data.seen : [];
    seen = seen.filter((e) => e && e.id !== key);
    seen.push({ id: key, t: now });
    while (seen.length > size) seen.shift();
    this.data.seen = seen;
    this.storage.markDirty();
  }

  /** Seconds since `id` was seen, or null. */
  seenAge(id) {
    const key = String(id);
    const seen = Array.isArray(this.data.seen) ? this.data.seen : [];
    for (let i = seen.length - 1; i >= 0; i--)
      if (seen[i] && seen[i].id === key) return this.now() - seen[i].t;
    return null;
  }

  hasSeen(id) {
    return this.seenAge(id) !== null;
  }

  seenCount() {
    return Array.isArray(this.data.seen) ? this.data.seen.length : 0;
  }

  // ---- suppression ---------------------------------------------------------

  /**
   * Add a suppression entry.
   * @param {object} e {scope: 'id'|'campaign'|<field name>, key, mode: 'exclude'|'demote', ttl (s), factor}
   */
  suppress(e) {
    if (!e || !e.scope || e.key === undefined || e.key === null) return;
    const now = this.now();
    const list = (this.data.suppress = Array.isArray(this.data.suppress)
      ? this.data.suppress
      : []);
    const key = String(e.key);
    const mode = e.mode || 'exclude';
    const existing = list.find(
      (s) => s.scope === e.scope && s.key === key && s.mode === mode,
    );
    const entry = {
      scope: e.scope,
      key,
      mode,
      exp: e.ttl ? now + Number(e.ttl) : null,
      factor:
        mode === 'demote'
          ? e.factor !== undefined
            ? Number(e.factor)
            : 0.3
          : 0,
      count: existing ? (existing.count || 0) + 1 : 1,
    };
    if (existing) Object.assign(existing, entry);
    else list.push(entry);
    this.storage.markDirty();
  }

  /** Live suppressions (sweeps expired ones). */
  suppressions() {
    const now = this.now();
    const list = Array.isArray(this.data.suppress) ? this.data.suppress : [];
    const live = list.filter(
      (s) => s && (s.exp === null || s.exp === undefined || s.exp > now),
    );
    if (live.length !== list.length) {
      this.data.suppress = live;
      this.storage.markDirty();
    }
    return live;
  }

  clearSuppression(scope, key) {
    const list = Array.isArray(this.data.suppress) ? this.data.suppress : [];
    this.data.suppress = list.filter(
      (s) =>
        !(s.scope === scope && (key === undefined || s.key === String(key))),
    );
    this.storage.markDirty();
  }
}
