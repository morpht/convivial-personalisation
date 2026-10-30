# Processors

Processors update engine state or queue learning. They run synchronously in configured order with `(engine, profiler, processor, values)`. `storage_key` usually names an entry within the processor's namespace, not a full dotted path.

For comma-separated metadata, [`temp_list`](#temp_list) prepares page vector fields and [`store_list`](#store_list) retains lists with a TTL. The [list processing guide](../configuration/lists.md) shows both. The optional [`profile`](#profile) processor learns a named vector after the page fields have been collected. The builder chooses each profile name and its settings; the other processors can run without learned profiles.

## `accumulation`

Adds each numeric input to an accumulator.

`storage_key` selects `accumulators.<key>`. The numeric storage helper parses inputs and defaults an invalid increment to one; validate inputs if the pipeline should accept only numbers.

## `dimension`

Splits list inputs into values and increases each category counter. `id|Label` retains only the ID.

`storage_key`: dimension name. `normalize: true` divides a total contribution of one among the parsed inputs. The counters do not time-decay and are distinct from named profile vectors.

## `extreme_geoip`

Stores an input response with expiry under `fetchers.<profiler name>` and, when different, under a `storage_key` alias.

`ttl`: shared expiry semantics. Use it with an HTTP source and `deferred: true` to cache a response. The source makes the request; this processor stores the response.

## `language_full`

Stores the lowercased full language value, such as `en-au`.

`storage_key` and `ttl`. Writes `{ value, expire }` under `store` using the shared expiry helper.

## `language_simple`

Stores the lowercased language before the first hyphen, such as `en`.

`storage_key` and `ttl`; same storage format as `language_full`.

## `logger`

Records non-empty inputs in a capped value/timestamp map.

`storage_key` identifies the log and `size` sets its capacity. Repeated values refresh their timestamp; this is not an ordered record of every duplicate event.

## `map`

Matches the first input against the exact prefix before `|` in the configured mappings.

`storage_key`, `mappings` such as `["a|alpha"]`, `default_value` for missing input or mapping configuration, and `fallback_value` for unmatched input. Writes an entry expiring at the current second; a later collection sweep can remove it.

## `pageview`

Records the current browser URL and/or increases a counter independently of source values.

`storage_key`, `log: true`, `track: true`, and optional log `size`. It runs once whenever its pipeline runs.

## `searchquery`

Reads a non-empty search query from the current URL when the path and parameter conditions match.

`search_path` is a pathname substring; `query_param` names the query, and optional `exclude_param` blocks processing when present. `storage_key`, `log`, `track`, `size` control storage. Tracking increases only if the query is not in the current log, so repeated queries can count again when logging is disabled or old log entries have been removed.

## `store`

Writes each input to the same stored entry; the last input wins.

`storage_key` and `ttl`. Writes `{ value, expire }` under `store`. Unlike temporary values, the stored value retains its original type.

## `store_list`

Splits inputs at commas, trims and removes empty entries, and stores a comma-joined list when non-empty.

`storage_key` and numeric `ttl`. For example: `{ "type": "store_list", "storage_key": "topics_recent", "ttl": 300 }`. Read the result from `store.topics_recent.value`. `-1` means 365 days; otherwise expiry is the current timestamp plus the provided TTL. This processor does not implement the shared helper's permanent or page TTL semantics.

## `temp_list`

Splits list inputs and writes a flat comma-separated temporary value when non-empty.

`storage_key`. For example: `{ "type": "temp_list", "storage_key": "topics" }` parses the site's `topic` metadata into flat `temp.topics`. Use this for key fields; the page builder reads `temp.<key>`. See the [complete paired-list example](../configuration/lists.md#collect-page-topics-and-retain-a-recent-list).

## `unstore_value`

Removes a stored entry when an input string equals its current value, then writes a temporary signal.

`unstore_key`: name under `store`; `storage_key` and `storage_value`: the temporary signal. It compares values as strings.

## `temp`

Writes non-empty inputs into a flat temporary field. A single input is retained; multiple values are flattened at the storage boundary.

`storage_key`. Use it for page titles, IDs, descriptions or an exclusion flag. Temporary values are cleared at the next collection.

## `profile`

Learns interests from collected page fields for a named profile.

`storage_key` (or `name`): profile name. `decay`: half-life in seconds; zero creates a new profile without decay but does not clear an existing profile's stored half-life. `weight`: engagement contribution, default `1`. Collect all page fields before this processor. It uses those fields rather than its pipeline's source values. Learning honours consent and configured exclusions.

## `suppress`

Creates one suppression rule per usable scalar input.

`scope`, `mode` (`exclude` or `demote`), `ttl`, optional `factor`; scope defaults to `nid` and mode to `exclude`. Optional `dimension_sub` reduces that dimension's matching counter by `amount` (default `1`). Pass one intended key per input; this processor does not split comma strings itself.

## `advance`

Adds a configured value to a dimension when the pipeline has at least one input.

`dimension` defaults to `stage`; `value` is required; `amount` defaults to `1`. This does not replace every existing stage or rewrite the learned vectors.

See [profile decay and confidence](../concepts-and-tools/fast-and-slow-profiles.md), [suppression](../usage/suppression.md) and [storage and expiry](../concepts-and-tools/storage-and-expiry.md) for complete flows.
