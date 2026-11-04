/**
 * rank().why — the block-level explanation.
 *
 * `why` is a numerical decomposition of the ranking signal: each picked
 * item's cosine similarity is split onto its tokens (termContributions), the
 * positive parts are summed per term across the block, and the strongest
 * terms are returned, labelled for display. These tests pin the contract
 * that the Textile spec describes.
 */
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import ConvivialPersonalisation from '../src/index';
import { rank, aggregateWhy } from '../src/lib/rank';
import {
  vectorOf,
  cosine,
  termContributions,
  tokensOf,
  mergeProfileConfig,
} from '../src/lib/vector';

beforeEach(() => {
  localStorage.clear();
  document.head.innerHTML = '';
});

afterEach(() => {
  window.convivialPersonalisation?.erase();
  vi.restoreAllMocks();
});

const siteProfile = {
  fields: {
    title: 3,
    description: 2,
    topics: 4,
    audiences: 4,
    intent: 4,
    stage: 2,
    type: 2,
  },
  text_fields: ['title', 'description'],
  id_field: 'nid',
  keep_short: ['ai', 'ux'],
  stopwords: ['convivial', 'govcms'],
};

const labels = {
  'topic-ai': 'Artificial intelligence',
  'topic-personalisation': 'Personalisation',
  'audience-editors': 'Editors',
};

const items = [
  {
    nid: '462',
    title: 'AI Powered Drupal: A new era for content creation',
    description: 'A DrupalSouth video on extending Drupal with AI capabilities.',
    audiences: 'audience-editors',
    topics: 'topic-ai, topic-personalisation',
    type: 'article',
  },
  {
    nid: '460',
    title: 'How personalisation works',
    description: 'An overview of personalisation with AI.',
    audiences: 'audience-editors, audience-marketers',
    topics: 'topic-personalisation',
    type: 'article',
  },
  {
    nid: '464',
    title: 'Exploring open data',
    description: 'A presentation on open data and the new IPEA website.',
    audiences: 'audience-general',
    topics: 'topic-campaigns',
    type: 'article',
  },
];

function engineWithProfile(learned, config = {}) {
  const cp = new ConvivialPersonalisation(
    { profile: siteProfile, data: { topics: labels }, ...config },
    'why-test',
    { persist: false, now: () => 1000 },
  );
  cp.profile.fold('fast', 0, vectorOf(learned, cp.profileConfig));
  return cp;
}

const flat = {
  priorityWeight: 0,
  diversify: false,
  removeSeenItems: false,
  excludeCurrent: false,
};

it('termContributions sums to the cosine similarity exactly', () => {
  const cfg = mergeProfileConfig(siteProfile);
  const profile = vectorOf(items[0], cfg);
  items.forEach((item) => {
    const v = vectorOf(item, cfg);
    const sum = termContributions(item, profile, cfg).reduce(
      (a, t) => a + t.contribution,
      0,
    );
    expect(sum).toBeCloseTo(cosine(v, profile), 6);
  });
  // tokensOf is the shared source of tokens for both functions.
  expect(tokensOf(items[0], cfg).map((t) => t.token)).toEqual(
    termContributions(items[0], profile, cfg).map((t) => t.token),
  );
});

it('returns why at the root, with no why on items, labelled from config.data', () => {
  const cp = engineWithProfile(items[0]);
  const result = cp.rank(structuredClone(items), ['fast'], 3, flat);
  expect(Object.keys(result).sort()).toEqual([
    'count',
    'items',
    'profiles',
    'variant',
    'why',
    'why_detail',
  ]);
  expect(result.count).toBe(3);
  expect(result.variant).toBe('personalised');
  expect(result.items[0]).toMatchObject({ id: '462', profile: 'fast' });
  result.items.forEach((item) => expect(item).not.toHaveProperty('why'));
  expect(result.why).toHaveLength(3);
  // Terms shared by the two picked items lead: the editors audience and the
  // personalisation topic (labelled), and the word "ai" from both texts.
  expect(result.why).toEqual(['Editors', 'Personalisation', 'ai']);
  // topic-ai is in one picked item only and sits under the noise floor.
  expect(result.why).not.toContain('Artificial intelligence');
  // Every kept term names the items it came from and carries a share.
  result.why_detail.forEach((d) => {
    expect(d.items.length).toBeGreaterThan(0);
    expect(d.share).toBeGreaterThan(0);
    expect(['key', 'text']).toContain(d.kind);
  });
  expect(result.profiles).toEqual({ fast: { used: true, confidence: 1 } });
});

it('explains text-only items (an RSS feed) from shared words', () => {
  const feed = [
    {
      nid: 'a',
      title: 'Drupal personalisation with AI',
      description: 'Using visitor interests to recommend content.',
    },
    {
      nid: 'b',
      title: 'Personalisation and recommendations',
      description: 'Why personalisation matters for content editors.',
    },
    {
      nid: 'c',
      title: 'Road closures this weekend',
      description: 'Traffic management for the marathon.',
    },
  ];
  const cp = engineWithProfile(
    { title: 'AI and personalisation', description: 'Recommending content.' },
    { profile: { ...siteProfile, text_fields: ['title', 'description'] } },
  );
  const { items: picked, why, why_detail } = cp.rank(
    structuredClone(feed),
    ['fast'],
    2,
    { ...flat, minSim: 0.01 },
  );
  expect(picked.map((i) => i.id)).toEqual(['a', 'b']);
  expect(why.length).toBeGreaterThan(0);
  expect(why.map((w) => w.toLowerCase())).toContain('personalisation');
  expect(why_detail.every((d) => d.kind === 'text')).toBe(true);
  // Surface words, not stems.
  expect(why).not.toContain('personalis');
});

it('skips why_exclude fields, honours whyMax, and explain: false', () => {
  const cp = engineWithProfile(items[0]);
  const all = cp.rank(structuredClone(items), ['fast'], 3, {
    ...flat,
    whyMax: 20,
  });
  // `type` is shared by every item and is excluded by default.
  expect(all.why).not.toContain('article');
  expect(all.why_detail.some((d) => d.field === 'type')).toBe(false);
  expect(all.why.length).toBeGreaterThanOrEqual(3);

  const one = cp.rank(structuredClone(items), ['fast'], 3, {
    ...flat,
    whyMax: 1,
  });
  expect(one.why).toHaveLength(1);
  expect(one.why[0]).toBe(all.why[0]);

  const off = cp.rank(structuredClone(items), ['fast'], 3, {
    ...flat,
    explain: false,
  });
  expect(off.why).toEqual([]);
  expect(off.why_detail).toEqual([]);
  expect(off.items).toHaveLength(3);

  // profile.why_max and profile.why_exclude are the configured defaults.
  const cfg = new ConvivialPersonalisation(
    { profile: { ...siteProfile, why_max: 2, why_exclude: [] } },
    'why-cfg',
    { persist: false },
  );
  expect(cfg.profileConfig.why_max).toBe(2);
  expect(cfg.profileConfig.why_exclude).toEqual([]);
  cfg.profile.fold('fast', 0, vectorOf(items[0], cfg.profileConfig));
  expect(cfg.rank(structuredClone(items), ['fast'], 3, flat).why).toHaveLength(
    2,
  );
});

it('applies the noise floor: a term in one item needs whyFloor of the block', () => {
  const cfg = mergeProfileConfig(siteProfile);
  const profile = { q: vectorOf(items[0], cfg) };
  const picked = structuredClone(items.slice(0, 2)).map((it) => ({
    ...it,
    id: it.nid,
    profile: 'fast',
    _v: vectorOf(it, cfg),
  }));
  const loose = aggregateWhy(picked, { fast: profile }, labels, cfg, {
    whyMax: 50,
    whyFloor: 0,
  });
  const strict = aggregateWhy(picked, { fast: profile }, labels, cfg, {
    whyMax: 50,
    whyFloor: 0.5,
  });
  // With a 50% floor only terms shared by both items survive.
  expect(strict.why_detail.every((d) => d.items.length === 2)).toBe(true);
  expect(strict.why.length).toBeLessThan(loose.why.length);
  // Shared terms are labelled; "drupal" appears once in item 462 only.
  expect(loose.why).toEqual(
    expect.arrayContaining(['Artificial intelligence', 'Editors', 'drupal']),
  );
  expect(strict.why).not.toContain('drupal');
});

it('never explains fallback items and returns an empty why without a profile', () => {
  const cp = new ConvivialPersonalisation(
    { profile: siteProfile, data: { topics: labels } },
    'why-test',
    { persist: false },
  );
  const result = cp.rank(structuredClone(items), ['fast'], 3, flat);
  expect(result.items.every((i) => i.profile === 'fallback')).toBe(true);
  expect(result.why).toEqual([]);
  expect(result.profiles).toEqual({ fast: { used: false, confidence: 0 } });
  // Empty input and zero count keep the shape.
  expect(cp.rank([], ['fast'], 3)).toMatchObject({ items: [], why: [] });
  expect(cp.rank(structuredClone(items), ['fast'], 0)).toMatchObject({
    items: [],
    why: [],
    count: 0,
  });
});

it('resolves labels: profile.labels > labels_url > config.data > key', async () => {
  const fetchMock = vi.fn(async () => ({
    ok: true,
    json: async () => [
      { key: 'topic-ai', label: 'AI (remote)' },
      { key: 'audience-editors', label: 'Content editors' },
    ],
  }));
  vi.stubGlobal('fetch', fetchMock);
  const cp = new ConvivialPersonalisation(
    {
      profile: {
        ...siteProfile,
        labels: { 'topic-ai': 'AI (override)' },
        labels_url: '/labels.json',
      },
      data: { topics: labels },
    },
    'why-labels',
    { persist: false, now: () => 1000 },
  );
  await cp.labelsReady;
  expect(fetchMock).toHaveBeenCalledWith('/labels.json', {
    credentials: 'same-origin',
  });
  expect(cp.labels()).toMatchObject({
    'topic-ai': 'AI (override)', // profile.labels wins
    'audience-editors': 'Content editors', // labels_url beats config.data
    'topic-personalisation': 'Personalisation', // config.data
  });
  // Cached for a day under its own key; a second engine does not refetch.
  const cached = JSON.parse(
    localStorage.getItem('convivial_personalisation_labels'),
  );
  expect(cached).toMatchObject({ url: '/labels.json', at: 1000 });
  fetchMock.mockClear();
  const again = new ConvivialPersonalisation(
    { profile: { ...siteProfile, labels_url: '/labels.json' } },
    'why-labels-2',
    { persist: false, now: () => 1000 + 3600 },
  );
  expect(fetchMock).not.toHaveBeenCalled();
  expect(again.labels()['audience-editors']).toBe('Content editors');
  // Labels never change ranking: the config hash ignores them.
  expect(cp.profile.hash).toBe(again.profile.hash);
  vi.unstubAllGlobals();
});

it('exposes cp_why on the impression event', () => {
  const cp = engineWithProfile(items[0], {
    analytics: { datalayer: 'whyEvents' },
  });
  const result = cp.rank(structuredClone(items), ['fast'], 3, {
    ...flat,
    block: 'picks',
  });
  cp.impression('picks', result);
  expect(window.whyEvents[0]).toMatchObject({
    event: 'cp.block_impression',
    cp_block: 'picks',
    cp_count: 3,
    cp_why: result.why.join(','),
  });
  // Also from the recorded block when called without the result.
  cp.impression('picks');
  expect(window.whyEvents[1].cp_why).toBe(result.why.join(','));
  delete window.whyEvents;
});

it('lower-level rank() takes labels from ctx and defaults to keys', () => {
  const cfg = mergeProfileConfig(siteProfile);
  const vector = { v: vectorOf(items[0], cfg), confidence: 1 };
  const bare = rank(
    structuredClone(items),
    ['fast'],
    3,
    flat,
    { cfg, vectors: { fast: vector } },
  );
  expect(bare.why).toEqual(
    expect.arrayContaining(['audience-editors', 'topic-personalisation']),
  );
  const named = rank(
    structuredClone(items),
    ['fast'],
    3,
    flat,
    { cfg, vectors: { fast: vector }, labels },
  );
  expect(named.why).toEqual(
    expect.arrayContaining(['Editors', 'Personalisation']),
  );
  expect(named.why).not.toContain('audience-editors');
});
