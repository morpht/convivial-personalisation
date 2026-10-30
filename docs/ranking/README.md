# Rank content

Use `rank()` to select recommendations from a candidate feed. Pass the profile names defined by your configuration, or `[]` for fallback only. The examples below assume profiles named `fast` and `slow` have been configured.

```javascript
const engine = window.convivialPersonalisation;
await engine.ready;
const recommendations = engine.rank(structuredClone(items), ['fast', 'slow'], 3, {
  block: 'related-content'
});
```

The initializer must already have started collection. `items` is a flat array of candidate rows using the configured field names. `rank()` returns synchronously, modifies the row objects and supplies the display order. Clone your original feed when another component needs it unchanged.

`block` is an optional component name for recorded results, diagnostics and explicit impression or click calls. It defaults to `'default'` and does not affect ranking. See [block identifiers](../reference/rank.md#block-identifiers).

## Choose your next step

- [Ranking and recommendations](../concepts-and-tools/ranking.md): filtering, confidence, slots, scoring and fallback.
- [rank() arguments and options](../reference/rank.md): the complete signature, defaults and returned fields.
- [Build a recommendation block](../usage/recommendations.md): fetch, rank, render and record interactions.
- [Use profiles with different half-lives](../usage/fast-and-slow.md): an example using 60-second and 3,600-second profile half-lives.
- [Real site configuration](../configuration/site-example.md): map metadata, temporary fields and candidate rows correctly.

## Choose which profiles fill the block

```javascript
const mixed = engine.rank(structuredClone(items), ['fast', 'slow'], 3);
const fixed = engine.rank(structuredClone(items), { fast: 2, slow: 1 }, 3);
const fallbackOnly = engine.rank(structuredClone(items), [], 3);
```

The object form requests numbers of results, not profile weights. Similar profile directions can merge. A new visitor with no usable profile can still receive fallback rows. Results identify their selecting profile in `profile`, similarity in `sim`, final position in `pos`, and matching dimension labels in `why`.

`rank()` is an engine method, not a destination plugin. `top`, `tops` and `bestpick` publish category values; they do not rank a candidate array.
