# Use profiles with different half-lives

`fast` and `slow` are names chosen for this configuration example. Configure any number of profiles with names and half-lives suited to the site. Collection and publishing can also operate without profiles.

## Configuration

Add this learning pipeline after the profilers that collect the [page fields](../configuration/profile.md):

```json
{
  "processors": [
    { "type": "profile", "storage_key": "fast", "decay": 60 },
    { "type": "profile", "storage_key": "slow", "decay": 3600 }
  ]
}
```

These values give previous contributions a half-life of 60 seconds and 3,600 seconds respectively. Both profiles learn the same collected page. The names impose no behaviour; `decay` determines how quickly earlier contributions lose influence.

## Rank with the configured profiles

After the initializer has started collection, a component can use its candidate array:

```javascript
const engine = window.convivialPersonalisation;
await engine.ready;
const fast = engine.rank(structuredClone(items), ['fast'], 3);
const slow = engine.rank(structuredClone(items), ['slow'], 3);
const mixed = engine.rank(structuredClone(items), { fast: 2, slow: 1 }, 3);
```

The first two calls select with one profile each. The third requests two result slots from `fast` and one from `slow`. Similar profiles can merge, and fallback can fill unused slots. The returned `profile`, `sim` and `pos` fields identify the selection, similarity and display position.

As browsing interests change, the shorter half-life gives recent pages greater influence. The two calls can still return the same content, especially after a single page or when candidates match both profiles. Before usable learning exists, eligible candidates are returned as fallback.

See [profile decay and confidence](../concepts-and-tools/fast-and-slow-profiles.md) for these settings, [collection timing](../concepts-and-tools/data-pipelines.md) for when learning is applied, and [rank() options](../reference/rank.md) for selection controls.
