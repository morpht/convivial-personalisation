import { runInNewContext } from 'node:vm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ConvivialPersonalisation from '../src/index';
import bundle from '../dist/bundle.js?raw';
import { config, items } from '../example/config.js';
import { runExample } from '../example/scenario.js';
import installationGuide from '../docs/getting-started/installation.md?raw';
import rankingGuide from '../docs/ranking/README.md?raw';
import exampleSettings from '../docs/assets/configuration/site-config.json';

beforeEach(() => {
  vi.useFakeTimers();
  localStorage.clear();
  history.replaceState(null, '', '/');
  document.head.innerHTML = '<meta name="nid" content="page-gardening"><meta name="title" content="Growing a garden"><meta name="topics" content="gardening">';
});

afterEach(() => {
  window.convivialPersonalisation?.erase();
  document.head.innerHTML = '';
  history.replaceState(null, '', '/');
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.restoreAllMocks();
  localStorage.clear();
});

it('uses the candidate rows printed in the ranking guide', () => {
  const rows = rankingGuide.match(/const items = (\[[\s\S]*?\]);/)[1];
  expect(runInNewContext(rows)).toEqual(items);
});

describe.each(['source', 'bundle'])('documentation and examples (%s)', implementation => {
  function engineClass() {
    if (implementation === 'source') return ConvivialPersonalisation;
    const context = { window, document, localStorage, navigator, location, URLSearchParams, console, setTimeout };
    runInNewContext(bundle, context);
    return context.ConvivialPersonalisation.default;
  }

  it('collects and publishes the getting-started value without profiles or persistence', async () => {
    const Engine = engineClass();
    const configuration = installationGuide.match(/const config = (\{[\s\S]*?\n\});/)[1];
    history.replaceState(null, '', '/?topic=gardening');
    const engine = new Engine(runInNewContext('(' + configuration + ')'), 'collection-example', { persist: false });
    await engine.collect();
    expect(engine.published('preferred_topic')).toBe('gardening');
    expect(engine.profile.names()).toEqual([]);
    expect(localStorage.getItem('convivial_personalisation')).toBeNull();
  });

  it('publishes a topic and ranks content with the downloadable single-profile configuration', async () => {
    const Engine = engineClass();
    document.querySelector('meta[name="topics"]').name = 'topic';
    const engine = new Engine(exampleSettings.config, exampleSettings.site, { persist: false });
    await engine.collect();
    engine.fold();
    expect(engine.currentItem()).toMatchObject({ id: 'page-gardening', topics: 'gardening' });
    expect(engine.published('preferred_topic')).toBe('gardening');
    expect(engine.profile.names()).toEqual(['interests']);
    const ranked = engine.rank(structuredClone(items), ['interests'], 3);
    expect(ranked.items[0]).toMatchObject({ topics: 'gardening', profile: 'interests' });
    expect(ranked.why).toContain('Gardening');
    const fixed = engine.rank(structuredClone(items), { interests: 1 }, 1, { fallback: 'none' });
    expect(fixed.items).toHaveLength(1);
    expect(fixed.items[0]).toMatchObject({ topics: 'gardening', profile: 'interests' });
    expect(engine.rank(structuredClone(items)).items.every(item => item.profile === 'fallback')).toBe(true);
    expect(localStorage.getItem('convivial_personalisation')).toBeNull();
  });

  it('uses fallback when no profile names are requested, even with learned example profiles', async () => {
    const logs = vi.spyOn(console, 'debug').mockImplementation(() => {});
    const { engine } = await runExample(engineClass(), () => 1000000);
    engine.debug = true;
    expect(engine.profile.names().sort()).toEqual(['fast', 'slow']);
    const omitted = engine.rank(structuredClone(items)).items;
    expect(logs.mock.calls.find(call => call[2]?.event === 'rank.start')[2].profiles).toEqual([]);
    const unspecified = engine.rank(structuredClone(items), null).items;
    const empty = engine.rank(structuredClone(items), []).items;
    expect(omitted).toHaveLength(items.length);
    expect(omitted.map(item => item.nid)).toEqual(items.map(item => item.nid));
    expect(omitted.every(item => item.profile === 'fallback')).toBe(true);
    expect(omitted).toEqual(empty);
    expect(omitted).toEqual(unspecified);
    expect(engine.rank(structuredClone(items), null, 1, { fallback: 'none' }).items).toEqual([]);
    expect(engine.rank(structuredClone(items), undefined, 1, { fallback: 'none' }).items).toEqual([]);
    expect(engine.rank(structuredClone(items), [], 1, { fallback: 'none' }).items).toEqual([]);
    const starts = logs.mock.calls.filter(call => call[2]?.event === 'rank.start');
    expect(starts).toHaveLength(6);
    starts.forEach(call => expect(call[2].profiles).toEqual([]));
    expect(engine.snapshot().blocks.find(block => block.block === 'default').profiles).toEqual([]);
  });

  it('learns both profiles and ranks gardening first without persisting the demo', async () => {
    const { engine, result } = await runExample(engineClass(), () => 1000000);
    const ranked = result.items;
    expect(engine.profile.names().sort()).toEqual(['fast', 'slow']);
    expect(ranked).toHaveLength(3);
    expect(ranked[0].topics).toBe('gardening');
    expect(ranked[0].profile).toBe('fast');
    expect(ranked[0]).not.toHaveProperty('why');
    expect(result.why).toContain('Gardening');
    expect(result.count).toBe(3);
    expect(ranked.map(item => item.pos)).toEqual([1, 2, 3]);
    expect(localStorage.getItem('convivial_personalisation')).toBeNull();
    expect(items.every(item => !('score' in item))).toBe(true);
  });

  it('halves fast confidence after one day while slow retains almost all strength', async () => {
    let now = 1000000;
    const { engine } = await runExample(engineClass(), () => now);
    now += 86400;
    expect(engine.profile.vector('fast').confidence).toBeCloseTo(0.5, 5);
    expect(engine.profile.vector('slow').confidence).toBeCloseTo(0.9981, 4);
    document.querySelector('meta[name="title"]').content = 'Finding a bus route';
    document.querySelector('meta[name="topics"]').content = 'transport';
    await engine.collect();
    engine.fold();
    const settings = { priorityWeight: 0, removeSeenItems: false, diversify: false, fallback: 'none' };
    const fast = engine.rank(structuredClone(items), ['fast'], 3, settings).items.find(item => item.topics === 'transport');
    const slow = engine.rank(structuredClone(items), ['slow'], 3, settings).items.find(item => item.topics === 'transport');
    expect(fast.sim).toBeGreaterThan(slow.sim);
  });

  it('uses fallback before learning and honours suppression and denied consent', async () => {
    const Engine = engineClass();
    const engine = new Engine(config, 'documentation-example', { persist: false });
    await engine.collect();
    expect(engine.rank(structuredClone(items), ['fast', 'slow'], 3).items.every(item => item.profile === 'fallback')).toBe(true);
    engine.fold();
    engine.profile.suppress({ scope: 'topics', key: 'gardening', mode: 'exclude', ttl: 3600 });
    expect(engine.rank(structuredClone(items), [], 3).items.map(item => item.nid)).toEqual(['bus-routes']);
    engine.consent('denied');
    expect(engine.rank(structuredClone(items), ['fast', 'slow'], 3).items.every(item => item.profile === 'fallback')).toBe(true);
    expect(engine.rank(structuredClone(items), ['fast'], 3, { fallback: 'none' }).items).toEqual([]);
    expect(engine.profile.names()).toEqual([]);
  });
});
