import { afterEach, describe, expect, it, vi } from 'vitest';
import ConvivialPersonalisation, { VERSION } from '../src/index';

afterEach(() => {
  localStorage.clear();
  delete window.dataLayer;
  delete window.testEvents;
  vi.restoreAllMocks();
});

it('uses the product name and current release version for the engine and diagnostics', () => {
  const debug = vi.spyOn(console, 'debug').mockImplementation(() => {});
  const engine = new ConvivialPersonalisation({ debug: true }, 'events-test');
  expect(VERSION).toBe('0.2.0');
  expect(window.convivialPersonalisation).toBe(engine);
  expect(window.convivialProfiler).toBeUndefined();
  expect(window.ConvivialProfiler).toBeUndefined();
  expect(debug.mock.calls[0][0]).toBe('[convivial-personalisation]');
});

it('records impressions and clicks only when explicitly called', () => {
  const engine = new ConvivialPersonalisation({ analytics: { datalayer: 'testEvents' } }, 'events-test');
  const { items: rows, why } = engine.rank([{ nid: 'one', title: 'Test item' }], [], 1, { block: 'related' });
  expect(why).toEqual([]);
  expect(window.testEvents).toBeUndefined();
  engine.impression('related');
  engine.click('related', rows[0]);
  expect(window.testEvents).toEqual([
    { event: 'cp.block_impression', cp_block: 'related', cp_variant: 'personalised', cp_profiles: 'fallback', cp_items: 'one', cp_count: 1, cp_why: '' },
    expect.objectContaining({ event: 'cp.block_click', cp_block: 'related', cp_item: 'one', cp_profile: 'fallback', cp_position: 1 }),
  ]);
});

describe.each([
  ['analytics disabled', { analytics: { events: false } }],
  ['consent denied', { privacy: { consent_default: 'denied' } }],
])('%s', (name, config) => {
  it('suppresses impressions, clicks and destination events', async () => {
    const engine = new ConvivialPersonalisation(config, 'events-test');
    engine.impression('related', [{ id: 'one' }]);
    engine.click('related', { id: 'one' });
    engine.destinations.datalayer_event(engine, {}, { category: 'test', action: 'test' }, ['synthetic']);
    expect(window.dataLayer).toBeUndefined();
  });
});

it('uses the product name for destination events and honours consent withdrawal', () => {
  const engine = new ConvivialPersonalisation({}, 'events-test');
  engine.destinations.datalayer_event(engine, {}, { category: 'test', action: 'test' }, ['synthetic']);
  expect(window.dataLayer[0].event).toBe('convivialPersonalisation.event');
  engine.consent('denied');
  engine.click('related', { id: 'one' });
  expect(window.dataLayer).toHaveLength(1);
});
