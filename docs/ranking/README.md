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
const results = engine.rank(structuredClone(items), [], 3, {
  block: 'related-content'
});
console.table(results.map(({ id, profile, sim, pos }) => ({ id, profile, sim, pos })));
```

On a fresh engine, the default options return all three rows in feed order with `profile: 'fallback'`, `sim: null` and positions 1 to 3. Active filters can remove rows. `rank()` is synchronous and adds result fields to candidate objects; cloning preserves the original feed.

`block` is an optional component name for diagnostics and explicit impression or click events. It defaults to `'default'` and does not change ranking. See [block identifiers](../reference/rank.md#block-identifiers).

## Use a configured profile

The [configuration example](../configuration/site-example.md) learns a profile named `interests`. Once learning is available, request it with:

```javascript
const recommendations = engine.rank(structuredClone(items), ['interests'], 3, {
  block: 'related-content'
});
```

Use your own configured names. Profiles are created by `profile` processors; requesting a name does not create one. Fallback can fill unused results when learned matching is unavailable.

See [recommendation blocks](../usage/recommendations.md) for rendering and events, [profiles with different half-lives](../usage/fast-and-slow.md) for an optional multi-profile example, and the [rank reference](../reference/rank.md) for options and output fields.
