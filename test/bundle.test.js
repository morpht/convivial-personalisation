import { runInNewContext } from 'node:vm';
import { afterEach, describe, expect, it, vi } from 'vitest';
import ConvivialPersonalisation from '../src/index';
import bundle from '../dist/bundle.js?raw';
import initializer from './fixtures/drupal-initializer.js?raw';

afterEach(() => {
  window.convivialPersonalisation?.erase();
  localStorage.clear();
  document.head.innerHTML = '';
  vi.restoreAllMocks();
});

it('uses the library list processors and diagnostics through the real Drupal initializer', async () => {
  const debug = vi.spyOn(console, 'debug').mockImplementation(() => {});
  document.head.innerHTML =
    '<meta name="topics" content="housing, transport"><meta name="audiences" content="residents, business">';
  const config = {
    site: 'bundle-test',
    config: {
      debug: true,
      analytics: { events: true },
      profilers: {
        topics: {
          sources: [{ type: 'meta', attribute_name: 'topics' }],
          processors: [
            { type: 'temp_list', storage_key: 'profile_topic' },
            { type: 'store_list', storage_key: 'topics', ttl: 300 },
          ],
        },
        audiences: {
          sources: [{ type: 'meta', attribute_name: 'audiences' }],
          processors: [{ type: 'temp_list', storage_key: 'profile_audience' }],
        },
        fast: { processors: [{ type: 'profile', storage_key: 'fast' }] },
      },
    },
  };
  const context = {
    window,
    document,
    localStorage,
    navigator,
    console,
    setTimeout,
    Drupal: { behaviors: {} },
    drupalSettings: { convivialPersonalisation: config },
    once: (name) =>
      name === 'convivial-personalisation' ? [document.documentElement] : [],
    jQuery: () => ({ on: () => {} }),
  };
  runInNewContext(bundle, context);
  window.ConvivialPersonalisation = context.ConvivialPersonalisation;
  runInNewContext(initializer, context);
  context.Drupal.behaviors.convivialPersonalisation.attach(document, {});
  const cp = window.convivialPersonalisation;
  await cp.ready;
  cp.fold();
  expect(cp.analytics.events).toBe(false);
  expect(config.config.analytics.events).toBe(true);
  expect(typeof cp.processors.temp_list).toBe('function');
  expect(cp.storage.data.temp.profile_topic).toBe('housing, transport');
  expect(cp.storage.data.temp.profile_audience).toBe('residents, business');
  expect(
    JSON.parse(localStorage.getItem('convivial_personalisation'))['bundle-test']
      .store.topics.value,
  ).toBe('housing,transport');
  expect(
    JSON.parse(localStorage.getItem('convivial_personalisation'))['bundle-test']
      .temp,
  ).toEqual({
    profile_topic: 'housing, transport',
    profile_audience: 'residents, business',
  });
  expect(
    cp.rank([{ nid: 'one', profile_topic: 'housing' }], ['fast'], 1)[0].profile,
  ).toBe('fast');
  expect(debug.mock.calls.some((call) => call[2]?.event === 'rank.score')).toBe(
    true,
  );
});

it('supports registered processors without restoring temporary-value wrappers', async () => {
  document.head.innerHTML =
    '<meta name="topic" content="housing"><meta name="topic" content="transport">';
  const context = {
    window,
    document,
    localStorage,
    navigator,
    console,
    setTimeout,
  };
  runInNewContext(bundle, context);
  const cp = new context.ConvivialPersonalisation.default(
    {
      profilers: {
        topics: {
          sources: [{ type: 'meta', attribute_name: 'topic' }],
          processors: [{ type: 'temp_list', storage_key: 'profile_topic' }],
          destinations: [
            {
              type: 'copy',
              storage_key: 'temp.profile_topic.value',
              target_key: 'topics_json',
              stringify: true,
              target_location: { localstorage: 'localstorage', cookie: '0' },
            },
          ],
        },
        fast: { processors: [{ type: 'profile', storage_key: 'fast' }] },
      },
    },
    'legacy-test',
    {},
  );
  cp.use({
    processors: {
      temp_list(engine, profiler, processor, values) {
        engine.storage.set('temp', processor.storage_key, { value: values });
      },
    },
  });
  await cp.collect();
  cp.fold();
  expect(cp.version).toBe(ConvivialPersonalisation.VERSION);
  expect(cp.debug).toBe(false);
  expect(localStorage.getItem('topics_json')).toBe('["housing","transport"]');
  expect(
    JSON.parse(localStorage.getItem('convivial_personalisation'))['legacy-test']
      .temp,
  ).toEqual({ profile_topic: 'housing, transport' });
  expect(
    cp.rank(
      [{ nid: 'one', profile_topic: ['housing', 'transport'] }],
      ['fast'],
      1,
    )[0].sim,
  ).toBeCloseTo(1);
});

// The flat JSON view rows used in the rank integration example for ticket 48579.
const flatItems = [
  {
    nid: '467',
    title: 'Morpht selected for GovCMS DXP Panel',
    description:
      'Morpht is pleased to announce that we have been selected for the GovCMS Drupal Services Panel (DSP).',
    audiences: 'audience-editors, audience-marketers, audience-site-owners',
    topics:
      'topic-procurement, topic-ai, topic-recommendations, topic-personalisation',
    intent: '',
    url: '/news/announcements/morpht-selected-govcms-dxp-panel',
  },
  {
    nid: '466',
    title: 'GovCMS Mega Meetup 2023',
    description:
      'Morpht will be presenting on personalisation at the GovCMS Mega Meetup.',
    audiences: 'audience-editors, audience-marketers, audience-site-owners',
    topics: 'topic-procurement, topic-personalisation',
    intent: '',
    url: '/news/announcements/govcms-mega-meetup-2023',
  },
  {
    nid: '460',
    title: 'How personalisation works in Convivial for GovCMS',
    description:
      'An overview of how personalisation works in Convivial for GovCMS.',
    audiences: 'audience-editors, audience-marketers, audience-site-owners',
    topics: 'topic-personalisation',
    intent: 'intent-needs-ux',
    url: '/news/insights/how-personalisation-works-convivial-govcms',
  },
  {
    nid: '464',
    title: 'Better user and editor experience - exploring open data on GovCMS',
    description:
      'Julia Topliss, former Account Manager at Morpht, presents on work on the new IPEA website. ',
    audiences: 'audience-general',
    topics: 'topic-campaigns, topic-ia',
    intent: 'intent-needs-site',
    url: '/news/presentations/better-user-and-editor-experience-exploring-open-data-govcms',
  },
  {
    nid: '462',
    title: 'AI Powered Drupal: A new era for content creation and management',
    description:
      'A DrupalSouth video on extending Drupal with AI capabilities with the Augmentor module.',
    audiences: 'audience-editors',
    topics: 'topic-ai, topic-personalisation',
    intent: 'intent-needs-recommendations',
    url: '/news/presentations/ai-powered-drupal-new-era-content-creation-and-management',
  },
];

async function flatItemEngine(implementation) {
  let Engine = ConvivialPersonalisation;
  if (implementation === 'bundle') {
    const context = {
      window,
      document,
      localStorage,
      navigator,
      console,
      setTimeout,
    };
    runInNewContext(bundle, context);
    Engine = context.ConvivialPersonalisation.default;
  }
  const profile = {
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
    dims: 256,
    id_field: 'nid',
    stopwords: ['convivial', 'govcms'],
    keep_short: ['ai', 'ux'],
    synonyms: { 'information architecture': 'ia' },
  };
  const profilers = {};
  // Learn the AI example through the same meta -> temp -> profile pipeline.
  document.head.innerHTML = '';
  Object.entries(flatItems[4]).forEach(([field, value]) => {
    if (field === 'url') return;
    const meta = document.createElement('meta');
    meta.name = field;
    meta.content = value;
    document.head.append(meta);
    profilers[field] = {
      sources: [{ type: 'meta', attribute_name: field }],
      processors: [
        {
          type: ['topics', 'audiences'].includes(field) ? 'temp_list' : 'temp',
          storage_key: field,
        },
        ...(['topics', 'audiences', 'intent'].includes(field)
          ? [{ type: 'dimension', storage_key: field, normalize: true }]
          : []),
      ],
    };
  });
  profilers.profiles = {
    processors: [
      { type: 'profile', storage_key: 'fast', decay: 86400 },
      { type: 'profile', storage_key: 'slow', decay: 31536000 },
    ],
  };
  const cp = new Engine(
    { debug: true, profile, profilers },
    'flat-items-test',
    { persist: false, now: () => 1000 },
  );
  await cp.collect();
  cp.fold();
  return cp;
}

const comparisonOptions = {
  priorityWeight: 0,
  diversify: false,
  removeSeenItems: false,
  excludeCurrent: false,
};

describe.each(['source', 'bundle'])(
  'flat JSON rank contract (%s)',
  (implementation) => {
    it('ranks comma strings like legacy arrays and preserves the display fields', async () => {
      const logs = vi.spyOn(console, 'debug').mockImplementation(() => {});
      const cp = await flatItemEngine(implementation);
      for (const name of ['fast', 'slow']) {
        const rows = cp.rank(
          structuredClone(flatItems),
          [name],
          5,
          comparisonOptions,
        );
        const arrays = structuredClone(flatItems).map((item) => ({
          ...item,
          audiences: item.audiences.split(',').map((value) => value.trim()),
          topics: item.topics.split(',').map((value) => value.trim()),
        }));
        const legacy = cp.rank(arrays, [name], 5, comparisonOptions);
        expect(
          rows.map(({ id, sim, score, why }) => ({ id, sim, score, why })),
        ).toEqual(
          legacy.map(({ id, sim, score, why }) => ({ id, sim, score, why })),
        );
        expect(rows).toHaveLength(5);
        expect(rows[0]).toMatchObject({
          nid: '462',
          id: '462',
          profile: name,
          pos: 1,
        });
        expect(rows[0].sim).toBeCloseTo(1);
        expect(rows[0].why).toEqual(
          expect.arrayContaining([
            'topic-ai',
            'topic-personalisation',
            'audience-editors',
          ]),
        );
        rows.forEach((row) => {
          expect(row).toMatchObject(
            flatItems.find((item) => item.nid === row.nid),
          );
          expect(row).not.toHaveProperty('_v');
        });
      }
      const diagnostics = logs.mock.calls.map((call) => call[2]);
      expect(diagnostics).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            event: 'vector.field',
            candidate: '467',
            field: 'audiences',
            values: [
              'audience-editors',
              'audience-marketers',
              'audience-site-owners',
            ],
          }),
          expect.objectContaining({
            event: 'vector.field',
            candidate: '467',
            field: 'intent',
            values: [],
          }),
          expect.objectContaining({
            event: 'vector.token',
            candidate: '467',
            token: 'topics.topic-ai',
          }),
          expect.objectContaining({
            event: 'text.tokenize',
            candidate: '462',
            field: 'title',
            tokens: expect.arrayContaining(['ai', 'drupal']),
          }),
        ]),
      );
      expect(flatItems.every((item) => !('score' in item))).toBe(true);
    });

    it('applies the prior weight and retains source order for fallback', async () => {
      vi.spyOn(console, 'debug').mockImplementation(() => {});
      const cp = await flatItemEngine(implementation);
      const relevant = cp.rank(
        structuredClone(flatItems),
        ['fast'],
        1,
        comparisonOptions,
      );
      const ordered = cp.rank(structuredClone(flatItems), ['fast'], 1, {
        ...comparisonOptions,
        priorityWeight: 1,
      });
      expect(relevant[0].nid).toBe('462');
      expect(ordered[0]).toMatchObject({
        nid: '467',
        profile: 'fast',
        score: 1,
      });
      const fallback = cp.rank(
        structuredClone(flatItems),
        [],
        5,
        comparisonOptions,
      );
      expect(fallback.map((item) => item.nid)).toEqual([
        '467',
        '466',
        '460',
        '464',
        '462',
      ]);
      expect(
        fallback.every(
          (item) => item.profile === 'fallback' && item.sim === null,
        ),
      ).toBe(true);
      expect(
        cp.rank(structuredClone(flatItems), [], 5, {
          ...comparisonOptions,
          fallback: 'none',
        }),
      ).toEqual([]);
    });

    it.each([
      [{ p: 0 }, 0],
      [{ p: 1 }, 1],
      [{ priorityWeight: 0, p: 1 }, 0],
      [{ priorityWeight: 1, p: 0 }, 1],
      [{}, 0.2],
      [{ priorityWeight: 'invalid' }, 0.2],
      [{ priorityWeight: -1 }, 0],
      [{ priorityWeight: 2 }, 1],
    ])('resolves priority weight from %j to %s', async (options, weight) => {
      const logs = vi.spyOn(console, 'debug').mockImplementation(() => {});
      const cp = await flatItemEngine(implementation);
      const inputOptions = {
        diversify: false,
        removeSeenItems: false,
        excludeCurrent: false,
        ...options,
      };
      const before = structuredClone(inputOptions);
      const rows = cp.rank(
        structuredClone(flatItems),
        ['fast'],
        5,
        inputOptions,
      );
      const firstInView = rows.find((row) => row.nid === '467');
      expect(firstInView.profile).toBe('fast');
      expect(firstInView.score).toBeCloseTo(
        weight + (1 - weight) * firstInView.sim,
      );
      const diagnostics = logs.mock.calls.map((call) => call[2]);
      const resolved = diagnostics.find(
        (event) => event?.event === 'rank.options',
      );
      expect(resolved.options.priorityWeight).toBe(weight);
      expect(resolved.options).not.toHaveProperty('p');
      expect(inputOptions).toEqual(before);
    });

    it('filters flat rows by current ID, seen ID and individual comma-separated terms', async () => {
      const logs = vi.spyOn(console, 'debug').mockImplementation(() => {});
      const cp = await flatItemEngine(implementation);
      cp.profile.markSeen('466');
      cp.profile.suppress({
        scope: 'topics',
        key: 'topic-recommendations',
        mode: 'exclude',
      });
      const rows = cp.rank(structuredClone(flatItems), ['fast'], 5, {
        priorityWeight: 0,
        diversify: false,
      });
      expect(rows.map((item) => item.nid).sort()).toEqual(['460', '464']);
      expect(logs.mock.calls.map((call) => call[2])).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            event: 'rank.candidate.skipped',
            id: '462',
            reason: 'current page',
          }),
          expect.objectContaining({
            event: 'rank.candidate.skipped',
            id: '466',
            reason: 'seen',
          }),
          expect.objectContaining({
            event: 'rank.candidate.skipped',
            id: '467',
            reason: 'suppression',
          }),
        ]),
      );
    });
  },
);
