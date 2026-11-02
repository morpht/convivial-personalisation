# Engine state

The engine holds the values collected, retained and learned for a site. [Profilers](profilers.md) perform operations that read or update this shared state. Site components use the engine's APIs to inspect it and read published outputs.

## Temporary values

`temp` contains fields for the current collection, such as a page title, ID or topics. The `temp` and `temp_list` processors write these fields. A field such as `temp.topics` is shared across the engine, so later profilers can use it.

Temporary values are cleared at the start of each collection and when an engine is constructed. The page builder reads these fields when preparing the current page for profile learning.

## Stored values

`store` retains named values across collections. The `store` processor writes entries with a value and an expiry, such as `store.selected_audience.value`. Other processors can also write stored values.

An entry's lifetime depends on its processor and TTL settings. Retention across page loads additionally requires persistence and consent. See [storage and expiry](storage-and-expiry.md) for those rules.

## Dimensions

A dimension counts named categories, such as topics or audiences. The `dimension` processor adds source values to a named set of counters, such as `dimensions.topics`. Destinations can use these counts to publish a leading topic or a list of interests.

Dimension counters remain totals until changed or erased. They do not time-decay. They can support collection and publishing independently of learned profiles. See [audience choices](../usage/audience.md) for an example.

## Profiles

A profile holds learned visitor interests for content matching. The engine keeps profiles by name, such as `profiles.interests`. The builder chooses their names, number and learning settings.

A `profile` processor queues learning from the collected page fields into the profile named by its `storage_key`. Collect those fields before running a profiler that contains this processor. The processor can run without its own sources because it uses the engine's current page fields.

`config.profile` defines the fields and matching settings. The learned state is retained in the named profiles. Requesting a name in `rank()` does not create or learn that profile.

Profiles can use a configured half-life and expose confidence for ranking. See [profile decay and confidence](fast-and-slow-profiles.md), [content matching](content-vectors.md) and [collection and learning lifecycle](data-pipelines.md).

## Other state

| State | Purpose |
| --- | --- |
| Counters and accumulators | Track event counts and numeric totals |
| Logs | Retain capped sets of values and their timestamps |
| Fetcher caches | Retain HTTP responses with expiry for deferred collection |
| Seen history | Record visited item IDs and times for ranking filters |
| Suppressions | Retain rules that exclude or demote matching content |
| Published outputs | Make named values available to site components through `published()` |

These values are managed by the engine and its plugins. Their persistence, expiry and use depend on the configuration and [consent controls](consent-and-data.md).

## Inspect state

```javascript
const engine = window.convivialPersonalisation;
console.log(engine.storage.get('temp.topics'));
console.log(engine.storage.get('store.selected_audience.value'));
console.table(engine.snapshot().dimensions);
console.table(engine.snapshot().profiles);
console.log(engine.published('preferred_topic'));
```

The results reflect the configured operations that have run. A missing stored or temporary value is `undefined`; a missing published value is `null`. Use [storage and expiry](storage-and-expiry.md) for persistence and clearing state, and the [API reference](../reference/api.md) for inspection methods.
