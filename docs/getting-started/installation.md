# Collect and publish a value

This example reads a topic from a URL parameter, counts it in a dimension and publishes the leading topic. It uses collection and destinations without defining a learned profile.

Load the [browser bundle](../usage/browser.md#1-get-the-browser-bundle) before your initializer. On a page with `?topic=gardening` in its URL, use the following as `/js/personalisation.js`:

```javascript
const config = {
  analytics: { events: false },
  profilers: {
    topics: {
      sources: [{ type: 'query', param: 'topic' }],
      processors: [{ type: 'dimension', storage_key: 'topics' }],
      destinations: [{
        type: 'top',
        dimension: 'topics',
        target_key: 'preferred_topic',
        target_location: { localstorage: true, cookie: false }
      }]
    }
  }
};
const Engine = window.ConvivialPersonalisation.default;
const engine = new Engine(config, 'collection-example', { persist: false });
await engine.collect();
console.log(engine.published('preferred_topic')); // gardening
```

The `query` source supplies `gardening`, the `dimension` processor increments its count, and the `top` destination publishes the leading topic. A site component can read `preferred_topic` with `published()` and use it to choose content.

This example keeps state and published output in memory with `persist: false`. A production initializer can enable persistence and connect the site's [consent controls](../concepts-and-tools/consent-and-data.md). The same pipeline structure supports [other sources](../reference/sources.md), including metatags, cookies and HTTP resources.

## Optional content ranking

`rank()` selects from a candidate array. Passing an empty profile list requests fallback results without learned-profile matching:

```javascript
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

With this configuration, all three rows are returned in input order with `profile: 'fallback'`, `sim: null` and positions 1 to 3. Publishing `preferred_topic` does not automatically filter or score these candidates. `structuredClone()` preserves the original rows because ranking adds result fields.

`block` is an optional name for the recommendation component. It labels the latest results and diagnostic traces, and identifies the component when you call `impression()` or `click()`. It defaults to `'default'` and does not change scores or ordering. Use a distinct name for each component; `rank()` itself emits no impression or click event.

For learned matching, configure one or more [`profile` processors](../reference/processors.md#profile), align the [page and candidate fields](../configuration/profile.md), and pass those profile names to `rank()`. The builder chooses the names and settings. See [recommendation blocks](../usage/recommendations.md) for rendering and event handling.
