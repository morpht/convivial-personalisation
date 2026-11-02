/**
 * @file
 * Hashed content vectors (feature hashing / "the hashing trick").
 *
 * An item (the current page, or a candidate row from a JSON view) becomes a
 * D-slot vector: every token is sent to a slot by crc32(token) mod D with a
 * sign from another bit of the hash, weighted by field and by 1+log(tf), then
 * L2-normalised. No vocabulary, no training, no model, no server: the same
 * function runs on the page (from the values the profilers put in `temp`)
 * and on each candidate row.
 *
 * Which fields are hashed, and their weights, is the site's `profile` config:
 *
 *   profile: {
 *     fields: { profile_title: 3, profile_description: 2, profile_topic: 4, profile_audience: 4, profile_intent: 4, profile_stage: 2, profile_type: 2 },
 *     text_fields: ['profile_title', 'profile_description', 'profile_summary', 'profile_headings', 'profile_body'],
 *     dims: 256, stopwords: [], synonyms: {}, keep_short: [], bigrams: true,
 *     id_field: 'nid',
 *     exclude: { types: [], terms: [], fields: [] },
 *   }
 *
 * Text fields are tokenised (stemmed words + bigrams). Every other field is a
 * key field: each value becomes the structural token `<field>.<value>`; a
 * value written as `id|Label` also contributes the label's words as text.
 * Key fields accept comma-separated strings or legacy arrays. Commas delimit
 * terms; spaces within a term stay intact. Text fields keep their full text
 * for tokenisation, including bigrams across punctuation.
 */

import { tokenize } from './text';

export const VECTOR_VERSION = 3;

export const DEFAULT_PROFILE_CONFIG = {
  version: VECTOR_VERSION,
  dims: 256,
  fields: {
    profile_title: 3,
    profile_description: 2,
    profile_topic: 4,
    profile_audience: 4,
    profile_intent: 4,
    profile_stage: 2,
    profile_type: 2,
  },
  text_fields: [
    'profile_title',
    'profile_description',
    'profile_summary',
    'profile_headings',
    'profile_body',
  ],
  text_cap: 300,
  id_field: 'nid',
  stopwords: [],
  synonyms: {},
  keep_short: [],
  bigrams: true,
  exclude: { types: [], terms: [], fields: [] },
};

// ---- crc32 -----------------------------------------------------------------

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

/** crc32 of a string, unsigned 32-bit. Byte-compatible with PHP's crc32(). */
export function crc32(str) {
  let crc = 0xffffffff;
  const s = unescape(encodeURIComponent(String(str)));
  for (let i = 0; i < s.length; i++)
    crc = CRC_TABLE[(crc ^ s.charCodeAt(i)) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

// ---- config ----------------------------------------------------------------

export function mergeProfileConfig(cfg = {}) {
  const out = Object.assign({}, DEFAULT_PROFILE_CONFIG, cfg || {});
  out.fields = Object.assign(
    {},
    cfg && cfg.fields ? cfg.fields : DEFAULT_PROFILE_CONFIG.fields,
  );
  out.text_fields = [].concat(
    cfg && cfg.text_fields
      ? cfg.text_fields
      : DEFAULT_PROFILE_CONFIG.text_fields,
  );
  out.exclude = Object.assign(
    { types: [], terms: [], fields: [] },
    (cfg && cfg.exclude) || {},
  );
  out.synonyms = Object.assign({}, (cfg && cfg.synonyms) || {});
  out.stopwords = [].concat(
    (cfg && (cfg.stopwords || cfg.stopwords_site)) || [],
  );
  out.keep_short = [].concat((cfg && cfg.keep_short) || []);
  out.dims = Math.max(16, parseInt(out.dims, 10) || 256);
  return out;
}

/** Stable hash of the parameters that change every vector; stored with each profile. */
export function configHash(cfg) {
  const c = mergeProfileConfig(cfg);
  const sortedObj = (o) =>
    Object.keys(o)
      .sort()
      .map((k) => [k, o[k]]);
  const stable = JSON.stringify({
    v: c.version,
    d: c.dims,
    id: c.id_field,
    f: sortedObj(c.fields),
    t: [].concat(c.text_fields).sort(),
    cap: c.text_cap,
    stop: [].concat(c.stopwords).sort(),
    syn: sortedObj(c.synonyms),
    ks: [].concat(c.keep_short).sort(),
    bg: c.bigrams !== false,
    ex: {
      t: [].concat(c.exclude.types).sort(),
      k: [].concat(c.exclude.terms).sort(),
      f: [].concat(c.exclude.fields).sort(),
    },
  });
  return crc32(stable).toString(16);
}

// ---- items -----------------------------------------------------------------

/** Split a value into {id, name}: "id|Label", {id,name}, {key,label}, or a bare id. */
export function termOf(v) {
  if (v === undefined || v === null || v === '') return null;
  if (typeof v === 'object') {
    const id =
      v.id !== undefined ? v.id : v.key !== undefined ? v.key : v.value;
    if (id === undefined || id === null || id === '') return null;
    return { id: String(id).trim(), name: v.name || v.label || undefined };
  }
  const parts = String(v).split('|');
  const id = parts[0].trim();
  if (!id) return null;
  return { id, name: (parts[1] || '').trim() || undefined };
}

/** Split comma lists, trimming empty entries; retain objects and legacy arrays. */
export function valuesOf(v, splitCommas = true) {
  if (v === undefined || v === null || v === '') return [];
  if (Array.isArray(v))
    return v.flatMap((value) => valuesOf(value, splitCommas));
  if (typeof v === 'string' && splitCommas)
    return v
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean);
  return [v];
}

/** Term keys an item carries, as `<field>.<id>` strings (key fields only). */
export function termKeys(item, cfg) {
  const c = mergeProfileConfig(cfg);
  const out = [];
  Object.keys(c.fields).forEach((field) => {
    if (c.text_fields.indexOf(field) > -1) return;
    valuesOf(item[field]).forEach((v) => {
      const t = termOf(v);
      if (t) out.push(field + '.' + t.id.toLowerCase());
    });
  });
  return out;
}

/** True when the item must not contribute to a profile (sensitive content). */
export function isExcluded(item, cfg, trace = null) {
  const c = mergeProfileConfig(cfg);
  const result = (excluded, reason, matched) => {
    trace?.('page.exclusion', { excluded, reason, matched });
    return excluded;
  };
  if (!item) return result(true, 'no page metadata');
  if (
    item.exclude === true ||
    item.exclude === 1 ||
    item.exclude === '1' ||
    item.exclude === 'true'
  )
    return result(true, 'page exclude flag', item.exclude);
  const type = valuesOf(item.profile_type ?? item.type)[0];
  if (type && c.exclude.types.map(String).indexOf(String(type)) > -1)
    return result(true, 'excluded type', type);
  const ex = new Set(c.exclude.terms.map((k) => String(k).toLowerCase()));
  const keys = termKeys(item, c);
  for (let i = 0; i < keys.length; i++)
    if (ex.has(keys[i])) return result(true, 'excluded term', keys[i]);
  return result(false, 'no page flag, type or term matched an exclusion');
}

// ---- vectors ---------------------------------------------------------------

/**
 * Build the vector for an item: an object whose keys are the configured
 * field names (strings or arrays of strings / {id,name}).
 *
 * @returns {Float32Array|null} unit vector, or null if the item has no tokens.
 */
export function vectorOf(item, cfg, trace = null) {
  const c = mergeProfileConfig(cfg);
  const D = c.dims;
  const acc = new Float32Array(D);
  const counts = new Map();
  const add = (token, weight) => {
    if (!token || !weight) return;
    const key = token + '\u0001' + weight;
    counts.set(key, (counts.get(key) || 0) + 1);
  };
  const addText = (text, weight, field) => {
    if (!text || !weight) return;
    const { tokens, bigrams } = tokenize(
      String(text),
      c,
      trace ? (event, details) => trace(event, { field, ...details }) : null,
    );
    trace?.('vector.text', () => ({
      field,
      weight,
      text,
      tokens: tokens.slice(0, c.text_cap),
      bigrams: bigrams.slice(0, Math.max(0, c.text_cap - 1)),
      textCap: c.text_cap,
    }));
    tokens.slice(0, c.text_cap).forEach((t) => add(t, weight));
    bigrams
      .slice(0, Math.max(0, c.text_cap - 1))
      .forEach((b) => add(b, weight));
  };
  const exTerms = new Set(
    (c.exclude.terms || []).map((k) => String(k).toLowerCase()),
  );
  const exFields = new Set((c.exclude.fields || []).map((f) => String(f)));

  Object.keys(c.fields).forEach((field) => {
    const weight = parseFloat(c.fields[field]);
    if (!Number.isFinite(weight) || weight <= 0 || exFields.has(field)) {
      trace?.('vector.field.skipped', {
        field,
        weight,
        reason: exFields.has(field)
          ? 'excluded'
          : 'non-positive or invalid weight',
      });
      return;
    }
    const isText = c.text_fields.indexOf(field) > -1;
    const values = valuesOf(item[field], !isText);
    trace?.('vector.field', {
      field,
      weight,
      kind: isText ? 'text' : 'terms',
      input: item[field],
      values,
    });
    if (isText) {
      values.forEach((v) =>
        addText(
          typeof v === 'object' ? v.name || v.label || v.value : v,
          weight,
          field,
        ),
      );
      return;
    }
    values.forEach((v) => {
      const t = termOf(v);
      if (!t) return;
      const key = field + '.' + t.id.toLowerCase();
      if (exTerms.has(key)) {
        trace?.('vector.term.skipped', { field, key, reason: 'excluded' });
        return;
      }
      add(key, weight); // precise, curated
      if (t.name) addText(t.name, weight, field); // fuzzy, lexical
    });
  });

  if (counts.size === 0) {
    trace?.('vector.empty', { reason: 'no tokens' });
    return null;
  }
  counts.forEach((tf, key) => {
    const i = key.indexOf('\u0001');
    const token = key.slice(0, i);
    const weight = parseFloat(key.slice(i + 1));
    const h = crc32(token);
    const slot = h % D;
    const sign = (h >>> 8) & 1 ? 1 : -1;
    const contribution = sign * weight * (1 + Math.log(tf));
    const before = acc[slot];
    acc[slot] += contribution;
    trace?.('vector.token', {
      token,
      weight,
      tf,
      slot,
      sign,
      contribution,
      accumulated: acc[slot],
      before,
    });
  });
  let norm = 0;
  for (let i = 0; i < D; i++) norm += acc[i] * acc[i];
  const magnitude = Math.sqrt(norm);
  norm = magnitude || 1;
  for (let i = 0; i < D; i++) acc[i] /= norm;
  trace?.('vector.complete', () => ({
    dims: D,
    norm,
    magnitude,
    vector: Array.from(acc),
  }));
  return acc;
}

/** Cosine similarity of two vectors (any array kind). */
export function cosine(a, b) {
  if (!a || !b) return 0;
  const n = Math.min(a.length, b.length);
  let dot = 0,
    na = 0,
    nb = 0;
  for (let i = 0; i < n; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (!na || !nb) return 0;
  return dot / Math.sqrt(na * nb);
}

/** Serialise a unit vector as "v<version>:<base64 int8>" (for debugging/export). */
export function encode(vec, version = VECTOR_VERSION) {
  let s = '';
  for (let i = 0; i < vec.length; i++) {
    const q = Math.max(-127, Math.min(127, Math.round(127 * vec[i])));
    s += String.fromCharCode(q & 0xff);
  }
  const b64 =
    typeof btoa === 'function'
      ? btoa(s)
      : Buffer.from(s, 'binary').toString('base64');
  return 'v' + version + ':' + b64;
}

export function decode(str, expectVersion = VECTOR_VERSION) {
  if (!str || typeof str !== 'string') return null;
  const m = /^v(\d+):(.*)$/.exec(str);
  if (!m || parseInt(m[1], 10) !== expectVersion) return null;
  const bin =
    typeof atob === 'function'
      ? atob(m[2])
      : Buffer.from(m[2], 'base64').toString('binary');
  const out = new Float32Array(bin.length);
  for (let i = 0; i < bin.length; i++)
    out[i] = ((bin.charCodeAt(i) << 24) >> 24) / 127;
  return out;
}
