/**
 * @file
 * Text pipeline: normalise → synonyms → tokenise → drop stopword/short/number
 * tokens → stem → bigrams.
 *
 * Runs identically for the current page and for every candidate item, so the
 * two sides of the similarity can never drift. Versioned with the vector
 * config: a change here is a `version` bump.
 */

import { stem } from './porter';

// Standard English stoplist plus the words every government page shares.
export const EN_STOPWORDS = new Set(
  (
    'a about above after again against all also am an and any are as at be because been ' +
    'before being below between both but by can could did do does doing down during each few for from further had has have having ' +
    'he her here hers herself him himself his how i if in into is it its itself just me more most my myself no nor not now of off on ' +
    'once only or other our ours ourselves out over own same she should so some such than that the their theirs them themselves then ' +
    'there these they this those through to too under until up very was we were what when where which while who whom why will with ' +
    'would you your yours yourself yourselves ' +
    'although either neither since unless whereas whether yet however therefore otherwise etc ' +
    'find information page pages please see visit read more click here contact us information about'
  ).split(/\s+/),
);

const YEAR = /^(19|20)\d\d$/;
const NUMERIC = /^\d+$/;

function normalise(text) {
  let s = String(text || '');
  if (s.normalize) s = s.normalize('NFKC');
  s = s
    .toLowerCase()
    .replace(/[‘’‚]/g, "'")
    .replace(/[“”„]/g, '"')
    .replace(/[–—−]/g, '-')
    .replace(/&[a-z]+;|&#\d+;/g, ' ');
  return s;
}

/** Normalize aliases and their canonical text just like incoming text. */
function normaliseSynonyms(synonyms) {
  const result = new Map();
  Object.keys(synonyms)
    .sort()
    .forEach((key) => {
      if (typeof synonyms[key] !== 'string') {
        return;
      }
      const alias = normalise(key).trim().replace(/\s+/g, ' ');
      const canonical = normalise(synonyms[key]).trim().replace(/\s+/g, ' ');
      if (alias && canonical) {
        result.set(alias, canonical);
      }
    });
  return result;
}

/** Replace aliases once, longest first, before filtering short words. */
function applySynonyms(text, synonyms, siteStop) {
  if (!synonyms.size) {
    return text;
  }
  const aliases = [...synonyms.keys()].sort((a, b) => b.length - a.length);
  const pattern = aliases
    .map((alias) =>
      alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/ /g, '\\s+'),
    )
    .join('|');
  return text.replace(new RegExp('\\b(?:' + pattern + ')\\b', 'g'), (match) => {
    const alias = match.replace(/\s+/g, ' ');
    // A single stopword cannot become a feature through a synonym. Phrases
    // such as "information architecture" can still match before filtering.
    return EN_STOPWORDS.has(alias) || siteStop.has(alias)
      ? match
      : synonyms.get(alias);
  });
}

/** Keep a hyphenated compound and its parts; remove possessive endings. */
function wordParts(value) {
  const word = value.replace(/^['\-]+|['\-]+$/g, '').replace(/'s$/, '');
  if (!word) {
    return [];
  }
  return word.includes('-') ? [word, ...word.split('-')] : [word];
}

/**
 * @param {string} text
 * @param {object} cfg profile config (stopwords, synonyms, keep_short, bigrams)
 * @returns {{tokens: string[], bigrams: string[]}}
 */
export function tokenize(text, cfg = {}, trace = null) {
  const synonyms = normaliseSynonyms(cfg.synonyms || {});
  const canonical = new Set(
    [...synonyms.values()].flatMap((value) =>
      value.split(/[^a-z0-9'\-]+/).flatMap(wordParts),
    ),
  );
  const keepShort = new Set((cfg.keep_short || []).map((s) => s.toLowerCase()));
  const siteStop = new Set(
    (cfg.stopwords || cfg.stopwords_site || []).map((s) => s.toLowerCase()),
  );

  const normalised = normalise(text);
  const s = applySynonyms(normalised, synonyms, siteStop);
  const raw = s.split(/[^a-z0-9'\-]+/).filter(Boolean);

  const words = [];
  const discarded = trace ? [] : null;
  raw.forEach((w) => {
    wordParts(w).forEach((p) => {
      if (!p) return;
      if (EN_STOPWORDS.has(p) || siteStop.has(p)) {
        discarded?.push({
          word: p,
          reason: siteStop.has(p) ? 'site stopword' : 'English stopword',
        });
        return;
      }
      if (NUMERIC.test(p) && !YEAR.test(p)) {
        discarded?.push({ word: p, reason: 'number, not a year' });
        return;
      }
      if (p.length < 3 && !keepShort.has(p) && !canonical.has(p)) {
        discarded?.push({
          word: p,
          reason: 'short word without a keep_short or synonym exception',
        });
        return;
      }
      words.push(p);
    });
  });

  const tokens = words.map((t) =>
    canonical.has(t) || /\d/.test(t) || t.indexOf('-') > -1 ? t : stem(t),
  );

  const bigrams = [];
  if (cfg.bigrams !== false) {
    for (let i = 1; i < tokens.length; i++)
      bigrams.push(tokens[i - 1] + '_' + tokens[i]);
  }
  trace?.('text.tokenize', {
    input: text,
    normalised,
    phrases: s,
    raw,
    words,
    tokens,
    bigrams,
    discarded,
    bigramsEnabled: cfg.bigrams !== false,
  });
  return { tokens, bigrams };
}

/** Plain-text extraction from an HTML fragment (no DOM needed). */
export function stripHtml(html) {
  return String(html || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(
      /&(amp|lt|gt|quot|#39|nbsp);/g,
      (m, e) =>
        ({ amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'", nbsp: ' ' })[e],
    )
    .replace(/\s+/g, ' ')
    .trim();
}
