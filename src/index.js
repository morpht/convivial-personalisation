/**
 * @file
 * Convivial Personalisation — client-side visitor profiling and ranking.
 *
 * Copyright Morpht Pty Ltd 2020-2026.
 *
 *   const cp = new ConvivialPersonalisation(config, siteId, options);
 *   cp.collect().then(() => {
 *     const items = cp.rank(rows, ['interests'], 5, { removeSeenItems: true });
 *   });
 *
 * Profiles live in localStorage under `convivial_personalisation`. Optional
 * event methods add records to the local data layer; the site analytics
 * integration controls their delivery.
 *
 * Set config.debug = true before construction to trace the initial collection.
 * options.debug overrides config.debug (including false). At runtime use
 * window.convivialPersonalisation.debug = true / false. Enable the browser console's
 * Verbose level and filter on [convivial-personalisation]. Logs are local snapshots;
 * logging is off by default and is never persisted or sent to analytics.
 * Each line explains its decision with run/step numbers and, for ranking,
 * block/call identifiers. Expand the attached snapshot for the stable event
 * name, exact inputs, thresholds, vectors and scores behind the explanation.
 *
 * collect.start reports profiler execution weights (config.order = 'weight').
 * vector.token reports field weights and signed term-frequency contributions.
 * profile.fold.* reports engagement weights and decay. rank.score reports
 * similarity/prior weights, demotion and the final score.
 *
 * Temporary values are persisted as temp.<key> scalars. Legacy config/API
 * paths temp.<key>.value retain the original value type for this page,
 * including arrays for stringify destinations and indexed reads. Old plugins
 * can continue writing { value: ... } via _setValue(). Scripts parsing the
 * localStorage blob directly must use the flat format.
 */

import * as sources from './modules/source';
import * as processors from './modules/processor';
import * as destinations from './modules/destination';
import { pageItem } from './modules/processor';
import { Storage, SCHEMA } from './lib/storage';
import { Profile, decayFactor } from './lib/profile';
import { rank as rankItems, DEFAULT_RANK_OPTIONS } from './lib/rank';
import {
  vectorOf,
  cosine,
  encode,
  decode,
  mergeProfileConfig,
  configHash,
  isExcluded,
  crc32,
  DEFAULT_PROFILE_CONFIG,
} from './lib/vector';
import { tokenize } from './lib/text';
import { expiry, isExpired } from './lib/expiry';
import {
  getTime,
  getCookie,
  setCookie,
  isLocalStorageAvailable,
  getPath,
  debug,
  explainTrace,
  warn,
} from './lib/utility';

export const VERSION = '0.0.1';
const CONSENT_KEY = 'convivial_personalisation_consent';

export const DEFAULT_PRIVACY = {
  consent_default: 'granted', // 'granted' (opt-out model) | 'denied' (opt-in model)
  respect_gpc: true, // Global Privacy Control → personalisation off
  cookies: false, // publish to cookies only when explicitly enabled
  cookie_days: 365,
};

export const DEFAULT_ANALYTICS = {
  events: true, // push block impression/click events to the dataLayer
  datalayer: 'dataLayer',
};

const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);

export class ConvivialPersonalisation {
  /**
   * @param {object} config  { profilers, profile, privacy, analytics, order, debug }
   * @param {string} siteId
   * @param {object} options { now: fn, persist: bool, debug: bool } — a string
   *                         here (the v1 licenseKey) is ignored.
   */
  constructor(config, siteId, options) {
    this.version = VERSION;
    this.schema = SCHEMA;
    this.config = config || {};
    this.siteId = siteId || 'default';
    const opts = isObj(options) ? options : {};
    this.persist = opts.persist !== false;
    this.now = typeof opts.now === 'function' ? opts.now : getTime;
    this.debug = (opts.debug ?? this.config.debug) === true;

    this.privacy = Object.assign(
      {},
      DEFAULT_PRIVACY,
      this.config.privacy || {},
    );
    this.analytics = Object.assign(
      {},
      DEFAULT_ANALYTICS,
      this.config.analytics || {},
    );
    this.profileConfig = mergeProfileConfig(this.config.profile || {});

    this.sources = Object.assign({}, sources);
    this.processors = Object.assign({}, processors);
    // Compatibility registry for processor overrides in profiler pipelines.
    this.profilerProcessor = {};
    this.destinations = Object.assign({}, destinations);

    this.available = isLocalStorageAvailable();
    this.consentState = this._readConsent();
    this.storage = new Storage(this.siteId, {
      persist: opts.persist !== false && this.personalised,
      now: this.now,
    });
    this.profile = new Profile(
      this.storage,
      this.profileConfig,
      this.now,
      (event, details) => this.trace(event, details),
    );

    this.memory = {}; // published keys when not persisting
    this.page = null; // { item, vector, excluded } built on first `profile` processor
    this._folds = [];
    this._blocks = {};
    this._generation = 0;
    this.ready = Promise.resolve();
    this.collected = false;
    if (!this.personalised) this.erase();

    if (typeof window !== 'undefined') {
      window.convivialPersonalisation = this;
    }
    this.trace('engine.init', {
      version: this.version,
      consent: this.consentState,
      persist: this.storage.persist,
      profile: this.profileConfig,
    });
  }

  /** Local, opt-in diagnostic snapshots. Factories avoid work when debug is off. */
  trace(event, details = {}) {
    if (!this.debug) return;
    try {
      const data = typeof details === 'function' ? details() : details;
      const snapshot = JSON.parse(
        JSON.stringify(
          {
            site: this.siteId,
            generation: this._generation,
            at: this.now(),
            ...data,
          },
          (key, value) => {
            if (ArrayBuffer.isView(value)) return Array.from(value);
            if (value instanceof Error)
              return { name: value.name, message: value.message };
            return value;
          },
        ),
      );
      snapshot.event = event;
      snapshot.sequence = this._traceSequence = (this._traceSequence || 0) + 1;
      snapshot.message = explainTrace(event, snapshot);
      const context =
        `Run ${snapshot.generation}, step ${snapshot.sequence}` +
        (snapshot.block
          ? `, block "${snapshot.block}", ranking ${snapshot.ranking}`
          : '');
      debug(`${context}: ${snapshot.message}`, snapshot);
    } catch (error) {
      // Diagnostics must never interrupt collection or ranking.
    }
  }

  // ---- plugins -------------------------------------------------------------

  /** Register a plugin: use({ sources:{name:fn}, processors:{...}, destinations:{...} }). */
  use(plugin) {
    if (!plugin) return this;
    ['sources', 'processors', 'destinations'].forEach((kind) => {
      Object.keys(plugin[kind] || {}).forEach((name) => {
        this[kind][name] = plugin[kind][name];
      });
    });
    return this;
  }

  // ---- consent -------------------------------------------------------------

  _readConsent() {
    if (
      this.privacy.respect_gpc &&
      typeof navigator !== 'undefined' &&
      navigator.globalPrivacyControl === true
    )
      return 'gpc';
    if (this.available) {
      try {
        const v = localStorage.getItem(CONSENT_KEY);
        if (v === 'granted' || v === 'denied') return v;
      } catch (e) {
        /* ignore */
      }
    }
    return this.privacy.consent_default === 'denied' ? 'denied' : 'granted';
  }

  /** True when the profile may be stored and used. */
  get personalised() {
    return this.consentState === 'granted';
  }

  /**
   * Set consent: 'granted' | 'denied'. Denied erases the stored profile and
   * every published key; the engine keeps working in memory for this page.
   */
  consent(state) {
    if (state !== 'granted' && state !== 'denied') return this.consentState;
    if (
      this.privacy.respect_gpc &&
      typeof navigator !== 'undefined' &&
      navigator.globalPrivacyControl === true
    ) {
      this.consentState = 'gpc';
      this.erase();
      this.storage.setPersist(false);
      this.trace('consent.changed', {
        state: this.consentState,
        persist: false,
      });
      return this.consentState;
    }
    this.consentState = state;
    if (this.available) {
      try {
        localStorage.setItem(CONSENT_KEY, state);
      } catch (e) {
        /* ignore */
      }
    }
    if (state === 'denied') {
      this.erase();
      this.storage.setPersist(false);
    } else {
      this.storage.setPersist(this.persist);
    }
    this.trace('consent.changed', {
      state: this.consentState,
      persist: this.storage.persist,
    });
    return this.consentState;
  }

  /** Remove everything this engine stored for the visitor (profile, published keys, cookies). */
  erase() {
    this._generation++;
    this._folds = [];
    this._blocks = {};
    const persisted = this.storage.publishedKeys();
    const keys = new Set([
      ...persisted,
      ...Object.keys(this._publishedIndex()),
    ]);
    keys.forEach((k) =>
      this.unpublish(k, { localstorage: true, cookie: true }),
    );
    this.storage.erase();
    this.profile = new Profile(
      this.storage,
      this.profileConfig,
      this.now,
      (event, details) => this.trace(event, details),
    );
    this.memory = {};
    this.page = null;
    this.trace('engine.erased');
  }

  // ---- collect -------------------------------------------------------------

  /**
   * Run every profiler: sources → processors → destinations, in the order
   * given (or by weight with config.order = 'weight'). Returns a promise that
   * resolves when async sources (e.g. `get`) have completed.
   */
  collect() {
    this.fold();
    const generation = ++this._generation;
    const now = this.now();
    this._sweep(now);
    this.storage.clearTemp();
    this.page = null;
    const profilers = this.config.profilers || {};
    let names = Object.keys(profilers)
      .map((name) => Object.assign({ name }, profilers[name]))
      .filter((p) => p.status !== false && p.status !== 0 && p.status !== '0');
    const byWeight = names
      .slice()
      .sort(
        (a, b) => (parseFloat(a.weight) || 0) - (parseFloat(b.weight) || 0),
      );
    if (this.config.order === 'weight') names = byWeight;
    else if (this.debug && byWeight.some((p, i) => p !== names[i])) {
      this.trace('collect.order', {
        reason:
          'Weights disagree with authored order; set config.order = "weight" to sort by weight.',
      });
    }
    this.trace('collect.start', () => ({
      order: this.config.order === 'weight' ? 'weight' : 'authored',
      profilers: names.map(({ name, weight }) => ({
        name,
        weight: parseFloat(weight) || 0,
      })),
      disabled: Object.keys(profilers).filter((name) =>
        [false, 0, '0'].includes(profilers[name].status),
      ),
    }));

    const run = async () => {
      for (const profiler of names) {
        if (generation !== this._generation) {
          this.trace('collect.cancelled', { cancelledGeneration: generation });
          return;
        }
        const pending = this._collectProfiler(profiler, now, generation);
        if (pending) await pending;
      }
    };

    this.ready = run().then(() => {
      if (generation !== this._generation) return this;
      this.collected = true;
      this.storage.markDirty();
      this.trace('collect.complete', () => ({
        temp: this.storage.data.temp,
        queuedFolds: this._folds.length,
      }));
      // Fold the current page after the page's blocks have had a chance to rank.
      const later =
        typeof setTimeout === 'function'
          ? (fn) => setTimeout(fn, 0)
          : (fn) => fn();
      later(() => {
        if (generation === this._generation) this.fold();
      });
      return this;
    });
    return this.ready;
  }

  _collectProfiler(profiler, now, generation) {
    if (profiler.deferred) {
      const current = this.storage.get('fetchers.' + profiler.name);
      if (current && current.expire != null && Number(current.expire) > now) {
        this.trace('profiler.skipped', {
          profiler: profiler.name,
          reason: 'deferred cache is fresh',
          expire: current.expire,
        });
        return;
      }
    }
    this.trace('profiler.start', { profiler: profiler.name });
    const values = [];
    const waits = [];
    (profiler.sources || []).forEach((source) => {
      const fn = this.sources[source.type];
      if (typeof fn !== 'function') {
        this.trace('source.skipped', {
          profiler: profiler.name,
          type: source.type,
          reason: 'unknown source',
        });
        return;
      }
      try {
        this.trace('source.start', { profiler: profiler.name, source });
        const result = fn(this, profiler, source, values);
        const complete = () =>
          this.trace('source.complete', {
            profiler: profiler.name,
            type: source.type,
            source,
            accumulatedValues: values,
            stale: generation !== this._generation,
          });
        if (result && typeof result.then === 'function') {
          waits.push(
            Promise.resolve(result)
              .then(complete)
              .catch((error) => {
                this.trace('source.error', {
                  profiler: profiler.name,
                  type: source.type,
                  error,
                });
                warn('Source "' + source.type + '" failed:', error);
              }),
          );
        } else complete();
      } catch (error) {
        this.trace('source.error', {
          profiler: profiler.name,
          type: source.type,
          error,
        });
        warn('Source "' + source.type + '" failed:', error);
      }
    });
    const finish = () => {
      this.trace('profiler.sources.complete', {
        profiler: profiler.name,
        values,
        stale: generation !== this._generation,
      });
      ['processors', 'destinations'].forEach((kind) => {
        (profiler[kind] || []).forEach((plugin) => {
          if (generation === this._generation) {
            this._run(kind, profiler, plugin, values);
          }
        });
      });
      this.trace('profiler.complete', { profiler: profiler.name });
    };
    if (waits.length) return Promise.all(waits).then(finish);
    finish();
  }

  _run(kind, profiler, plugin, values) {
    const legacyProcessor =
      kind === 'processors' && this.profilerProcessor[plugin.type];
    const fn = this[kind][plugin.type];
    if (!legacyProcessor && !fn)
      return this.trace('plugin.skipped', {
        profiler: profiler.name,
        kind,
        type: plugin.type,
        plugin,
        reason: 'unknown plugin',
      });
    try {
      this.trace('plugin.start', {
        profiler: profiler.name,
        kind,
        plugin,
        values,
      });
      if (legacyProcessor) {
        legacyProcessor.call(this, profiler, plugin, values);
      } else {
        fn(this, profiler, plugin, values);
      }
      this.storage.normalizeTemp();
      this.trace('plugin.complete', () => ({
        profiler: profiler.name,
        kind,
        type: plugin.type,
        storageKey: plugin.storage_key,
        values,
        stored: Object.fromEntries(
          [
            'temp',
            'store',
            'fetchers',
            'dimensions',
            'counters',
            'accumulators',
            'log',
          ].map((bucket) => [
            bucket,
            this.storage.get([bucket, plugin.storage_key]),
          ]),
        ),
      }));
    } catch (e) {
      this.trace('plugin.error', {
        profiler: profiler.name,
        kind,
        type: plugin.type,
        error: e,
      });
      warn(
        kind.slice(0, -1) +
          ' "' +
          plugin.type +
          '" in "' +
          profiler.name +
          '" threw:',
        e,
      );
    }
  }

  /** Remove expired store/fetcher entries. */
  _sweep(now) {
    ['store', 'fetchers'].forEach((bucket) => {
      const table = this.storage.data[bucket] || {};
      Object.keys(table).forEach((k) => {
        if (isExpired(table[k], now)) {
          this.trace('storage.expired', {
            bucket,
            key: k,
            expire: table[k].expire,
          });
          delete table[k];
          this.storage.markDirty();
        }
      });
    });
  }

  /** Queue work to run once the page is folded into the profiles. */
  deferFold(fn) {
    this._folds.push(fn);
  }

  /** Apply queued folds and mark the page as seen. Safe to call more than once. */
  fold() {
    const folds = this._folds;
    this._folds = [];
    if (!folds.length) return;
    if (!this.personalised) {
      this.trace('fold.skipped', {
        reason: 'consent',
        consent: this.consentState,
        count: folds.length,
      });
      return;
    }
    this.trace('fold.start', { count: folds.length });
    folds.forEach((fn) => {
      try {
        fn();
      } catch (e) {
        this.trace('fold.error', { error: e });
        warn('fold failed:', e);
      }
    });
    if (
      this.page &&
      !this.page.excluded &&
      this.page.item &&
      this.page.item.id !== undefined
    )
      this.profile.markSeen(this.page.item.id);
    const persisted = this.storage.flush();
    this.trace('fold.complete', () => ({
      persisted,
      seen: this.storage.data.seen,
    }));
  }

  /** The current page as the profile builder sees it (null before collect()). */
  currentItem() {
    return this.page ? this.page.item : pageItem(this);
  }

  // ---- publishing ----------------------------------------------------------

  _publishedIndex() {
    return (this.storage.data.meta && this.storage.data.meta.published) || {};
  }

  _setPublishedIndex(idx) {
    this.storage.data.meta = this.storage.data.meta || {};
    this.storage.data.meta.published = idx;
    this.storage.markDirty();
  }

  /**
   * Write a flat key for consumers. Cookies require `privacy.cookies: true`.
   * Without consent the key is kept in memory for this page only.
   */
  publish(key, value, where = { localstorage: true }) {
    if (key === undefined || key === null || key === '') return;
    const k = String(key);
    const v = value === undefined || value === null ? '' : String(value);
    let savedLocal = false;
    if (where.localstorage !== false) {
      if (this.personalised && this.storage.persist) {
        try {
          localStorage.setItem(k, v);
          savedLocal = true;
        } catch (e) {
          /* ignore */
        }
        const idx = this._publishedIndex();
        if (!idx[k]) {
          idx[k] = 1;
          this._setPublishedIndex(idx);
        }
      }
      this.memory[k] = v;
    }
    if (
      where.cookie &&
      this.privacy.cookies &&
      this.personalised &&
      this.persist
    ) {
      setCookie(k, v, this.privacy.cookie_days);
      const idx = this._publishedIndex();
      if (!idx[k]) {
        idx[k] = 1;
        this._setPublishedIndex(idx);
      }
    }
    this.trace('publish', {
      key: k,
      value: v,
      targets: where,
      persist: this.storage.persist,
      personalised: this.personalised,
      savedLocal,
      memory: where.localstorage !== false,
      cookieAllowed: !!(
        where.cookie &&
        this.privacy.cookies &&
        this.personalised &&
        this.persist
      ),
    });
  }

  unpublish(key, where = { localstorage: true }) {
    const k = String(key);
    if (where.localstorage !== false) delete this.memory[k];
    if (where.localstorage !== false && this.available) {
      try {
        localStorage.removeItem(k);
      } catch (e) {
        /* ignore */
      }
      const idx = this._publishedIndex();
      if (idx[k]) {
        delete idx[k];
        this._setPublishedIndex(idx);
      }
    }
    if (
      where.cookie &&
      typeof document !== 'undefined' &&
      getCookie(k) !== null
    )
      setCookie(k, '', -1);
  }

  /** Read a published key (memory first, then localStorage). */
  published(key) {
    const k = String(key);
    if (k in this.memory) return this.memory[k];
    if (!this.available || !this.personalised || !this.persist) return null;
    try {
      return localStorage.getItem(k);
    } catch (e) {
      return null;
    }
  }

  pushEvent(payload) {
    if (
      typeof window === 'undefined' ||
      !this.analytics.events ||
      !this.personalised
    )
      return;
    const name = this.analytics.datalayer || 'dataLayer';
    window[name] = window[name] || [];
    window[name].push(payload);
  }

  // ---- ranking -------------------------------------------------------------

  /**
   * Rank the rows of a JSON view against the visitor's profiles.
   * priorityWeight controls prior priority: 0 = similarity, 1 = prior only.
   * The legacy option p remains supported; priorityWeight takes precedence.
   *
   * @param {object[]} items          rows (mutated: score, sim, profile, pos, why)
   * @param {string[]|object} profiles configured names or slot counts;
   *   defaults to [] (fallback only)
   * @param {number} count            items to return
   * @param {object} options          { removeSeenItems: true, block: 'name', ...DEFAULT_RANK_OPTIONS }
   * @returns {object[]} ranked, truncated items
   */
  rank(items, profiles = [], count = 5, options = {}) {
    profiles ??= [];
    const opts = Object.assign({}, options || {});
    const block = opts.block || 'default';
    const variant = this.variant(block);
    const personalised = this.personalised && variant !== 'control';
    const ranking = this.debug
      ? (this._rankingSequence = (this._rankingSequence || 0) + 1)
      : 0;
    const trace = this.debug
      ? (event, details) =>
          this.trace(event, () => ({
            block,
            ranking,
            ...(typeof details === 'function' ? details() : details),
          }))
      : null;
    trace?.('rank.start', {
      profiles,
      count,
      personalised,
      consent: this.consentState,
      variant,
    });
    const names = Array.isArray(profiles) ? profiles : Object.keys(profiles);
    const vectors = {};
    if (personalised)
      names.forEach((name) => {
        vectors[name] = this.profile.vector(name, trace);
      });
    const current = this.currentItem();
    const ctx = {
      cfg: this.profileConfig,
      now: this.now(),
      vectors,
      currentId: current && current.id !== undefined ? current.id : undefined,
      suppressions: personalised ? this.profile.suppressions() : [],
      seenAge: (id) => (personalised ? this.profile.seenAge(id) : null),
      interests: personalised ? this._interests() : {},
      trace,
    };
    const out = rankItems(items, profiles, count, opts, ctx);
    this._blocks[block] = {
      variant,
      items: out,
      profiles: names,
      count,
      at: this.now(),
    };
    return out;
  }

  /** Top dimension values per key field, for `why` labels. */
  _interests() {
    const out = {};
    Object.keys(this.profileConfig.fields).forEach((f) => {
      if (this.profileConfig.text_fields.indexOf(f) > -1) return;
      let tops = this.profile.tops(f, 3);
      // Existing destinations still use dimensions without the field prefix.
      if (!tops.length && f.startsWith('profile_')) {
        tops = this.profile.tops(f.slice('profile_'.length), 3);
      }
      if (tops.length) out[f] = tops;
    });
    return out;
  }

  /** No visitor identifiers or persistent experiment assignment. */
  variant() {
    return 'personalised';
  }

  /** Record a block impression (dataLayer event `cp.block_impression`). */
  impression(block, items) {
    const b = this._blocks[block] || {};
    const list = items || b.items || [];
    if (!this.analytics.events) return;
    this.pushEvent({
      event: 'cp.block_impression',
      cp_block: block,
      cp_variant: b.variant || this.variant(block),
      cp_profiles: list.map((i) => i.profile).join(','),
      cp_items: list.map((i) => i.id).join(','),
      cp_count: list.length,
    });
  }

  /** Record a click on a ranked item. */
  click(block, item, position) {
    const b = this._blocks[block] || {};
    if (!this.analytics.events) return;
    this.pushEvent({
      event: 'cp.block_click',
      cp_block: block,
      cp_variant: b.variant || this.variant(block),
      cp_item: item && item.id,
      cp_profile: item && item.profile,
      cp_position: position !== undefined ? position : item && item.pos,
      cp_sim:
        item && item.sim !== null && item.sim !== undefined
          ? Number(item.sim).toFixed(3)
          : undefined,
    });
  }

  // ---- introspection -------------------------------------------------------

  /** A copy of the profile for the visitor (transparency / debugging). Nothing leaves the device. */
  snapshot() {
    const profiles = {};
    this.profile.names().forEach((name) => {
      const v = this.profile.vector(name);
      profiles[name] = { confidence: v.confidence, n: v.n, decay: v.decay };
    });
    const dims = {};
    Object.keys(this.storage.data.dimensions || {}).forEach((d) => {
      dims[d] = this.profile.ranked(d);
    });
    return {
      version: this.version,
      schema: this.schema,
      site: this.siteId,
      consent: this.consentState,
      personalised: this.personalised,
      profiles,
      config: this.profile.hash,
      page: this.page
        ? { item: this.page.item, excluded: this.page.excluded }
        : null,
      dimensions: dims,
      seen: this.profile.seenCount(),
      suppressions: this.profile.suppressions(),
      store: Object.assign({}, this.storage.data.store),
      counters: Object.assign({}, this.storage.data.counters),
      published: Object.keys(this._publishedIndex()),
      blocks: Object.keys(this._blocks).map((k) => ({
        block: k,
        variant: this._blocks[k].variant,
        profiles: this._blocks[k].profiles,
        items: this._blocks[k].items.map((i) => ({
          id: i.id,
          profile: i.profile,
          score: i.score,
        })),
      })),
    };
  }

  // ---- legacy accessors (v1 plugins) ----------------------------------------

  _getValue(path) {
    return this.storage.get(path);
  }
  _getConfig(path) {
    return getPath(this.config, path);
  }
  _setValue(type, key, value) {
    this.storage.set(type, key, value);
  }
  _deleteValue(type, key) {
    this.storage.del(type, key);
  }
  _increaseValue(type, key, inc) {
    this.storage.inc(type, key, inc);
  }
  _increaseSubValue(type, key, sub, inc) {
    this.storage.incSub(type, key, sub, inc);
  }
  _logValue(type, value, size) {
    this.storage.log(type, value, size);
  }
}

// Helpers exposed for builds, tests and tooling.
ConvivialPersonalisation.VERSION = VERSION;
ConvivialPersonalisation.vector = {
  vectorOf,
  cosine,
  encode,
  decode,
  crc32,
  tokenize,
  isExcluded,
  mergeProfileConfig,
  configHash,
  DEFAULT_PROFILE_CONFIG,
};
ConvivialPersonalisation.rank = rankItems;
ConvivialPersonalisation.DEFAULT_RANK_OPTIONS = DEFAULT_RANK_OPTIONS;
ConvivialPersonalisation.expiry = expiry;
ConvivialPersonalisation.decayFactor = decayFactor;

export default ConvivialPersonalisation;
