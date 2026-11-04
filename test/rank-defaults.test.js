import { expect, it } from 'vitest';
import { rank } from '../src/lib/rank';
import { vectorOf } from '../src/lib/vector';

it('requires explicit profile selection even when matching vectors are available', () => {
  const candidates = [
    { nid: 'bus-routes', profile_topic: 'transport' },
    { nid: 'garden-tools', profile_topic: 'gardening' },
  ];
  const vector = { v: vectorOf(candidates[1]), confidence: 1 };
  const ctx = { vectors: { fast: vector, slow: vector, interests: vector } };
  const options = { priorityWeight: 0, diversify: false };
  const fallback = rank(structuredClone(candidates), [], 1, options, ctx);
  expect(fallback.items).toHaveLength(1);
  expect(fallback.count).toBe(1);
  expect(fallback.why).toEqual([]);
  expect(fallback.profiles).toEqual({});
  expect(fallback.items[0]).toMatchObject({
    nid: 'bus-routes',
    profile: 'fallback',
  });
  for (const selection of [undefined, null, []]) {
    expect(
      rank(structuredClone(candidates), selection, 1, options, ctx),
    ).toEqual(fallback);
    expect(
      rank(
        structuredClone(candidates),
        selection,
        1,
        { ...options, fallback: 'none' },
        ctx,
      ),
    ).toEqual({ items: [], why: [], why_detail: [], profiles: {}, count: 0 });
  }
  for (const selection of [['interests'], { interests: 1 }]) {
    const selected = rank(
      structuredClone(candidates),
      selection,
      1,
      options,
      ctx,
    );
    expect(selected.items).toHaveLength(1);
    expect(selected.items[0]).toMatchObject({
      nid: 'garden-tools',
      profile: 'interests',
    });
    expect(selected.profiles).toEqual({
      interests: { used: true, confidence: 1 },
    });
    // A single picked item: its one key carries all of the similarity.
    expect(selected.why).toEqual(['gardening']);
  }
});
