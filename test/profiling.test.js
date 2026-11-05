import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import ConvivialPersonalisation from '../src/index';
import { isExcluded, termKeys, vectorOf } from '../src/lib/vector';
import { tokenize } from '../src/lib/text';

let logs;

beforeEach(() => {
  vi.useFakeTimers();
  localStorage.clear();
  document.head.innerHTML = '';
  logs = vi.spyOn(console, 'debug').mockImplementation(() => {});
});

afterEach(() => {
  window.convivialPersonalisation?.erase();
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

function engine(config = {}, options = {}) {
  return new ConvivialPersonalisation(config, 'test', {
    persist: false,
    now: () => 1000,
    ...options,
  });
}

function events(name) {
  return logs.mock.calls
    .filter((call) => call[2]?.event === name)
    .map((call) => call[2]);
}

function metadataEngine(config = {}, options = {}) {
  return engine(
    {
      profilers: {
        topics: {
          sources: [{ type: 'meta', attribute_name: 'topics' }],
          processors: [
            { type: 'temp_list', storage_key: 'profile_topic' },
            { type: 'store_list', storage_key: 'topics', ttl: 300 },
            { type: 'dimension', storage_key: 'topic', normalize: true },
          ],
          destinations: [
            {
              type: 'copy',
              storage_key: 'temp.profile_topic.value',
              target_key: 'topics',
              target_location: { localstorage: true },
            },
          ],
        },
        audiences: {
          sources: [{ type: 'meta', attribute_name: 'audiences' }],
          processors: [{ type: 'temp_list', storage_key: 'profile_audience' }],
        },
        title: {
          sources: [{ type: 'meta', attribute_name: 'title' }],
          processors: [{ type: 'temp', storage_key: 'profile_title' }],
        },
        fast: {
          processors: [
            { type: 'profile', storage_key: 'fast', decay: 100, weight: 2 },
          ],
        },
      },
      ...config,
    },
    options,
  );
}

it.each([
  [['one'], 'one'],
  [['one', 'two'], 'one,two'],
  [[' one, two ', ',three,,', null, undefined, ''], 'one,two,three'],
  [['Public housing, Small business'], 'Public housing,Small business'],
  [[0, 1], '0,1'],
])(
  'stores and publishes comma-separated lists from %j',
  async (values, expected) => {
    const cp = metadataEngine();
    cp.sources.meta = (instance, profiler, source, out) => out.push(...values);
    await cp.collect();
    const flat = expected.split(',').join(', ');
    expect(cp.storage.data.temp.profile_topic).toBe(flat);
    expect(cp.storage.data.temp.profile_audience).toBe(flat);
    expect(cp.storage.data.store.topics).toEqual({
      value: expected,
      expire: 1300,
    });
    expect(cp.published('topics')).toBe(expected);
  },
);

it('does not write empty lists or overwrite a stored list with empty input', async () => {
  const cp = metadataEngine();
  cp.storage.set('store', 'topics', { value: 'existing', expire: 1300 });
  cp.sources.meta = (instance, profiler, source, out) =>
    out.push(' , , ', null);
  await cp.collect();
  expect(cp.storage.data.temp.profile_topic).toBeUndefined();
  expect(cp.storage.data.store.topics.value).toBe('existing');
});

it('builds the same page and candidate vectors from comma lists and legacy arrays', async () => {
  document.head.innerHTML =
    '<meta name="topics" content=" housing, transport, "><meta name="topics" content="parks"><meta name="audiences" content="residents, business"><meta name="title" content="Public housing, transport planning">';
  const cp = metadataEngine({
    data: {
      topics: {
        housing: 'Public housing',
        transport: 'Transport planning',
        parks: 'Public parks',
      },
      audiences: { residents: 'Local residents', business: 'Small business' },
    },
  });
  await cp.collect();
  const arrayItem = {
    profile_topic: ['housing', 'transport', 'parks'],
    profile_audience: ['residents', 'business'],
    profile_title: 'Public housing, transport planning',
  };
  expect(cp.currentItem().profile_topic).toBe(
    arrayItem.profile_topic.join(', '),
  );
  expect(Array.from(cp.page.vector)).toEqual(
    Array.from(vectorOf(arrayItem, cp.profileConfig)),
  );
  expect(termKeys(cp.currentItem(), cp.profileConfig)).toEqual([
    'profile_topic.housing',
    'profile_topic.transport',
    'profile_topic.parks',
    'profile_audience.residents',
    'profile_audience.business',
  ]);
  expect(cp.profile.dimension('topic')).toEqual({
    housing: 1 / 3,
    transport: 1 / 3,
    parks: 1 / 3,
  });
  cp.fold();
  const { items: rows, why, why_detail } = cp.rank(
    [
      { nid: 'one', ...cp.currentItem() },
      { nid: 'two', ...arrayItem },
    ],
    ['fast'],
    2,
    { p: 0, diversify: false, whyMax: 10 },
  );
  expect(rows.map((row) => row.sim)).toEqual([1, 1]);
  expect(rows[0]).not.toHaveProperty('why');
  // Both rows carry every term, so every term is shared and labelled from config.data.
  expect(why).toEqual(
    expect.arrayContaining([
      'Public housing',
      'Transport planning',
      'Public parks',
      'Local residents',
      'Small business',
    ]),
  );
  // Keys (weight 4) outrank the title words (weight 3).
  expect(why_detail[0].kind).toBe('key');
  expect(why_detail.every((d) => d.items.length === 2)).toBe(true);
  // Shares are fractions of the block's total similarity (capped and
  // de-duplicated by label, so they sum to at most 1).
  const total = why_detail.map((d) => d.share).reduce((a, b) => a + b);
  expect(total).toBeGreaterThan(0.8);
  expect(total).toBeLessThanOrEqual(1);
  // The title's "public housing" bigram de-duplicates against the key label.
  expect(why.filter((w) => w.toLowerCase() === 'public housing')).toHaveLength(
    1,
  );
});

it('splits words at commas and whitespace while preserving text bigrams', () => {
  expect(tokenize('Public housing,\ttransport\nplanning')).toEqual({
    tokens: ['public', 'hous', 'transport', 'plan'],
    bigrams: ['public_hous', 'hous_transport', 'transport_plan'],
    surface: {
      public: 'public',
      hous: 'housing',
      transport: 'transport',
      plan: 'planning',
      public_hous: 'public housing',
      hous_transport: 'housing transport',
      transport_plan: 'transport planning',
    },
  });
  expect(termKeys({ profile_topic: 'Public housing, Small business' })).toEqual(
    ['profile_topic.public housing', 'profile_topic.small business'],
  );
});

it('applies exclusions and suppressions to individual terms inside comma lists', () => {
  const item = { nid: 'one', profile_topic: 'housing,transport' };
  expect(
    isExcluded(item, { exclude: { terms: ['profile_topic.transport'] } }),
  ).toBe(true);
  const cp = engine();
  cp.profile.suppress({
    scope: 'profile_topic',
    key: 'transport',
    mode: 'exclude',
    ttl: 300,
  });
  expect(cp.rank([item], [], 1).items).toEqual([]);
});

it.each([
  [1, 8, 'topic'],
  [8, 1, 'title'],
])(
  'field weights %s/%s change the first recommendation to %s',
  (titleWeight, topicWeight, expected) => {
    const cp = engine({
      profile: {
        fields: { profile_title: titleWeight, profile_topic: topicWeight },
      },
    });
    cp.profile.fold(
      'fast',
      0,
      vectorOf(
        { profile_title: 'housing', profile_topic: 'transport' },
        cp.profileConfig,
      ),
    );
    const { items: rows, why } = cp.rank(
      [
        { nid: 'title', profile_title: 'housing' },
        { nid: 'topic', profile_topic: 'transport' },
      ],
      ['fast'],
      2,
      { p: 0, diversify: false },
    );
    expect(rows[0].id).toBe(expected);
    expect(rows[0].score).toBeGreaterThan(rows[1].score);
    // The heavier field's term leads the block explanation.
    expect(why[0]).toBe(expected === 'topic' ? 'transport' : 'housing');
  },
);

it('engagement weight and decay change the profile and recommendation order', () => {
  let now = 1000;
  const cp = engine({ debug: true }, { now: () => now });
  const housing = vectorOf({ profile_topic: 'housing' });
  const transport = vectorOf({ profile_topic: 'transport' });
  cp.profile.fold('fast', 100, housing, 1);
  now += 100;
  cp.profile.fold('fast', 100, transport, 2);
  const { items: rows } = cp.rank(
    [
      { nid: 'housing', profile_topic: 'housing' },
      { nid: 'transport', profile_topic: 'transport' },
    ],
    ['fast'],
    2,
    { p: 0, diversify: false },
  );
  expect(rows[0].id).toBe('transport');
  const fold = events('profile.fold.start').at(-1);
  expect(fold).toMatchObject({ weight: 2, decayFactor: 0.5, age: 100 });
  const result = events('profile.fold.complete').at(-1);
  expect(result.vector).toEqual(
    Array.from(housing, (v, i) => v * 0.5 + 2 * transport[i]),
  );
  expect(fold.before).toEqual(Array.from(housing));
});

it('logs the full metadata, token, vector, fold and scoring flow as snapshots', async () => {
  document.head.innerHTML =
    '<meta name="topics" content="housing,transport"><meta name="audiences" content="residents"><meta name="title" content="Public housing">';
  const cp = metadataEngine({ debug: true });
  await cp.collect();
  cp.fold();
  const {
    items: [row],
    why,
  } = cp.rank([{ nid: 'one', profile_topic: 'housing' }], ['fast'], 1, {
    diversify: false,
  });
  expect(logs.mock.calls.map((call) => call[2]?.event)).toEqual(
    expect.arrayContaining([
      'engine.init',
      'collect.start',
      'source.start',
      'source.complete',
      'plugin.start',
      'plugin.complete',
      'publish',
      'page.item',
      'text.tokenize',
      'vector.field',
      'vector.token',
      'vector.complete',
      'collect.complete',
      'profile.fold.start',
      'profile.fold.complete',
      'fold.complete',
      'rank.options',
      'rank.allocation',
      'rank.similarity',
      'rank.score',
      'rank.why',
      'rank.complete',
    ]),
  );
  expect(why).toEqual(['housing']);
  expect(events('rank.why')[0]).toMatchObject({ why: ['housing'], kept: 1 });
  expect(events('rank.complete')[0].message).toContain('why = ["housing"]');
  expect(
    events('vector.field').find((event) => event.field === 'profile_topic'),
  ).toMatchObject({
    values: ['housing', 'transport'],
    weight: 4,
  });
  expect(events('text.tokenize')[0]).toMatchObject({
    input: 'Public housing',
    raw: ['public', 'housing'],
    tokens: ['public', 'hous'],
  });
  const token = events('vector.token').find(
    (event) => event.token === 'profile_topic.housing',
  );
  expect(Math.abs(token.contribution)).toBe(4);
  const vector = events('vector.complete')[0];
  expect(Math.hypot(...vector.vector)).toBeCloseTo(1);
  const score = events('rank.score')[0];
  expect(score.score).toBeCloseTo(
    (0.2 * score.prior + 0.8 * score.sim) * score.demotion,
  );
  expect(score.score).toBe(row.score);
  const tempSnapshot = events('collect.complete')[0].temp;
  cp.storage.data.temp.profile_topic = 'changed';
  expect(tempSnapshot.profile_topic).toBe('housing, transport');
});

it('keeps diagnostics off by default and supports explicit and runtime disabling', async () => {
  const cp = metadataEngine({ debug: true }, { debug: false });
  document.head.innerHTML = '<meta name="topics" content="housing,transport">';
  await cp.collect();
  cp.fold();
  const candidates = () => [{ nid: 'one', profile_topic: 'housing' }];
  const quiet = cp.rank(candidates(), ['fast'], 1);
  const factory = vi.fn();
  cp.trace('test', factory);
  expect(factory).not.toHaveBeenCalled();
  expect(logs).not.toHaveBeenCalled();
  cp.debug = true;
  const verbose = cp.rank(candidates(), ['fast'], 1);
  expect(verbose).toEqual(quiet);
  expect(logs).toHaveBeenCalled();
  cp.debug = false;
  logs.mockClear();
  cp.rank(candidates(), ['fast'], 1);
  expect(logs).not.toHaveBeenCalled();
  expect(engine().debug).toBe(false);
});

it('diagnostics cannot break profiling when console logging fails', async () => {
  logs.mockImplementation(() => {
    throw new Error('Console unavailable');
  });
  document.head.innerHTML = '<meta name="topics" content="housing,transport">';
  const cp = metadataEngine({ debug: true });
  await cp.collect();
  cp.fold();
  expect(cp.storage.data.temp.profile_topic).toBe('housing, transport');
  expect(
    cp.rank([{ nid: 'one', profile_topic: 'housing' }], ['fast'], 1).items[0]
      .profile,
  ).toBe('fast');
});

it('waits for async sources before logging and processing their comma lists', async () => {
  const cp = metadataEngine({ debug: true });
  cp.sources.meta = async (instance, profiler, source, values) => {
    await Promise.resolve();
    values.push('housing,transport');
  };
  await cp.collect();
  const names = logs.mock.calls.map((call) => call[2]?.event);
  expect(names.indexOf('source.complete')).toBeLessThan(
    names.indexOf('plugin.start'),
  );
  expect(events('source.complete')[0].accumulatedValues).toEqual([
    'housing,transport',
  ]);
  expect(cp.storage.data.temp.profile_topic).toBe('housing, transport');
});

it('uses and logs profiler execution weights only when weight ordering is configured', async () => {
  const cp = engine({
    debug: true,
    order: 'weight',
    profilers: {
      last: { weight: 10 },
      first: { weight: -10 },
      disabled: { status: false, weight: -20 },
    },
  });
  await cp.collect();
  expect(events('profiler.start').map((event) => event.profiler)).toEqual([
    'first',
    'last',
  ]);
  expect(events('collect.start')[0]).toMatchObject({
    order: 'weight',
    disabled: ['disabled'],
  });
  logs.mockClear();
  cp.config.order = 'authored';
  await cp.collect();
  expect(events('profiler.start').map((event) => event.profiler)).toEqual([
    'last',
    'first',
  ]);
  expect(events('collect.order')).toHaveLength(1);
});

it('logs candidate filtering, demotion and fallback decisions', () => {
  const cp = engine({ debug: true });
  cp.storage.set('temp', 'nid', { value: 'current' });
  cp.profile.markSeen('seen');
  cp.profile.suppress({
    scope: 'nid',
    key: 'blocked',
    mode: 'exclude',
    ttl: 300,
  });
  cp.profile.suppress({
    scope: 'nid',
    key: 'demoted',
    mode: 'demote',
    factor: 0.25,
    ttl: 300,
  });
  cp.rank(
    ['current', 'seen', 'blocked', 'demoted', 'normal'].map((nid) => ({ nid })),
    [],
    2,
    { prior: 'order' },
  );
  expect(
    events('rank.candidate.skipped').map(({ id, reason }) => ({ id, reason })),
  ).toEqual([
    { id: 'current', reason: 'current page' },
    { id: 'seen', reason: 'seen' },
    { id: 'blocked', reason: 'suppression' },
  ]);
  expect(
    events('rank.fallback').find((event) => event.id === 'demoted'),
  ).toMatchObject({ demotion: 0.25, score: 0.0625 });
  expect(events('rank.complete')[0].items).toHaveLength(2);
});

it('tells a numbered story from comma parsing through final selection', async () => {
  document.head.innerHTML =
    '<meta name="topics" content="housing, transport"><meta name="title" content="Public housing">';
  const cp = metadataEngine({ debug: true });
  await cp.collect();
  cp.fold();
  cp.rank([{ nid: 'one', profile_topic: 'housing' }], ['fast'], 1, {
    block: 'recommendations',
  });
  const records = logs.mock.calls.map((call) => call[2]);
  expect(records.map((record) => record.sequence)).toEqual(
    records.map((record, i) => i + 1),
  );
  records.forEach((record, i) => {
    expect(record.message.length).toBeGreaterThan(30);
    expect(logs.mock.calls[i][1]).toContain(`step ${record.sequence}`);
    expect(logs.mock.calls[i][1]).toContain(record.message);
  });
  expect(events('list.processed')[0].message).toContain('produced 2 items');
  expect(events('list.processed')[0].stored).toBe('housing, transport');
  expect(
    events('vector.field').find((e) => e.field === 'profile_topic').message,
  ).toContain('spaces inside an item are preserved');
  expect(
    events('vector.token').find((e) => e.token === 'profile_topic.housing')
      .message,
  ).toContain('weight 4');
  expect(events('vector.token')[0].message).toContain('not negative interest');
  expect(events('vector.complete')[0].message).toContain(
    'relative field weights',
  );
  expect(events('profile.fold.start')[0].message).toContain(
    'engagement weight 2',
  );
  expect(events('rank.complete')[0].message).toContain('Returning 1 of 1');
  expect(events('rank.complete')[0]).toMatchObject({
    block: 'recommendations',
    ranking: 1,
  });
  const rankEvents = records.filter((record) => record.ranking === 1);
  expect(rankEvents[0].event).toBe('rank.start');
  expect(rankEvents.at(-1).event).toBe('rank.complete');
  cp.rank([], ['fast'], 1, { block: 'recommendations' });
  expect(events('rank.complete').at(-1).ranking).toBe(2);
});

it('explains token removal, short-word exceptions, synonyms and stemming', () => {
  const cp = engine({ debug: true });
  const cfg = {
    stopwords: ['portal'],
    keep_short: ['ai'],
    synonyms: { 'public housing': 'homes' },
    bigrams: false,
  };
  const input = 'Public housing, and portal 123 ux AI planning';
  const quiet = tokenize(input, cfg);
  const traced = tokenize(input, cfg, (event, details) =>
    cp.trace(event, { field: 'title', ...details }),
  );
  expect(traced).toEqual(quiet);
  const record = events('text.tokenize')[0];
  expect(record.tokens).toEqual(['homes', 'ai', 'plan']);
  expect(record.discarded).toEqual([
    { word: 'and', reason: 'English stopword' },
    { word: 'portal', reason: 'site stopword' },
    { word: '123', reason: 'number, not a year' },
    {
      word: 'ux',
      reason: 'short word without a keep_short or synonym exception',
    },
  ]);
  expect(record.message).toContain('Synonyms changed');
  expect(record.message).toContain('Adjacent-word pairs enabled = false');
  expect(record.bigrams).toEqual([]);
});

it('explains why passing similarity still does not guarantee selection', () => {
  const cp = engine({ debug: true });
  cp.profile.fold('fast', 100, vectorOf({ profile_topic: 'housing' }));
  const { items: rows } = cp.rank(
    [
      { nid: 'first', profile_topic: 'housing' },
      { nid: 'second', profile_topic: 'housing' },
      { nid: 'unrelated', profile_topic: 'transport' },
    ],
    ['fast'],
    1,
    { priorityWeight: 0.25, minSim: 0.5, diversify: false },
  );
  expect(rows.map((row) => row.id)).toEqual(['first']);
  expect(
    events('rank.similarity').find((e) => e.id === 'unrelated').message,
  ).toContain('Similarity passed = false');
  const score = events('rank.score').find((e) => e.id === 'second');
  expect(score.score).toBeCloseTo(0.875);
  expect(score.message).toContain('Priority weight (priorityWeight) is 0.25');
  expect(score.message).toContain(
    '(0.125 prior contribution + 0.75 similarity contribution)',
  );
  const rejected = events('rank.selection').find((e) => e.id === 'second');
  expect(rejected).toMatchObject({ selected: false, position: 2, slots: 1 });
  expect(rejected.message).toContain(
    'higher-ranked candidates filled those slots',
  );
});

it.each([
  [1, false, 'existing', 2],
  [2, true, 'next', 2],
  [2, true, 'next', '2 visits'],
])(
  'explains the threshold decision for %i and matches the published result',
  async (count, passed, result, threshold) => {
    const cp = engine({
      debug: true,
      profilers: {
        stage: {
          destinations: [
            {
              type: 'threshold',
              storage_key: 'counters.views',
              threshold_number: threshold,
              target_key: 'stage',
              target_value: 'next',
              target_location: { localstorage: true },
            },
          ],
        },
      },
    });
    cp.storage.set('counters', 'views', count);
    cp.publish('stage', 'existing');
    await cp.collect();
    expect(cp.published('stage')).toBe(result);
    const record = events('destination.decision')[0];
    expect(record.passed).toBe(passed);
    expect(record.message).toContain(`Condition passed = ${passed}`);
    expect(record.message).toContain('requires a numeric value >= 2');
    expect(record.action).toBe(passed ? 'publish' : 'keep existing');
  },
);

it('explains priority selection, missing inputs and defaults', async () => {
  const cp = engine({
    debug: true,
    profilers: {
      choice: {
        destinations: [
          {
            type: 'bestpick',
            storage_keys: ['override', 'recent'],
            target_key: 'topic',
            target_location: { localstorage: true },
          },
          {
            type: 'bestpick',
            storage_keys: ['missing'],
            default_value: 'general',
            target_key: 'fallback_topic',
            target_location: { localstorage: true },
          },
          {
            type: 'copy',
            storage_key: 'temp.missing',
            target_key: 'retained',
            target_location: { localstorage: true },
          },
        ],
      },
    },
  });
  cp.publish('recent', 'housing');
  cp.publish('retained', 'previous');
  await cp.collect();
  expect(cp.published('topic')).toBe('housing');
  expect(cp.published('fallback_topic')).toBe('general');
  expect(cp.published('retained')).toBe('previous');
  const decisions = events('destination.decision');
  expect(decisions[0].message).toContain(
    'first non-empty priority key is "recent"',
  );
  expect(decisions[1].message).toContain('configured default is used');
  expect(decisions[2].message).toContain(
    'Condition passed = false; action = keep existing',
  );
});

it('explains exclusions, unavailable profiles and fallback without claiming a match', async () => {
  document.head.innerHTML = '<meta name="topics" content="housing">';
  const cp = metadataEngine({
    debug: true,
    profile: { exclude: { terms: ['profile_topic.housing'] } },
  });
  await cp.collect();
  cp.fold();
  const { items: rows, why } = cp.rank(
    [{ nid: 'one', profile_topic: 'housing' }],
    ['fast'],
    1,
  );
  expect(events('page.exclusion')[0]).toMatchObject({
    excluded: true,
    reason: 'excluded term',
    matched: 'profile_topic.housing',
  });
  expect(events('page.exclusion')[0].message).toContain('will not contribute');
  expect(events('profile.unavailable')[0].message).toContain(
    'no stored profile',
  );
  expect(events('rank.fallback')[0].message).toContain(
    'Profile match required = false',
  );
  expect(events('rank.complete')[0].fallbackCount).toBe(1);
  expect(rows[0].profile).toBe('fallback');
  expect(rows[0].sim).toBeNull();
  // Fallback items are never explained.
  expect(why).toEqual([]);
});

it('reports source failures without claiming successful processing', async () => {
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  const cp = metadataEngine({ debug: true });
  cp.sources.meta = async () => {
    throw new Error('Example source failed');
  };
  await cp.collect();
  expect(events('source.error')).toHaveLength(3);
  expect(events('source.error')[0].message).toContain(
    'input may be missing or incomplete',
  );
  expect(events('page.skipped')[0].message).toContain('check profile.fields');
  expect(cp.currentItem()).toBeNull();
});
