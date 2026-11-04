import { afterEach, beforeEach, expect, it } from 'vitest';
import ConvivialPersonalisation from '../src/index';
import { Storage } from '../src/lib/storage';

beforeEach(() => {
  localStorage.clear();
  document.head.innerHTML = '';
  document.cookie = 'intent=;path=/;Max-Age=0';
  Object.defineProperty(navigator, 'globalPrivacyControl', {
    configurable: true,
    value: undefined,
  });
});

afterEach(() => {
  window.convivialPersonalisation?.erase();
});

it('cookie-only cleanup preserves an intent published in memory without consent', () => {
  const cp = new ConvivialPersonalisation(
    {
      privacy: { consent_default: 'denied' },
    },
    'test',
  );
  cp.publish('intent', 'intent-needs-site');
  document.cookie = 'intent=old-intent;path=/';
  cp.unpublish('intent', { localstorage: false, cookie: true });
  expect(cp.published('intent')).toBe('intent-needs-site');
  expect(document.cookie).not.toContain('intent=');
  expect(localStorage.getItem('intent')).toBeNull();
  cp.unpublish('intent', { localstorage: true });
  expect(cp.published('intent')).toBeNull();
});

it('explains a block with labels from config.data and leaves fallback unexplained', () => {
  const cp = new ConvivialPersonalisation(
    { data: { topics: { 'topic-design': 'Design' } } },
    'test',
  );
  const items = [{ nid: '1', profile_topic: ['topic-design'] }];
  // Fallback only: nothing was picked by a profile, so there is nothing to explain.
  const fallback = cp.rank(structuredClone(items), [], 1);
  expect(fallback.items[0]).toMatchObject({ id: '1', profile: 'fallback' });
  expect(fallback.items[0]).not.toHaveProperty('why');
  expect(fallback.why).toEqual([]);
  // A learned profile: the key that matched is shown with its label.
  cp.profile.fold(
    'fast',
    0,
    ConvivialPersonalisation.vector.vectorOf(items[0], cp.profileConfig),
  );
  const picked = cp.rank(structuredClone(items), ['fast'], 1);
  expect(picked.items[0]).toMatchObject({ id: '1', profile: 'fast' });
  expect(picked.why).toEqual(['Design']);
  expect(picked.why_detail[0]).toMatchObject({
    term: 'profile_topic.topic-design',
    label: 'Design',
    field: 'profile_topic',
    kind: 'key',
    items: ['1'],
  });
  expect(picked.profiles).toEqual({ fast: { used: true, confidence: 1 } });
  expect(cp.snapshot().blocks[0].why).toEqual(['Design']);
});

it('prefers profile.labels over config.data and shows unlabelled keys as keys', () => {
  const cp = new ConvivialPersonalisation(
    {
      data: { topics: { 'topic-design': 'Design' } },
      profile: { labels: { 'topic-design': 'Service design' } },
    },
    'test',
  );
  const item = { nid: '1', profile_topic: ['topic-design', 'topic-housing'] };
  cp.profile.fold(
    'fast',
    0,
    ConvivialPersonalisation.vector.vectorOf(item, cp.profileConfig),
  );
  const { why } = cp.rank([structuredClone(item)], ['fast'], 1);
  expect(why).toEqual(
    expect.arrayContaining(['Service design', 'topic-housing']),
  );
  expect(cp.labels()).toEqual({ 'topic-design': 'Service design' });
});

it.each([['one'], ['one', 'two']])(
  'temp_list keeps every value as a comma-separated string: %j',
  async (...values) => {
    const cp = new ConvivialPersonalisation(
      {
        profilers: {
          metadata: {
            sources: [{ type: 'test_values' }],
            processors: [{ type: 'temp_list', storage_key: 'profile_topic' }],
          },
        },
      },
      'test',
    );
    cp.use({
      sources: {
        test_values: (engine, profiler, source, out) => out.push(...values),
      },
    });
    await cp.collect();
    expect(cp.storage.data.temp.profile_topic).toBe(values.join(', '));
    cp.storage.flush();
    expect(
      JSON.parse(localStorage.getItem('convivial_personalisation')).test.temp,
    ).toEqual({ profile_topic: values.join(', ') });
  },
);

it('temp resets on collection while stored lists persist until their TTL expires', async () => {
  let now = 1000;
  let values = ['one', 'two'];
  const cp = new ConvivialPersonalisation(
    {
      profilers: {
        metadata: {
          sources: [{ type: 'test_values' }],
          processors: [
            { type: 'temp', storage_key: 'profile_title' },
            { type: 'temp_list', storage_key: 'profile_topic' },
            { type: 'store_list', storage_key: 'topics', ttl: 300 },
          ],
        },
      },
    },
    'test',
    { now: () => now },
  );
  cp.use({
    sources: {
      test_values: (engine, profiler, source, out) => out.push(...values),
    },
  });
  await cp.collect();
  expect(cp.storage.data.temp.profile_title).toBe('one, two');
  expect(cp.storage.data.store.topics.expire).toBe(1300);
  cp.storage.flush();
  expect(
    JSON.parse(localStorage.getItem('convivial_personalisation')).test.store
      .topics.value,
  ).toBe('one,two');
  values = [];
  now = 1100;
  await cp.collect();
  expect(cp.storage.data.temp).toEqual({});
  expect(cp.storage.data.store.topics.value).toBe('one,two');
  cp.storage.flush();
  expect(
    JSON.parse(localStorage.getItem('convivial_personalisation')).test.temp,
  ).toEqual({});
  now = 1301;
  await cp.collect();
  expect(cp.storage.data.store.topics).toBeUndefined();
});

it('persists direct temporary-value changes and deletions', () => {
  const cp = new ConvivialPersonalisation({}, 'test');
  cp._setValue('temp', 'profile_title', { value: 'Current title' });
  cp.storage.flush();
  expect(
    JSON.parse(localStorage.getItem('convivial_personalisation')).test.temp,
  ).toEqual({ profile_title: 'Current title' });

  cp._setValue('temp', 'profile_title', { value: 'Updated title' });
  cp.storage.flush();
  expect(
    JSON.parse(localStorage.getItem('convivial_personalisation')).test.temp,
  ).toEqual({ profile_title: 'Updated title' });

  cp._deleteValue('temp', 'profile_title');
  cp.storage.flush();
  expect(
    JSON.parse(localStorage.getItem('convivial_personalisation')).test.temp,
  ).toEqual({});
});

it.each([
  ['denied', 'denied', false],
  ['gpc', 'granted', true],
])('does not persist temp when consent is %s', (state, consent, gpc) => {
  Object.defineProperty(navigator, 'globalPrivacyControl', { value: gpc });
  const cp = new ConvivialPersonalisation(
    { privacy: { consent_default: consent } },
    'test',
  );
  cp.consent(consent);
  cp._setValue('temp', 'profile_title', { value: 'Current title' });
  cp.storage.flush();
  expect(cp.consentState).toBe(state);
  expect(cp.storage.data.temp.profile_title).toBe('Current title');
  expect(localStorage.getItem('convivial_personalisation')).toBeNull();
});

it('removes persisted temporary values when consent is withdrawn', () => {
  const cp = new ConvivialPersonalisation({}, 'test');
  cp._setValue('temp', 'profile_title', { value: 'Current title' });
  cp.storage.flush();
  expect(localStorage.getItem('convivial_personalisation')).not.toBeNull();

  cp.consent('denied');
  expect(localStorage.getItem('convivial_personalisation')).toBeNull();
});

it('store_list preserves the legacy one-year meaning of a TTL of minus one', async () => {
  const cp = new ConvivialPersonalisation(
    {
      profilers: {
        metadata: {
          sources: [{ type: 'test_values' }],
          processors: [{ type: 'store_list', storage_key: 'topics', ttl: -1 }],
        },
      },
    },
    'test',
    { now: () => 1000 },
  );
  cp.use({
    sources: {
      test_values: (engine, profiler, source, values) => values.push('one'),
    },
  });
  await cp.collect();
  expect(cp.storage.data.store.topics).toEqual({
    value: 'one',
    expire: 1000 + 31536000,
  });
});

it.each(['temp', 'temp_list', 'legacy_list'])(
  'preserves legacy JSON array destinations with %s and flat temp storage',
  async (type) => {
    document.head.innerHTML =
      '<meta name="topic" content="housing"><meta name="topic" content="transport">';
    const cp = new ConvivialPersonalisation(
      {
        profilers: {
          topics: {
            sources: [{ type: 'meta', attribute_name: 'topic' }],
            processors: [{ type, storage_key: 'profile_topic' }],
            destinations: [
              {
                type: 'copy',
                storage_key: 'temp.profile_topic.value',
                target_key: 'old_json',
                stringify: true,
                target_location: { localstorage: true },
              },
              {
                type: 'copy',
                storage_key: 'temp.profile_topic',
                target_key: 'new_json',
                stringify: true,
                target_location: { localstorage: true },
              },
              {
                type: 'copy',
                storage_key: 'temp.profile_topic.value.1',
                target_key: 'second',
                target_location: { localstorage: true },
              },
            ],
          },
        },
      },
      'test',
    );
    cp.profilerProcessor.legacy_list = function (profiler, processor, values) {
      this._setValue('temp', processor.storage_key, { value: values });
    };
    await cp.collect();
    cp.storage.flush();
    expect(JSON.parse(cp.published('old_json'))).toEqual([
      'housing',
      'transport',
    ]);
    expect(JSON.parse(cp.published('new_json'))).toBe('housing, transport');
    expect(cp.published('second')).toBe('transport');
    expect(cp.currentItem().profile_topic).toBe('housing, transport');
    expect(
      JSON.parse(localStorage.getItem('convivial_personalisation')).test.temp,
    ).toEqual({ profile_topic: 'housing, transport' });
  },
);

it('preserves legacy scalar types and punctuation without guessing arrays', () => {
  const cp = new ConvivialPersonalisation({}, 'test');
  for (const value of ['Housing, transport', '', false, 0, null, undefined]) {
    cp._setValue('temp', 'title', { value: { value } });
    expect(cp._getValue('temp.title.value')).toBe(value);
    expect(cp.storage.get('temp.title')).toBe(value);
  }
  cp._setValue('temp', 'topics', { value: ['housing'] });
  expect(cp._getValue('temp.topics.value')).toEqual(['housing']);
  expect(cp.storage.get('temp.topics')).toBe('housing');
  expect(cp._getValue('temp.topics.value.__proto__')).toBeUndefined();
  expect(cp._getValue('temp.__proto__.value')).toBeUndefined();
});

it('ignores circular legacy wrappers without preventing later metadata writes', () => {
  const cp = new ConvivialPersonalisation({}, 'test');
  const wrapped = {};
  wrapped.value = wrapped;
  cp._setValue('temp', 'broken', wrapped);
  cp._setValue('temp', 'title', { value: 'Current title' });
  expect(cp._getValue('temp.broken.value')).toBeUndefined();
  cp.storage.flush();
  expect(
    JSON.parse(localStorage.getItem('convivial_personalisation')).test.temp,
  ).toEqual({ title: 'Current title' });
});

it('normalizes direct legacy writes and array mutations before profiling and persistence', async () => {
  const cp = new ConvivialPersonalisation(
    {
      profilers: {
        legacy: { processors: [{ type: 'legacy' }] },
        fast: { processors: [{ type: 'profile', storage_key: 'fast' }] },
      },
    },
    'test',
  );
  cp.profilerProcessor.legacy = function () {
    this.storage.data.temp.profile_topic = { value: { value: ['housing'] } };
    this._getValue('temp.profile_topic.value').push('transport');
  };
  await cp.collect();
  cp.fold();
  expect(cp.currentItem().profile_topic).toBe('housing, transport');
  expect(cp.storage.data.temp.profile_topic).toBe('housing, transport');
  expect(
    cp.rank(
      [{ nid: '1', profile_topic: ['housing', 'transport'] }],
      ['fast'],
      1,
    ).items[0].sim,
  ).toBeCloseTo(1);
  cp._getValue('temp.profile_topic.value').push('parks');
  cp.storage.flush();
  expect(
    JSON.parse(localStorage.getItem('convivial_personalisation')).test.temp,
  ).toEqual({ profile_topic: 'housing, transport, parks' });
});

it('discards stale compatibility values on deletion, replacement, recollection and erase', async () => {
  const cp = new ConvivialPersonalisation({}, 'test');
  const write = () =>
    cp._setValue('temp', 'topics', { value: ['housing', 'transport'] });
  write();
  cp._deleteValue('temp', 'topics');
  expect(cp._getValue('temp.topics.value')).toBeUndefined();
  write();
  cp.storage.data.temp.topics = 'new';
  expect(cp._getValue('temp.topics.value')).toBe('new');
  write();
  await cp.collect();
  expect(cp._getValue('temp.topics.value')).toBeUndefined();
  write();
  cp.erase();
  expect(cp._getValue('temp.topics.value')).toBeUndefined();
  cp.storage.data.temp.topics = 'housing, transport';
  expect(cp._getValue('temp.topics.value')).toBe('housing, transport');
});

it.each([1, 2])(
  'migrates schema %i while preserving visitor state and recollecting temp',
  (schema) => {
    const existing = {
      ...(schema === 2 ? { _schema: schema } : {}),
      store: { topics: { value: ['housing', 'transport'], expire: 2000 } },
      counters: { pageview: 4 },
      dimensions: { topic: { housing: 3 } },
      profiles: { fast: { v: [1, 0], n: 1, t: 1000 } },
      temp: { profile_topic: { value: ['stale'] } },
    };
    localStorage.setItem(
      'convivial_personalisation',
      JSON.stringify({ test: existing }),
    );
    const storage = new Storage('test', { now: () => 1000 });
    expect(storage.data).toMatchObject({ ...existing, _schema: 3, temp: {} });
    storage.flush();
    expect(
      JSON.parse(localStorage.getItem('convivial_personalisation')).test,
    ).toMatchObject({ ...existing, _schema: 3, temp: {} });
  },
);

it('does not overwrite a newer storage schema when an older bundle is loaded', () => {
  const saved = JSON.stringify({
    test: { _schema: 99, temp: { topics: 'future' } },
  });
  localStorage.setItem('convivial_personalisation', saved);
  const storage = new Storage('test');
  storage.set('temp', 'topics', { value: ['housing'] });
  expect(storage.flush()).toBe(false);
  expect(localStorage.getItem('convivial_personalisation')).toBe(saved);
});
