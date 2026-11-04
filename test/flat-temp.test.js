import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import ConvivialPersonalisation from '../src/index';
import { Storage } from '../src/lib/storage';
import { vectorOf } from '../src/lib/vector';

beforeEach(() => {
  vi.useFakeTimers();
  localStorage.clear();
  document.head.innerHTML = '';
});

afterEach(() => {
  window.convivialPersonalisation?.erase();
  vi.clearAllTimers();
  vi.useRealTimers();
});

it.each(['temp', 'temp_list', 'legacy_list'])(
  '%s writes flat metadata strings in memory and localStorage',
  async (type) => {
    document.head.innerHTML =
      '<meta name="audience" content="audience-editors"><meta name="audience" content="audience-marketers, audience-site-owners"><meta name="topic" content="topic-procurement,topic-ai"><meta name="topic" content="topic-recommendations,topic-personalisation"><meta name="title" content="Planning recommendations"><meta name="nid" content="100">';
    const cfg = {
      profile: {
        fields: { title: 3, topics: 4, audiences: 4 },
        text_fields: ['title'],
      },
      profilers: {
        audiences: {
          sources: [{ type: 'meta', attribute_name: 'audience' }],
          processors: [{ type, storage_key: 'audiences' }],
          destinations: [
            {
              type: 'copy',
              storage_key: 'temp.audiences',
              target_key: 'audiences',
              target_location: { localstorage: true },
            },
          ],
        },
        topics: {
          sources: [{ type: 'meta', attribute_name: 'topic' }],
          processors: [{ type, storage_key: 'topics' }],
          destinations: [
            {
              type: 'copy',
              storage_key: 'temp.topics.value',
              target_key: 'topics',
              target_location: { localstorage: true },
            },
          ],
        },
        title: {
          sources: [{ type: 'meta', attribute_name: 'title' }],
          processors: [{ type: 'temp', storage_key: 'title' }],
        },
        id: {
          sources: [{ type: 'meta', attribute_name: 'nid' }],
          processors: [{ type: 'temp', storage_key: 'nid' }],
        },
        profiles: {
          processors: [{ type: 'profile', storage_key: 'fast' }],
        },
      },
    };
    const cp = new ConvivialPersonalisation(cfg, 'test');
    cp.profilerProcessor.legacy_list = (profiler, processor, values) => {
      cp._setValue('temp', processor.storage_key, { value: values });
    };
    await cp.collect();
    cp.fold();
    const expected = {
      audiences: 'audience-editors, audience-marketers, audience-site-owners',
      topics:
        'topic-procurement, topic-ai, topic-recommendations, topic-personalisation',
      title: 'Planning recommendations',
      nid: '100',
    };
    expect(cp.storage.data.temp).toEqual(expected);
    expect(
      JSON.parse(localStorage.getItem('convivial_personalisation')).test.temp,
    ).toEqual(expected);
    expect(cp.published('audiences')).toBe(expected.audiences);
    expect(cp.published('topics')).toBe(expected.topics.split(', ').join(','));
    expect(cp.currentItem()).toEqual({
      title: expected.title,
      audiences: expected.audiences,
      topics: expected.topics,
      id: '100',
    });
    const arrayItem = {
      title: expected.title,
      audiences: expected.audiences.split(', '),
      topics: expected.topics.split(', '),
    };
    expect(Array.from(cp.page.vector)).toEqual(
      Array.from(vectorOf(arrayItem, cfg.profile)),
    );
    const { items, why } = cp.rank([{ nid: '101', ...arrayItem }], ['fast'], 1);
    expect(items[0].profile).toBe('fast');
    expect(items[0].sim).toBeCloseTo(1);
    // Keys only: an unlabelled key is explained as itself; words as written.
    expect(why.length).toBeGreaterThan(0);
    expect(why.length).toBeLessThanOrEqual(3);
  },
);

it('supports flat and legacy reads without adding wrapper objects', () => {
  const cp = new ConvivialPersonalisation({}, 'test');
  cp._setValue('temp', 'topics', { value: [' one ', null, '', 'two, three'] });
  cp._setValue('temp', 'zero', 0);
  cp._setValue('temp', 'false', false);
  cp._setValue('temp', 'empty', '');
  expect(cp.storage.data.temp).toEqual({
    topics: 'one, two, three',
    zero: 0,
    false: false,
    empty: '',
  });
  expect(cp._getValue('temp.topics')).toBe('one, two, three');
  expect(cp._getValue('temp.topics.value')).toEqual([
    ' one ',
    null,
    '',
    'two, three',
  ]);
  expect(cp.storage.get(['temp', 'topics', 'value'])).toEqual([
    ' one ',
    null,
    '',
    'two, three',
  ]);
  expect(cp._getValue('temp.zero.value')).toBe(0);
  expect(cp._getValue('temp.false.value')).toBe(false);
  expect(cp._getValue('temp.empty.value')).toBe('');
  expect(cp._getValue('temp.missing.value')).toBeUndefined();
  cp._deleteValue('temp', 'topics');
  expect(cp._getValue('temp.topics.value')).toBeUndefined();
});

it('keeps only the key when flattening legacy object lists', () => {
  const cp = new ConvivialPersonalisation({}, 'test');
  const topics = [
    { id: 'housing', name: 'Public housing' },
    { key: 'transport', label: 'Transport planning' },
  ];
  cp.storage.set('temp', 'profile_topic', topics);
  expect(cp.storage.data.temp.profile_topic).toBe('housing, transport');
  expect(vectorOf(cp.currentItem())).toEqual(
    vectorOf({ profile_topic: ['housing', 'transport'] }),
  );
});

it('reads flat page ids, zero values and the exclude flag', async () => {
  const cp = new ConvivialPersonalisation(
    {
      profilers: {
        page: {
          sources: [{ type: 'test' }],
          processors: [{ type: 'profile', storage_key: 'fast' }],
        },
      },
    },
    'test',
  );
  cp.sources.test = () => {
    cp.storage.set('temp', 'nid', 0);
    cp.storage.set('temp', 'profile_topic', 'housing');
    cp.storage.set('temp', 'exclude', true);
  };
  await cp.collect();
  cp.fold();
  expect(cp.currentItem()).toEqual({
    id: '0',
    profile_topic: 'housing',
    exclude: true,
  });
  expect(cp.page.vector).toBeNull();
  expect(cp.profile.names()).toEqual([]);
  expect(cp.profile.seenCount()).toBe(0);
});

it.each(['temp.intent_satisfied', 'temp.intent_satisfied.value'])(
  'removes a satisfied intent through %s',
  async (path) => {
    document.head.innerHTML =
      '<meta name="intent_satisfied" content="intent-about">';
    const cp = new ConvivialPersonalisation(
      {
        profilers: {
          satisfied: {
            sources: [{ type: 'meta', attribute_name: 'intent_satisfied' }],
            processors: [
              {
                type: 'unstore_value',
                storage_key: 'intent_satisfied',
                storage_value: 'intent_recent',
                unstore_key: 'intent_recent',
              },
            ],
            destinations: [
              {
                type: 'remove',
                storage_keys: [path],
                target_location: { localstorage: true },
              },
            ],
          },
        },
      },
      'test',
    );
    cp.storage.set('store', 'intent_recent', {
      value: 'intent-about',
      expire: null,
    });
    cp.publish('intent_recent', 'intent-about');
    await cp.collect();
    expect(cp.storage.data.temp).toEqual({ intent_satisfied: 'intent_recent' });
    expect(cp.storage.data.store.intent_recent).toBeUndefined();
    expect(cp.published('intent_recent')).toBeNull();
  },
);

it('upgrades schema 2 without losing stored values or learned profiles', () => {
  const existing = {
    _schema: 2,
    temp: { topics: { value: ['stale', 'metadata'] } },
    store: { campaign: { value: 'campaign-test', expire: 2000 } },
    profiles: {
      fast: { v: [0.5, 0.5], n: 2, t: 1000, decay: 86400, cfg: 'existing' },
    },
    dimensions: { topics: { 'topic-ai': 3 } },
    seen: [{ id: '10', t: 1000 }],
    counters: { pageview: 3 },
  };
  localStorage.setItem(
    'convivial_personalisation',
    JSON.stringify({
      _version: 2,
      test: existing,
      other: { _schema: 2, counters: { pageview: 5 } },
    }),
  );
  const storage = new Storage('test', { now: () => 1000 });
  expect(storage.data).toMatchObject({ ...existing, _schema: 3, temp: {} });
  storage.set('temp', 'topics', ['topic-ai', 'topic-design']);
  storage.flush();
  const saved = JSON.parse(localStorage.getItem('convivial_personalisation'));
  expect(saved._version).toBe(3);
  expect(saved.test).toMatchObject({
    ...existing,
    _schema: 3,
    temp: { topics: 'topic-ai, topic-design' },
  });
  expect(saved.other).toEqual({ _schema: 2, counters: { pageview: 5 } });
});
