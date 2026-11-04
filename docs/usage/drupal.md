# Integrate with Drupal

Drupal can supply Convivial Personalisation with configuration and inputs for collection, processing and publishing. For recommendation components, it can also supply candidate JSON for the browser library to rank. The example below assumes the initializer configures a profile named `interests`; use your own configured names.

This guide assumes access to the site's library attachment, initializer and candidate feed. Build the browser bundle in the `convivial-personalisation` repository, then attach it before the initializer using your site's normal asset workflow.

## Reuse the initialized engine

```javascript
const engine = window.convivialPersonalisation;
await engine.ready;
const { items, why } = engine.rank(structuredClone(items), ['interests'], 3, {
  block: 'related-content'
});
```

The site's initializer must create the engine and start collection before components wait on `ready`. Reuse that engine in each block and collect once per page view.

The browser bundle exposes `window.ConvivialPersonalisation.default`. The constructor's arguments are configuration, site ID and an options object. When the Drupal configuration wraps settings as `{ site, config }`, pass the inner `config` to the constructor and `site` as the second argument.

## Use the site configuration

The [configuration example](../configuration/site-example.md) collects page fields, publishes a topic and optionally learns one profile. Use it as a starting point and choose the inputs and outputs your Drupal components need.

Use `settings.config` and `settings.site` when constructing an engine. Configure consent and cookie publication through `config.privacy`, analytics through `config.analytics`, and connect consent UI changes to `engine.consent()`.

Expose the site's configuration through `drupalSettings`, for example as `drupalSettings.convivialPersonalisation`, and pass it to the initializer. Within the JSON, `config.profilers` defines the collection of objects with sources, processors and destinations.

## Align metadata and feed rows

Use flat rows such as:

```json
[
  { "nid": "101", "title": "Growing a garden", "topics": "gardening", "audiences": "residents", "url": "/guides/garden" },
  { "nid": "102", "title": "Finding a bus route", "topics": "transport", "audiences": "residents,visitors", "url": "/guides/bus" }
]
```

Set `profile.fields` and `text_fields` to the same names, and collect page metadata into matching flat temporary fields. Feed keys are ordinary library field names; the engine does not infer Drupal field machine names or aliases. Key fields carry machine names only. To show vocabulary labels in `why`, export each vocabulary as a key-to-label map into `config.data`, or serve one JSON file and name it in `profile.labels_url`; see [labels for explanations](../configuration/profile.md#labels-for-explanations).

Keep all metadata profilers before profile learning. If the initializer uses `order: 'weight'`, assign metadata profilers lower weights than learning profilers. Profiler weights control execution order; a `profile` processor's `weight` controls learning strength.

## Build and deploy the library

Build `dist/bundle.js` in `convivial-personalisation` with `npm run build`, run the checks and tests, and use the site's normal dependency or asset deployment process to update the served library. See [get the browser bundle](browser.md#1-get-the-browser-bundle) for the repository URL and build commands.

After deployment, inspect `window.convivialPersonalisation.version` to confirm the browser has the intended version and clear the relevant asset caches through the site's usual tooling.

## Component responsibilities

Handle feed failures and empty result lists, deduplicate IDs, preserve returned order, render accessible links, and call impressions and clicks at the appropriate time. Page learning exclusions do not replace Drupal access control or feed filtering. See [recommendation blocks](recommendations.md).

## Impression and click events

The library implements `impression()`, `click()` and `pushEvent()`. Calling `rank()` does not call them. Components must call `impression()` after rendering and `click()` on link interaction; see [the recommendation example](recommendations.md).

Set `config.analytics.events` to `true` and check that the site's initializer preserves this setting. Inspect `window.convivialPersonalisation.analytics.events` to verify the running engine's value. Components that do not call the event methods produce no impression or click events.

These APIs append records to the configured browser data layer when analytics is enabled and personalisation consent is granted. They do not send HTTP requests. A tag manager or analytics integration would need to consume those records to send them to a service. An impression means the caller recorded rendered items; the library does not measure viewport exposure.
