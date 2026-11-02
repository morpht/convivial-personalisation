# Collect and publish a value

This example configures a Convivial Personalisation [profiler](../concepts-and-tools/profilers.md) to read a topic from a URL parameter, count it in a dimension and publish the leading topic. It uses collection and destinations without defining a learned profile.

Load the [browser bundle](../usage/browser.md#1-get-the-browser-bundle) from `convivial-personalisation` before your initializer. On a page with `?topic=gardening` in its URL, use the following as `/js/personalisation.js`:

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

The `topics` profiler defines these three operations. The topic counts and published value are part of [engine state](../concepts-and-tools/engine-state.md).

This example keeps state and published output in memory with `persist: false`. A production initializer can enable persistence and connect the site's [consent controls](../concepts-and-tools/consent-and-data.md). The same pipeline structure supports [other sources](../reference/sources.md), including metatags, cookies and HTTP resources.

For content selection, see the separate [ranking example](../ranking/README.md). Publishing a dimension value does not automatically rank or filter content.
