# Integrate with Drupal

Drupal can supply profiler configuration, page metadata and candidate JSON. The browser library builds profiles and ranks rows; the component renders them.

This guide assumes access to the site's library attachment, initializer and candidate feed. Build the browser bundle in this repository, then attach it before the initializer using your site's normal asset workflow.

## Reuse the initialized engine

```javascript
const engine = window.convivialPersonalisation;
await engine.ready;
const ranked = engine.rank(structuredClone(items), ['fast', 'slow'], 3, {
  block: 'related-content'
});
```

The site's initializer must create the engine and start collection before components wait on `ready`. Reuse that engine in each block and collect once per page view.

The browser bundle exposes `window.ConvivialPersonalisation.default`. The constructor's arguments are configuration, site ID and an options object. When the Drupal configuration wraps settings as `{ site, config }`, pass the inner `config` to the constructor and `site` as the second argument.

## Use the site configuration

The [real site configuration](../configuration/site-example.md) includes the complete JSON and field mapping. It collects `topic` and `audience` metadata into `topics` and `audiences` fields, weights `intent` at 10 and `campaign` at 8, and learns profiles with 60-second and 3,600-second half-lives.

Use `settings.config` and `settings.site` when constructing an engine. Configure consent and cookie publication through `config.privacy`, analytics through `config.analytics`, and connect consent UI changes to `engine.consent()`.

## Align metadata and feed rows

Use flat rows such as:

```json
[
  { "nid": "101", "title": "Growing a garden", "topics": "gardening|Gardening", "audiences": "residents", "url": "/guides/garden" },
  { "nid": "102", "title": "Finding a bus route", "topics": "transport|Transport", "audiences": "residents,visitors", "url": "/guides/bus" }
]
```

Set `profile.fields` and `text_fields` to the same names, and collect page metadata into matching flat temporary fields. Feed keys are ordinary library field names; the engine does not infer Drupal field machine names or aliases.

Keep all metadata profilers before profile learning. If the initializer uses `order: 'weight'`, assign metadata profilers lower weights than learning profilers. Profiler weights control execution order; a `profile` processor's `weight` controls learning strength.

## Build and deploy the library

Build `dist/bundle.js` in this repository with `npm run build`, run the checks and tests, and use the site's normal dependency or asset deployment process to update the served library.

After deployment, inspect `window.convivialPersonalisation.version` to confirm the browser has the intended version and clear the relevant asset caches through the site's usual tooling.

## Component responsibilities

Handle feed failures and empty result lists, deduplicate IDs, preserve returned order, render accessible links, and call impressions and clicks at the appropriate time. Page learning exclusions do not replace Drupal access control or feed filtering. See [recommendation blocks](recommendations.md).
