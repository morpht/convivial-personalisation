# Storage and expiry

With persistence and consent enabled, the library keeps site state in browser local storage under `convivial_personalisation`, separated by site ID. See [engine state](engine-state.md) for the stored values, dimensions, optional profiles and other state managed by the engine.

Use the API to read values and inspect state. The stored JSON format is managed by the library.

## Read values

```javascript
const topics = engine.storage.get('temp.topics');
const selected = engine.storage.get('store.selected_audience.value');
const published = engine.published('selected_audience');
```

`temp` holds page fields for the current collection. `store` retains processor values, which can have an expiry. `published()` reads a component's output from memory or permitted local storage and also works when persistence is disabled.

## Persistence and seen history

`persist: false` keeps new state and ordinary published outputs in memory. They are lost on reload. The engine also supports in-memory operation when browser storage is unavailable. Consent controls still apply; see [consent and data handling](consent-and-data.md).

Seen history records item IDs and view times. Normal page learning records the eligible current page; `engine.profile.markSeen(id)` can record an explicit visit. Ranking alone does not record a view. Use stable IDs across pages and candidate rows so `removeSeenItems` can match them.

## Expiry

`ttl` sets how long a stored value remains valid, in seconds. The `store`, language and `extreme_geoip` processors accept positive durations; omitted or non-positive numeric values mean no expiry. They also accept `'page'` for page-scoped values.

Expired stored values are removed during collection. Reading a raw storage path does not trigger expiry. `store_list` has different TTL rules; use its [reference](../reference/processors.md#store_list). Suppression durations are documented in the [suppression guide](../usage/suppression.md).

Profile `decay` controls how interests change over time; it does not use stored-value expiry.

## Clear state

`engine.erase()` clears this site's state and tracked published outputs while keeping the consent choice. `engine.consent('denied')` records denied consent and erases the site's state. Use `engine.snapshot()` for diagnostics.
