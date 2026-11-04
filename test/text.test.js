import { describe, expect, it } from 'vitest';
import { runInNewContext } from 'node:vm';
import ConvivialPersonalisation from '../src/index';
import { EN_STOPWORDS, tokenize } from '../src/lib/text';
import { configHash, vectorOf } from '../src/lib/vector';
import bundle from '../dist/bundle.js?raw';

it('removes connectors and stopwords before making bigrams', () => {
  expect(tokenize([...EN_STOPWORDS].join(' '))).toEqual({
    tokens: [],
    bigrams: [],
    surface: {},
  });
  expect(
    tokenize(
      'Housing AND or but nor so yet although unless whereas etc transport',
    ),
  ).toEqual({
    tokens: ['hous', 'transport'],
    bigrams: ['hous_transport'],
    surface: { hous: 'housing', transport: 'transport', hous_transport: 'housing transport' },
  });
});

it('keeps filtering stopwords supplied by synonyms or keep_short', () => {
  expect(
    tokenize('and or portal filler padding', {
      keep_short: ['or'],
      stopwords: ['PORTAL'],
      synonyms: {
        and: 'housing',
        portal: 'transport',
        filler: 'and',
        padding: 'portal',
      },
    }),
  ).toEqual({ tokens: [], bigrams: [], surface: {} });
});

it.each([
  ['house houses housed housing', ['hous', 'hous', 'hous', 'hous']],
  ['service services', ['servic', 'servic']],
  ['tree free', ['tree', 'free']],
])('uses Porter stems for %s', (text, expected) => {
  expect(tokenize(text, { bigrams: false }).tokens).toEqual(expected);
});

it.each([
  ['IA', 'information architecture', { ia: 'information architecture' }],
  ['information\tarchitecture', 'IA', { 'information architecture': 'ia' }],
  ['Public\nhousing', 'Homes', { 'PUBLIC HOUSING': 'HOMES' }],
  ['UX', 'user experience', { ' UX ': ' User  Experience ' }],
  ['motorcar', 'car', { Motorcar: 'Car' }],
])(
  'maps %s and %s to the same nonempty tokens',
  (alias, canonical, synonyms) => {
    const actual = tokenize(alias, { synonyms });
    expect(actual.tokens.length).toBeGreaterThan(0);
    expect(actual).toEqual(tokenize(canonical, { synonyms }));
  },
);

it('prefers the longest phrase regardless of config insertion order', () => {
  const synonyms = {
    'public housing': 'homes',
    'public housing assistance': 'support',
  };
  const reversed = Object.fromEntries(Object.entries(synonyms).reverse());
  expect(tokenize('Public housing assistance', { synonyms }).tokens).toEqual([
    'support',
  ]);
  expect(tokenize('Public housing assistance', { synonyms: reversed })).toEqual(
    tokenize('Public housing assistance', { synonyms }),
  );
  expect(configHash({ synonyms })).toBe(configHash({ synonyms: reversed }));
});

it('matches whole words and treats replacement text literally', () => {
  expect(tokenize('cart car', { synonyms: { car: 'vehicle' } }).tokens).toEqual(
    ['cart', 'vehicle'],
  );
  expect(
    tokenize('public housing', { synonyms: { 'public housing': '$& homes' } })
      .tokens,
  ).toEqual(['homes']);
});

it('does not treat inherited object properties as synonyms', () => {
  expect(tokenize('constructor').tokens).toEqual(['constructor']);
});

it('uses text_fields only for weighted fields and preserves taxonomy identities', () => {
  const cfg = {
    fields: { title: 3, topics: 4 },
    text_fields: ['title', 'summary'],
    synonyms: { ia: 'information architecture' },
  };
  expect(vectorOf({ summary: 'housing' }, cfg)).toBeNull();
  expect(vectorOf({ title: 'and or' }, cfg)).toBeNull();
  const features = [];
  vectorOf(
    { title: 'IA', topics: 'ia' },
    cfg,
    (event, details) => {
      if (event === 'vector.token') {
        features.push([details.token, details.weight]);
      }
    },
  );
  expect(features).toEqual([
    ['architecture', 3],
    ['topics.ia', 4],
  ]);
});

describe.each(['source', 'bundle'])('%s recommendation synonyms', (mode) => {
  it('learns a short alias and recommends its expanded phrase', async () => {
    let Engine = ConvivialPersonalisation;
    if (mode === 'bundle') {
      const context = { console, setTimeout };
      runInNewContext(bundle, context);
      Engine = context.ConvivialPersonalisation.default;
    }
    const cp = new Engine(
      {
        profile: {
          fields: { profile_title: 3 },
          synonyms: { ia: 'information architecture' },
        },
        profilers: {
          title: {
            sources: [{ type: 'fixture' }],
            processors: [{ type: 'temp', storage_key: 'profile_title' }],
          },
          fast: { processors: [{ type: 'profile', storage_key: 'fast' }] },
        },
      },
      'text-test',
      { persist: false, now: () => 1000 },
    );
    cp.sources.fixture = (instance, profiler, source, out) => out.push('IA');
    try {
      await cp.collect();
      cp.fold();
      const { items: rows } = cp.rank(
        [{ nid: 'candidate', profile_title: 'Information architecture' }],
        ['fast'],
        1,
        { priorityWeight: 0, minSim: 0.99, fallback: 'none' },
      );
      expect(rows).toHaveLength(1);
      expect(rows[0].sim).toBeCloseTo(1);
      expect(rows[0].profile).toBe('fast');
    } finally {
      cp.erase();
    }
  });
});

it('invalidates profiles learned with the previous tokenizer version', () => {
  const cp = new ConvivialPersonalisation({}, 'text-version-test', {
    persist: false,
    now: () => 1000,
  });
  try {
    cp.storage.data.profiles.fast = {
      v: new Array(256).fill(1),
      t: 1000,
      n: 1,
      decay: 0,
      cfg: configHash({ version: 2 }),
    };
    expect(cp.profile.vector('fast').v).toBeNull();
  } finally {
    cp.erase();
  }
});
