# Storage and expiry

The engine stores site data under the browser local-storage key `convivial_personalisation`. The root contains `_version: 3` and a record for each site ID. Each record has `_schema: 3` and separate namespaces. These numbers identify the storage format, separately from the library release version.

| Namespace | Meaning |
| --- | --- |
| `temp` | Flat metadata from the latest collection; cleared on construction and collection |
| `profiles` | Named accumulators with `v`, `t`, `n`, `decay` and configuration hash `cfg` |
| `dimensions` | Named category counters |
| `store` | Values generally stored as `{ value, expire }` |
| `fetchers` | Cached HTTP results and expiry |
| `counters`, `accumulators` | Numeric counters and totals |
| `log` | Capped value/timestamp maps |
| `seen` | Viewed ID/timestamp entries; capped at 200 by the normal fold path |
| `suppress` | Exclusion and demotion rules |
| `meta` | Internal metadata, including published-key tracking |

## Read the right path

Temporary values are flat: use `temp.topics`, not an object wrapper. Lists are serialised as comma-separated strings at the storage boundary. Stored values use paths such as `store.selected_audience.value`; dimensions use paths such as `dimensions.topics.gardening`.

```javascript
const topics = engine.storage.get('temp.topics');
const selected = engine.storage.get('store.selected_audience.value');
const published = engine.published('selected_audience');
```

A published key is a separate flat output. `engine.published()` checks in-memory outputs first, then permitted local storage. Use it instead of reading local storage directly when memory-only operation or denied consent is possible.

## Persistence

State changes are batched for persistence through an idle callback or timer and page lifecycle events. Folding flushes changed state. `engine.storage.flush()` returns whether a write succeeded. A processor can update memory before that change reaches local storage.

`persist: false` keeps new state and ordinary published outputs in memory. Unavailable local storage also allows in-memory operation. A future storage schema is not overwritten by an older engine. The snapshot is usually a better diagnostic entry point than editing the stored JSON.

Page-scoped `temp` may be included in the serialised record, but it is cleared on the next construction or collection; it is not durable profile history.

## Expiry is separate from decay

A time to live (TTL) controls how long a stored value remains valid. Profile decay gradually reduces the strength of learned interests instead.

The shared expiry helper used by `store`, language processors and `extreme_geoip` follows these rules:

| TTL | Result |
| --- | --- |
| Positive number | Expire that many seconds from now, rounded |
| `0`, negative number, empty, null or omitted | No expiry (`expire: null`) |
| `'page'` | Expiry timestamp equal to the current second |

The collection sweep removes `store` and `fetchers` entries when `expire < now`. Raw reads do not enforce expiry, and the page value is swept only on a later collection whose time has advanced. Profile `decay` is a half-life, not this expiry mechanism.

`store_list` has distinct behaviour: use a numeric TTL; `-1` means 365 days and other values are added directly to the current timestamp. It does not use the shared permanent/page rules. Suppression TTL also has its own calculation: use positive seconds for a duration or omit it for a persistent rule.

## Clear state

`engine.erase()` clears this site's profile, outputs recorded in its published-key index, queued work and block records. It does not change the consent choice. `engine.consent('denied')` both records denied consent and erases the site's state. See [consent and data handling](consent-and-data.md).
