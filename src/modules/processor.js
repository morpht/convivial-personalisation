/**
 * @file
 * Processor plugins: (engine, profiler, processor, values) → void.
 *
 * Processors write to the profile (engine.storage / engine.profile).
 */

import { expiry } from '../lib/expiry';
import { vectorOf, isExcluded, valuesOf } from '../lib/vector';

export function accumulation(engine, profiler, processor, values) {
  values.forEach((value) =>
    engine.storage.inc('accumulators', processor.storage_key, value),
  );
}

/** Plain interest counter per value, optionally normalised across the input. */
export function dimension(engine, profiler, processor, values) {
  const list = valuesOf(values);
  const amount = processor.normalize && list.length ? 1 / list.length : 1;
  engine.trace('dimension.values', {
    key: processor.storage_key,
    input: values,
    values: list,
    amount,
    normalize: !!processor.normalize,
  });
  list.forEach((value) => {
    if (
      value === undefined ||
      value === null ||
      value === '' ||
      typeof value === 'object'
    )
      return;
    // Values are machine names (keys); labels are a presentation lookup.
    engine.profile.dimensionAdd(
      processor.storage_key,
      String(value).trim(),
      amount,
    );
  });
}

/**
 * Async fetcher result with a TTL. Writes under the profiler's name so the
 * `deferred` check in collect() finds it (fixes D10); the storage_key is
 * kept as an alias for existing destinations.
 */
export function language_full(engine, profiler, processor, values) {
  const expire = expiry(processor.ttl, engine.now()); // D5: no longer inverted
  values.forEach((value) =>
    engine.storage.set('store', processor.storage_key, {
      value: String(value).toLowerCase(),
      expire,
    }),
  );
}

export function language_simple(engine, profiler, processor, values) {
  const expire = expiry(processor.ttl, engine.now());
  values.forEach((value) =>
    engine.storage.set('store', processor.storage_key, {
      value: String(value).split('-')[0].toLowerCase(),
      expire,
    }),
  );
}

export function logger(engine, profiler, processor, values) {
  values.forEach((value) => {
    if (value === undefined || value === null || value === '') return;
    engine.storage.log(processor.storage_key, value, processor.size);
  });
}

/** Exact-prefix mapping (fixes D6: "a" no longer matches "ba|x"). */
export function map(engine, profiler, processor, values) {
  const now = engine.now();
  const first = values.length ? values[0] : undefined;
  if (
    first === undefined ||
    first === null ||
    first === '' ||
    !processor.mappings ||
    !processor.mappings.length
  ) {
    engine.storage.set('store', processor.storage_key, {
      value: processor.default_value,
      expire: now,
    });
    return;
  }
  const needle = String(first) + '|';
  const match = processor.mappings.find((m) => String(m).startsWith(needle));
  engine.storage.set('store', processor.storage_key, {
    value:
      match !== undefined
        ? String(match).slice(needle.length)
        : processor.fallback_value,
    expire: now,
  });
}

export function pageview(engine, profiler, processor, values) {
  const url = typeof location !== 'undefined' ? location.href : '';
  if (processor.log === true)
    engine.storage.log(processor.storage_key, url, processor.size);
  if (processor.track === true)
    engine.storage.inc('counters', processor.storage_key);
}

/** Fixes D2: logs the query string itself, never an object. */
export function searchquery(engine, profiler, processor, values) {
  if (typeof location === 'undefined') return;
  if (
    !processor.search_path ||
    location.pathname.indexOf(processor.search_path) === -1
  )
    return;
  const params = new URLSearchParams(location.search);
  if (
    !params.has(processor.query_param) ||
    (processor.exclude_param && params.has(processor.exclude_param))
  )
    return;
  // The query text itself is never stored: only the fact that a search ran.
  // A log written by an earlier version is dropped the first time this runs.
  engine.storage.del('log', processor.storage_key);
  const q = (params.get(processor.query_param) || '').trim();
  if (!q) return;
  if (processor.track === true)
    engine.storage.inc('counters', processor.storage_key);
}

export function store(engine, profiler, processor, values) {
  const expire = expiry(processor.ttl, engine.now()); // D11: one semantics
  values.forEach((value) =>
    engine.storage.set('store', processor.storage_key, { value, expire }),
  );
}

/** Store source lists as a comma-separated string, including single values. */
export function store_list(engine, profiler, processor, values) {
  const list = valuesOf(values);
  if (list.length) {
    // Preserve the legacy list processor: a ttl of -1 stores for a year.
    const ttl = processor.ttl === -1 ? 365 * 24 * 3600 : processor.ttl;
    engine.storage.set('store', processor.storage_key, {
      value: list.join(','),
      expire: engine.now() + ttl,
    });
  }
  engine.trace('list.processed', () => ({
    profiler: profiler.name,
    processor: 'store_list',
    bucket: 'store',
    key: processor.storage_key,
    input: values,
    items: list,
    stored: engine.storage.get(['store', processor.storage_key]),
  }));
}

/** Keep source lists in page-scoped memory as a comma-separated string. */
export function temp_list(engine, profiler, processor, values) {
  const list = valuesOf(values);
  if (list.length) engine.storage.set('temp', processor.storage_key, list);
  engine.trace('list.processed', () => ({
    profiler: profiler.name,
    processor: 'temp_list',
    bucket: 'temp',
    key: processor.storage_key,
    input: values,
    items: list,
    stored: engine.storage.get(['temp', processor.storage_key]),
  }));
}

export function unstore_value(engine, profiler, processor, values) {
  values.forEach((value) => {
    const current = engine.storage.get(
      'store.' + processor.unstore_key + '.value',
    );
    if (String(value) === String(current)) {
      engine.storage.del('store', processor.unstore_key);
      engine.storage.set(
        'temp',
        processor.storage_key,
        processor.storage_value,
      );
    }
  });
}

/**
 * Page-scoped values stored directly at temp.<key>. Multiple values become
 * a comma-separated string at the storage boundary, including legacy writes.
 */
export function temp(engine, profiler, processor, values) {
  const list = values.filter((v) => v !== undefined && v !== null && v !== '');
  if (!list.length) return;
  engine.storage.set(
    'temp',
    processor.storage_key,
    list.length === 1 ? list[0] : list,
  );
}

/**
 * Build the current page's item from page storage: for every field named in
 * the site's `profile.fields`, read the flat value at `temp.<field>`.
 * The id comes from `temp.<id_field>` (default `nid`).
 */
export function pageItem(engine) {
  engine.storage.normalizeTemp();
  const temp = engine.storage.data.temp || {};
  const cfg = engine.profileConfig;
  const item = {};
  let has = false;
  Object.keys(cfg.fields).forEach((field) => {
    const value = temp[field];
    if (value === undefined || value === null || value === '') return;
    item[field] = value;
    has = true;
  });
  const id = valuesOf(temp[cfg.id_field] ?? temp.id ?? temp.nid)[0];
  if (id !== undefined) item.id = String(id);
  if ([1, '1', 'true', true].includes(temp.exclude)) item.exclude = true;
  return has || item.id !== undefined ? item : null;
}

/**
 * Fold the current page into a named profile.
 *
 * Config: storage_key (configured profile name), decay (half-life in
 * seconds), weight (engagement weight, default 1).
 *
 * The page item is built once per collect() from `temp` (see pageItem) and
 * hashed with the global `profile` config; each `profile` processor folds
 * that vector into its own accumulator with its own decay. The fold is
 * deferred until the page's blocks have ranked, so recommendations are not
 * biased towards "this page again". The page id is added to the seen buffer
 * once, by the engine, after the folds.
 */
export function profile(engine, profiler, processor, values) {
  const name = processor.storage_key || processor.name;
  const decay = Number(processor.decay) || 0;
  if (!name) return;
  if (!engine.page) {
    const item = pageItem(engine);
    if (!item) {
      engine.trace('page.skipped', { reason: 'no configured metadata' });
      return;
    }
    const excluded = isExcluded(
      item,
      engine.profileConfig,
      engine.debug ? (event, details) => engine.trace(event, details) : null,
    );
    engine.trace('page.item', { item, excluded, config: engine.profileConfig });
    engine.page = {
      item,
      vector: excluded
        ? null
        : vectorOf(
            item,
            engine.profileConfig,
            engine.debug
              ? (event, details) => engine.trace(event, details)
              : null,
          ),
      excluded,
    };
  }
  const page = engine.page;
  engine.trace('profile.queued', {
    name,
    decay,
    weight: processor.weight !== undefined ? Number(processor.weight) : 1,
    hasVector: !!page.vector,
    excluded: page.excluded,
  });
  engine.deferFold(() => {
    if (page.vector)
      engine.profile.fold(
        name,
        decay,
        page.vector,
        processor.weight !== undefined ? Number(processor.weight) : 1,
      );
  });
}

/**
 * Write suppression entries from values (e.g. a goal or satisfied intent).
 * Config: scope ('nid'|'intent'|'campaign'|'topic'|'term'), mode
 * ('exclude'|'demote'), ttl (seconds), factor, and optionally
 * dimension_sub: subtract `amount` from that dimension's value.
 */
export function suppress(engine, profiler, processor, values) {
  values.forEach((value) => {
    if (
      value === undefined ||
      value === null ||
      value === '' ||
      typeof value === 'object'
    )
      return;
    engine.profile.suppress({
      scope: processor.scope || 'nid',
      key: value,
      mode: processor.mode || 'exclude',
      ttl: processor.ttl,
      factor: processor.factor,
    });
    if (processor.dimension_sub)
      engine.profile.dimensionSub(
        processor.dimension_sub,
        String(value),
        processor.amount !== undefined ? Number(processor.amount) : 1,
      );
  });
}

/**
 * Advance a stage after a goal: sets the named stage value in the stage
 * dimension. Config: dimension (default 'stage'), value, amount.
 */
export function advance(engine, profiler, processor, values) {
  if (!values.length || !processor.value) return;
  engine.profile.dimensionAdd(
    processor.dimension || 'stage',
    String(processor.value),
    processor.amount !== undefined ? Number(processor.amount) : 1,
  );
}
