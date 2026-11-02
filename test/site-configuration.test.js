import { runInNewContext } from 'node:vm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ConvivialPersonalisation from '../src/index';
import bundle from '../dist/bundle.js?raw';
import settings from './fixtures/site-config.json';
import listGuide from '../docs/configuration/lists.md?raw';
import { candidates, runSiteExample, setPageMetadata } from '../example/site-scenario.js';

beforeEach(() => {
  vi.useFakeTimers();
  localStorage.clear();
  document.head.innerHTML = '';
  history.replaceState(null, '', '/');
});

afterEach(() => {
  window.convivialPersonalisation?.erase();
  localStorage.clear();
  document.head.innerHTML = '';
  history.replaceState(null, '', '/');
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe.each(['source', 'bundle'])('supplied site configuration (%s)', implementation => {
  function engineClass() {
    if (implementation === 'source') return ConvivialPersonalisation;
    const context = { window, document, localStorage, navigator, location, URLSearchParams, console, setTimeout };
    runInNewContext(bundle, context);
    return context.ConvivialPersonalisation.default;
  }

  it('runs all configured plugin types and follows the documented field mapping and ranking', async () => {
    const warnings = vi.spyOn(console, 'warn');
    const result = await runSiteExample(engineClass(), settings);
    const engine = result.engine;
    expect(Object.keys(settings.config.profilers)).toHaveLength(44);
    for (const profiler of Object.values(settings.config.profilers)) {
      for (const kind of ['sources', 'processors', 'destinations']) {
        for (const plugin of profiler[kind] || []) expect(engine[kind][plugin.type]).toBeTypeOf('function');
      }
    }
    expect(warnings).not.toHaveBeenCalled();
    expect(engine.currentItem()).toMatchObject({
      id: 'training-dog-guide', topics: 'cp-topic-dogs', audiences: 'cp-audience-dogs',
      intent: 'intent-needs-recommendations', campaign: 'cp-dogs-slow', keywords: 'dogs, puppies, canine',
    });
    expect(engine.snapshot().profiles.fast.decay).toBe(60);
    expect(engine.snapshot().profiles.slow.decay).toBe(3600);
    expect(result.fast[0].nid).toBe('dog-guide');
    const fastCat = result.fast.find(item => item.nid === 'cat-guide');
    const slowCat = result.slow.find(item => item.nid === 'cat-guide');
    expect(slowCat.sim).toBeGreaterThan(fastCat.sim);
    expect(result.mixed).toHaveLength(3);
    expect(engine.published('topic')).toBe('cp-topic-dogs');
    expect(engine.published('next')).toBe('intent-needs-recommendations');
    expect(localStorage.getItem('convivial_personalisation')).toBeNull();
    expect(location.search).toBe('');
    expect(settings.config.debug).toBe(true);
  });

  it('keeps published audience overrides separate from page vectors and prefers campaign over UTM', async () => {
    const Engine = engineClass();
    history.replaceState(null, '', '/?audiences=cp-audience-dogs&utm_campaign=cp-birds&campaign=cp-cats-fast');
    setPageMetadata(candidates[0]);
    const engine = new Engine(settings.config, 'site-example', { persist: false, debug: false });
    await engine.collect();
    engine.fold();
    expect(engine.published('audience')).toBe('cp-audience-dogs');
    expect(engine.currentItem().audiences).toBe('cp-audience-cats');
    expect(engine.currentItem().campaign).toBe('cp-cats-fast');
    expect(engine.published('campaign')).toBe('cp-cats-fast');
    expect(engine.rank(structuredClone(candidates), ['fast'], 1, { priorityWeight: 0 })[0].nid).toBe('cat-guide');
  });

  it('executes the documented list pipeline and preserves both current storage formats', async () => {
    const Engine = engineClass();
    const pipeline = JSON.parse(listGuide.match(/```json\n([\s\S]*?)```/)[1]);
    document.head.innerHTML = '<meta name="topic" content=" topic-ai, , topic-personalisation ">';
    const engine = new Engine({ profilers: { topics: pipeline } }, 'list-example', { persist: false, now: () => 1000 });
    await engine.collect();
    expect(engine.storage.get('temp.topics')).toBe('topic-ai, topic-personalisation');
    expect(engine.storage.get('store.topics_recent')).toEqual({ value: 'topic-ai,topic-personalisation', expire: 1300 });
    expect(engine.published('topics_recent')).toBe('topic-ai,topic-personalisation');
  });

  it('clears a satisfied recent intent without silently suppressing or excluding profile learning', async () => {
    const Engine = engineClass();
    setPageMetadata(candidates[0]);
    const satisfied = document.createElement('meta');
    satisfied.name = 'intent_satisfied';
    satisfied.content = 'intent-needs-recommendations';
    document.head.append(satisfied);
    const engine = new Engine(settings.config, 'site-example', { persist: false, debug: false });
    await engine.collect();
    engine.fold();
    expect(engine.storage.get('store.intent_recent')).toBeUndefined();
    expect(engine.published('intent_recent')).toBeNull();
    expect(engine.profile.suppressions()).toEqual([]);
    expect(engine.profile.vector('fast').v).not.toBeNull();
  });

  it('filters configured phrases from text without treating that as a page-learning exclusion', async () => {
    const Engine = engineClass();
    expect(Engine.vector.tokenize('domestic violence sexual abuse', settings.config.profile).tokens).toEqual([]);
    setPageMetadata({ ...candidates[0], title: 'domestic violence', description: 'sexual abuse', keywords: '' });
    const engine = new Engine(settings.config, 'site-example', { persist: false, debug: false });
    await engine.collect();
    engine.fold();
    expect(engine.page.excluded).toBe(false);
    expect(engine.profile.vector('fast').v).not.toBeNull();
  });

  it.each([undefined, 3])('removes obsolete licence metadata from schema %s while retaining visitor counters', async schema => {
    const Engine = engineClass();
    localStorage.setItem('convivial_personalisation', JSON.stringify({
      _licenseKey: 'community',
      'license-example': { _schema: schema, _licenseKey: 'community', counters: { previous: 7 } },
    }));
    const engine = new Engine({ profilers: {} }, 'license-example', { now: () => 1000 });
    await engine.collect();
    engine.storage.flush();
    const saved = JSON.parse(localStorage.getItem('convivial_personalisation'));
    expect(saved).not.toHaveProperty('_licenseKey');
    expect(saved['license-example']).not.toHaveProperty('_licenseKey');
    expect(engine.storage.data).not.toHaveProperty('_licenseKey');
    expect(saved['license-example'].counters.previous).toBe(7);
  });

  it('treats the old community constructor argument as unused rather than a runtime licence', async () => {
    const Engine = engineClass();
    const engine = new Engine({ profilers: {} }, 'no-runtime-key', 'community');
    await engine.collect();
    engine.storage.flush();
    expect(JSON.stringify(engine.snapshot())).not.toContain('_licenseKey');
    expect(localStorage.getItem('convivial_personalisation')).not.toContain('_licenseKey');
  });
});
