# Rank content

Use `rank()` to select from a candidate feed. Pass configured profile names for learned matching, or `[]` for fallback only. The initializer must already have created the engine and started collection.

## Minimal example

This fallback example does not require learned profiles:

```javascript
const engine = window.convivialPersonalisation;
await engine.ready;
const items = [
  { nid: 'garden-tools', title: 'Choosing garden tools', topics: 'gardening', url: '/garden-tools' },
  { nid: 'bus-routes', title: 'Finding a bus route', topics: 'transport', url: '/bus-routes' },
  { nid: 'garden-seeds', title: 'Growing plants from seed', topics: 'gardening', url: '/garden-seeds' }
];
const result = engine.rank(structuredClone(items), [], 3, {
  block: 'related-content'
});
console.table(result.items.map(({ id, profile, sim, pos }) => ({ id, profile, sim, pos })));
console.log(result.why);
```

On a fresh engine, the default options return all three rows in `items` in feed order with `profile: 'fallback'`, `sim: null` and positions 1 to 3, and an empty `why` because fallback rows are not explained. Active filters can remove rows. `rank()` is synchronous and adds result fields to candidate objects; cloning preserves the original feed.

`block` is an optional component name for diagnostics and explicit impression or click events. It defaults to `'default'` and does not change ranking. See [block identifiers](../reference/rank.md#block-identifiers).

## Use a configured profile

The [configuration example](../configuration/site-example.md) learns a profile named `interests`. Once learning is available, request it with:

```javascript
const { items: recommendations, why } = engine.rank(structuredClone(items), ['interests'], 3, {
  block: 'related-content'
});
```

After the gardening page has been learned, `recommendations` lists the two gardening rows first with `profile: 'interests'`, and `why` is `['Gardening', 'garden', 'growing']`: the topic label from `config.data.topics`, then the title words each selected row shares with the learned page. Use your own configured names. Profiles are created by `profile` processors; requesting a name does not create one. Fallback can fill unused results when learned matching is unavailable.

See [recommendation blocks](../usage/recommendations.md) for rendering and events, [profiles with different half-lives](../usage/fast-and-slow.md) for an optional multi-profile example, and the [rank reference](../reference/rank.md) for options and output fields.
