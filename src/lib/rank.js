/**
 * @file
 * rank(items, profiles, count, options, ctx)
 *
 * Takes the rows of a JSON view, hashes each with the site's `profile`
 * config (the same fields and weights that built the visitor's profiles),
 * scores them by cosine similarity against the requested profiles, removes
 * the current page and (optionally) seen items, splits `count` slots between
 * the profiles, and returns the items ranked and truncated. The row objects
 * are mutated in place (`score`, `sim`, `profile`, `pos` added).
 *
 * The result is an object:
 *
 *   {
 *     items,       // the ranked rows, in render order
 *     why,         // ['Artificial intelligence', 'drupal', 'Editors'] — the
 *                  // strongest matching terms across the block as a whole
 *     why_detail,  // [{ term, label, field, kind, share, items }] behind `why`
 *     profiles,    // { fast: { used: true, confidence: 0.8 }, ... }
 *     count,       // items.length
 *   }
 *
 * `why` is a numerical decomposition of the ranking signal itself: each picked
 * item's cosine similarity is split back onto its tokens (termContributions),
 * the positive parts are summed per term across the picked items, and the
 * terms that carry the most of the block's similarity are returned. It works
 * identically for taxonomy keys and for free text, so a block of RSS items
 * with only a title and description still gets a `why`.
 *
 * No server, no page blending: it is the visitor's profiles against the rows.
 */

import {
  mergeProfileConfig,
  vectorOf,
  cosine,
  termKeys,
  termOf,
  valuesOf,
  termContributions,
} from './vector';
import { decayFactor } from './profile';

export const DEFAULT_RANK_OPTIONS = {
  removeSeenItems: true, // drop items the visitor has already viewed
  seenWindow: 30 * 86400, // seconds: how long "seen" lasts for removeSeenItems
  excludeCurrent: true, // drop the current page
  minSim: 0.05, // an item less similar than this is never picked by a profile
  mergeThreshold: 0.9, // profiles whose vectors agree this closely share one slate
  minConfidence: 0, // profiles below this confidence give up their slots
  prior: 'none', // 'none' | 'order' | 'recency' | 'editorial' | fn(item, i, n) → 0..1
  priorityWeight: 0.2, // prior strength; the remaining weight goes to similarity
  recencyHalfLife: 30 * 86400,
  fallback: 'order', // 'order' pads from the view order | 'none' returns fewer
  diversify: true, // avoid two adjacent items sharing the first key field's value
  explain: true, // compute `why` for the block (false → why: [])
  whyMax: null, // terms in `why`; null → profile.why_max (3)
  whyFloor: 0.1, // a term seen in one item only needs this share of the block's similarity
};

// ---- helpers ---------------------------------------------------------------

const idOf = (item, cfg) => {
  const candidates = [cfg.id_field, 'id', 'nid', 'uuid', 'url'];
  for (let i = 0; i < candidates.length; i++) {
    const v = item[candidates[i]];
    if (v !== undefined && v !== null && v !== '')
      return String(Array.isArray(v) ? v[0] : v);
  }
  return undefined;
};

const changedOf = (item) => {
  const v =
    item.changed !== undefined
      ? item.changed
      : item.updated !== undefined
        ? item.updated
        : item.created !== undefined
          ? item.created
          : item.date;
  if (v === undefined || v === null || v === '') return undefined;
  if (typeof v === 'number') return v;
  if (/^\d+$/.test(String(v))) return parseInt(v, 10);
  const t = Date.parse(v);
  return isNaN(t) ? undefined : Math.round(t / 1000);
};

function priorOf(item, i, n, opts, now) {
  const kind = opts.prior;
  if (typeof kind === 'function')
    return Math.max(0, Math.min(1, kind(item, i, n) || 0));
  switch (kind) {
    case 'none':
      return 0.5;
    case 'recency': {
      const c = changedOf(item);
      if (!c) return 0.5;
      return decayFactor(Math.max(0, now - c), opts.recencyHalfLife);
    }
    case 'editorial': {
      const w = parseFloat(item.weight);
      if (!isFinite(w)) return 0.5;
      return 1 / (1 + Math.max(0, w)); // Drupal weight: lower is better
    }
    case 'order':
      return n > 1 ? 1 - i / (n - 1) : 1;
    default:
      // An unknown or undefined prior behaves like the default, none.
      return 0.5;
  }
}

const matchesScope = (item, s, cfg) => {
  switch (s.scope) {
    case 'id':
    case 'nid':
      return (
        idOf(item, cfg) === s.key ||
        (item.url !== undefined && String(item.url) === s.key)
      );
    case 'campaign':
      return item.campaign !== undefined && String(item.campaign) === s.key;
    case 'term':
      return termKeys(item, cfg).indexOf(s.key) > -1;
    default: {
      // a key field name: 'intent', 'topic', 'audience', 'stage' → key is the value id
      return valuesOf(item[s.scope]).some((v) => {
        const t = termOf(v);
        return t && t.id.toLowerCase() === s.key.toLowerCase();
      });
    }
  }
};

function suppressionFor(item, suppressions, cfg) {
  let excluded = false;
  let factor = 1;
  (suppressions || []).forEach((s) => {
    if (!matchesScope(item, s, cfg)) return;
    if (s.mode === 'exclude') excluded = true;
    else factor *= s.factor !== undefined ? s.factor : 0.3;
  });
  return { excluded, factor };
}

/**
 * Block-level `why`: the terms that carry most of the similarity between the
 * picked (non-fallback) items and the profiles that picked them.
 *
 * Per picked item, termContributions() splits sim(item, profile) onto the
 * item's tokens. Positive contributions from fields outside `why_exclude`
 * are summed per token across the block. A token is kept when at least two
 * items share it, or when it alone carries `whyFloor` of the block's total.
 * Tokens are sorted by share, labelled (key → labels[key] || key; text →
 * surface word), de-duplicated by label and capped at `whyMax`.
 *
 * @param {object[]} picked rows with `_v` and `profile` set
 * @param {object} queries { name: { q: Float32Array } } the vectors that picked
 * @param {object} labels key → label lookup (presentation only)
 * @returns {{ why: string[], why_detail: object[] }}
 */
export function aggregateWhy(picked, queries, labels, cfg, opts, trace) {
  const max =
    opts.whyMax !== null && opts.whyMax !== undefined
      ? Math.max(0, parseInt(opts.whyMax, 10) || 0)
      : cfg.why_max;
  const floor = Number.isFinite(parseFloat(opts.whyFloor))
    ? parseFloat(opts.whyFloor)
    : DEFAULT_RANK_OPTIONS.whyFloor;
  const skip = new Set((cfg.why_exclude || []).map(String));
  const sums = new Map(); // token → { token, field, kind, surface, total, items:Set }
  let total = 0;
  picked.forEach((it) => {
    const q = it.profile && queries[it.profile];
    if (!q || !q.q || !it._v) return;
    termContributions(it, q.q, cfg).forEach((t) => {
      if (t.contribution <= 0 || skip.has(t.field)) return;
      total += t.contribution;
      let e = sums.get(t.token);
      if (!e) {
        e = {
          token: t.token,
          field: t.field,
          kind: t.kind,
          surface: t.surface,
          total: 0,
          items: new Set(),
        };
        sums.set(t.token, e);
      }
      e.total += t.contribution;
      e.items.add(it.id);
    });
  });
  const labelOf = (e) => {
    if (e.kind === 'key') {
      const key = e.token.slice(e.field.length + 1);
      const id = e.surface || key;
      return (labels && (labels[id] || labels[key])) || id;
    }
    return e.surface || e.token;
  };
  const seen = new Set();
  const detail = [];
  Array.from(sums.values())
    .map((e) => Object.assign(e, { share: total ? e.total / total : 0 }))
    .filter((e) => e.items.size >= 2 || e.share >= floor)
    .sort((a, b) => b.share - a.share || a.token.localeCompare(b.token))
    .forEach((e) => {
      const label = labelOf(e);
      const dedupe = String(label).toLowerCase();
      if (seen.has(dedupe)) return;
      seen.add(dedupe);
      detail.push({
        term: e.token,
        label,
        field: e.field,
        kind: e.kind,
        share: e.share,
        items: Array.from(e.items),
      });
    });
  const kept = detail.slice(0, max);
  trace?.('rank.why', () => ({
    why: kept.map((d) => d.label),
    considered: sums.size,
    kept: kept.length,
    floor,
    max,
    detail: kept,
  }));
  return { why: kept.map((d) => d.label), why_detail: kept };
}

function primaryKey(item, field) {
  const t = termOf(valuesOf(item[field])[0]);
  return t ? t.id : null;
}

/** Greedy reorder so adjacent items avoid sharing the primary key when possible. */
function diversify(list, field) {
  const out = [];
  const pool = list.slice();
  while (pool.length) {
    const last = out.length ? primaryKey(out[out.length - 1], field) : null;
    let idx = pool.findIndex(
      (it) => last === null || primaryKey(it, field) !== last,
    );
    if (idx === -1) idx = 0;
    out.push(pool.splice(idx, 1)[0]);
  }
  return out;
}

// ---- rank ------------------------------------------------------------------

/**
 * @param {object[]} items     rows of the JSON view (mutated)
 * @param {string[]|object} profiles configured names (slots split by
 *   confidence) or name-to-count map (fixed); defaults to [] (fallback only)
 * @param {number} count       items to return
 * @param {object} options     DEFAULT_RANK_OPTIONS
 * @param {object} ctx         { cfg, now, vectors: {name: {v, confidence}}, currentId, seenAge(id), suppressions, labels }
 * @returns {{items: object[], why: string[], why_detail: object[], profiles: object, count: number}}
 */
export function rank(items, profiles = [], count = 5, options = {}, ctx = {}) {
  profiles ??= [];
  const opts = Object.assign({}, DEFAULT_RANK_OPTIONS, options || {});
  // Keep legacy callers working; the descriptive option wins, including zero.
  const requestedPriorityWeight = parseFloat(
    options?.priorityWeight ??
      options?.p ??
      DEFAULT_RANK_OPTIONS.priorityWeight,
  );
  opts.priorityWeight = Number.isNaN(requestedPriorityWeight)
    ? DEFAULT_RANK_OPTIONS.priorityWeight
    : Math.max(0, Math.min(1, requestedPriorityWeight));
  delete opts.p;
  const cfg = mergeProfileConfig(ctx.cfg || {});
  const now = ctx.now || Math.round(Date.now() / 1000);
  const limit = Math.max(0, parseInt(count, 10) || 0);
  const rows = Array.isArray(items) ? items : [];
  const n = rows.length;
  const trace = ctx.trace;
  trace?.('rank.options', { options: opts, candidates: n, limit });
  const result = (out, why, profilesUsed) => ({
    items: out,
    why: why.why,
    why_detail: why.why_detail,
    profiles: profilesUsed,
    count: out.length,
  });
  if (!n || !limit) {
    trace?.('rank.complete', { items: [], reason: 'no candidates or slots' });
    return result([], { why: [], why_detail: [] }, {});
  }

  // Requested profiles → [{name, want|null}]
  let requested;
  if (Array.isArray(profiles))
    requested = profiles.map((name) => ({ name: String(name), want: null }));
  else
    requested = Object.keys(profiles).map((name) => ({
      name,
      want: parseInt(profiles[name], 10) || 0,
    }));

  // Candidates: hash, filter, prior.
  const live = [];
  rows.forEach((it, i) => {
    it.id = idOf(it, cfg);
    if (
      opts.excludeCurrent &&
      ctx.currentId !== undefined &&
      ctx.currentId !== null &&
      it.id === String(ctx.currentId)
    ) {
      trace?.('rank.candidate.skipped', {
        id: it.id,
        reason: 'current page',
        currentId: ctx.currentId,
      });
      return;
    }
    const s = suppressionFor(it, ctx.suppressions, cfg);
    if (s.excluded) {
      trace?.('rank.candidate.skipped', { id: it.id, reason: 'suppression' });
      return;
    }
    if (
      opts.removeSeenItems &&
      typeof ctx.seenAge === 'function' &&
      it.id !== undefined
    ) {
      const age = ctx.seenAge(it.id);
      if (age !== null && age !== undefined && age <= opts.seenWindow) {
        trace?.('rank.candidate.skipped', {
          id: it.id,
          reason: 'seen',
          age,
          seenWindow: opts.seenWindow,
        });
        return;
      }
    }
    it._v = vectorOf(
      it,
      cfg,
      trace
        ? (event, details) =>
            trace(event, () => ({
              candidate: it.id,
              ...(typeof details === 'function' ? details() : details),
            }))
        : null,
    );
    it._demote = s.factor;
    it._prior = priorOf(it, i, n, opts, now);
    it._i = i;
    live.push(it);
    trace?.('rank.candidate', {
      id: it.id,
      prior: it._prior,
      demotion: it._demote,
      hasVector: !!it._v,
    });
  });

  // Queries: one per requested profile that has a vector.
  let queries = requested
    .map((r) => {
      const vec = (ctx.vectors && ctx.vectors[r.name]) || {};
      return {
        name: r.name,
        q: vec.v || null,
        confidence: vec.confidence || 0,
        want: r.want,
      };
    })
    .filter((q) => {
      const eligible = !!q.q && q.confidence >= opts.minConfidence;
      trace?.('rank.profile', {
        name: q.name,
        confidence: q.confidence,
        minConfidence: opts.minConfidence,
        hasVector: !!q.q,
        eligible,
      });
      return eligible;
    });
  // Profiles that agree would only split the same list: keep the one named first.
  const merged = [];
  queries.forEach((q) => {
    const twin = merged.find((m) => cosine(m.q, q.q) >= opts.mergeThreshold);
    if (twin) {
      trace?.('rank.profile.merged', {
        name: q.name,
        into: twin.name,
        similarity: cosine(twin.q, q.q),
        threshold: opts.mergeThreshold,
      });
      twin.confidence = Math.max(twin.confidence, q.confidence);
      if (twin.want !== null && q.want !== null) twin.want += q.want;
    } else merged.push(q);
  });
  queries = merged;

  // Slot allocation.
  const alloc = {};
  if (queries.length) {
    if (queries.every((q) => q.want !== null)) {
      queries.forEach((q) => {
        alloc[q.name] = Math.min(limit, q.want);
      });
    } else {
      const total = queries.reduce((a, q) => a + q.confidence, 0) || 1;
      let remaining = limit;
      queries.forEach((q, i) => {
        const share =
          i === queries.length - 1
            ? remaining
            : Math.max(1, Math.round((q.confidence / total) * limit));
        const reserved = limit >= queries.length ? queries.length - i - 1 : 0;
        alloc[q.name] = Math.max(0, Math.min(remaining - reserved, share));
        remaining -= alloc[q.name];
      });
    }
  }
  trace?.('rank.allocation', {
    slots: alloc,
    method:
      queries.length && queries.every((q) => q.want !== null)
        ? 'fixed'
        : 'confidence',
  });

  // Score per profile.
  const priorityWeight = opts.priorityWeight;
  const similarityWeight = 1 - priorityWeight;
  const picked = [];
  const taken = new Set();
  queries.forEach((q) => {
    const want = alloc[q.name] || 0;
    if (!want) return;
    const scored = live
      .filter((it) => !taken.has(it) && it._v)
      .map((it) => {
        const sim = cosine(q.q, it._v);
        trace?.('rank.similarity', {
          id: it.id,
          profile: q.name,
          sim,
          minSim: opts.minSim,
          eligible: sim >= opts.minSim,
        });
        return { it, sim };
      })
      .filter((e) => e.sim >= opts.minSim)
      .map((e) => {
        const priorContribution = priorityWeight * e.it._prior;
        const similarityContribution =
          similarityWeight * Math.max(0, Math.min(1, e.sim));
        e.score = (priorContribution + similarityContribution) * e.it._demote;
        trace?.('rank.score', {
          id: e.it.id,
          profile: q.name,
          sim: e.sim,
          prior: e.it._prior,
          priorityWeight,
          priorWeight: priorityWeight, // Retain the existing diagnostic field.
          similarityWeight,
          priorContribution,
          similarityContribution,
          demotion: e.it._demote,
          score: e.score,
        });
        return e;
      })
      .sort((a, b) => b.score - a.score);
    if (trace)
      scored.forEach((e, i) =>
        trace('rank.selection', {
          id: e.it.id,
          profile: q.name,
          score: e.score,
          position: i + 1,
          slots: want,
          selected: i < want,
        }),
      );
    scored.slice(0, want).forEach((e) => {
      taken.add(e.it);
      e.it.sim = e.sim;
      e.it.score = e.score;
      e.it.profile = q.name;
      picked.push(e.it);
    });
  });

  let out = picked;
  const firstKeyField = Object.keys(cfg.fields).find(
    (f) =>
      cfg.text_fields.indexOf(f) === -1 && f !== 'type' && f !== 'profile_type',
  );
  if (opts.diversify && out.length > 2 && firstKeyField) {
    trace?.('rank.diversify.before', () => ({
      field: firstKeyField,
      ids: out.map((it) => it.id),
    }));
    out = diversify(out, firstKeyField);
    trace?.('rank.diversify.after', () => ({ ids: out.map((it) => it.id) }));
  }
  out = out.slice(0, limit);

  // Pad from the view's own order (by prior) so the block never renders short.
  if (out.length < limit && opts.fallback !== 'none') {
    live
      .slice()
      .sort(
        (a, b) => b._prior * b._demote - a._prior * a._demote || a._i - b._i,
      )
      .forEach((it) => {
        if (out.length >= limit || taken.has(it)) return;
        taken.add(it);
        it.sim = null;
        it.score = it._prior * it._demote;
        it.profile = 'fallback';
        out.push(it);
        trace?.('rank.fallback', {
          id: it.id,
          prior: it._prior,
          demotion: it._demote,
          score: it.score,
          missingBefore: limit - out.length + 1,
        });
      });
  }

  out.forEach((it, pos) => {
    it.pos = pos + 1;
  });

  // Block-level explanation from the picked (non-fallback) items.
  const byName = {};
  queries.forEach((q) => {
    byName[q.name] = q;
  });
  const why = opts.explain
    ? aggregateWhy(
        out.filter((it) => it.profile !== 'fallback'),
        byName,
        ctx.labels || {},
        cfg,
        opts,
        trace,
      )
    : { why: [], why_detail: [] };
  const profilesUsed = {};
  requested.forEach((r) => {
    const vec = (ctx.vectors && ctx.vectors[r.name]) || {};
    profilesUsed[r.name] = {
      used: out.some((it) => it.profile === r.name),
      confidence: vec.confidence || 0,
    };
  });

  trace?.('rank.complete', () => ({
    requested: limit,
    remainingCandidates: live.length,
    fallbackCount: out.filter((it) => it.profile === 'fallback').length,
    why: why.why,
    items: out.map(({ id, pos, profile, sim, score }) => ({
      id,
      pos,
      profile,
      sim,
      score,
    })),
  }));
  // Tidy working fields on every row.
  rows.forEach((it) => {
    delete it._v;
    delete it._demote;
    delete it._prior;
    delete it._i;
  });
  return result(out, why, profilesUsed);
}
