# List processors: temp_list and store_list

Use `temp_list` and `store_list` for sources that return comma-separated or repeated values. `temp_list` prepares fields for page learning; `store_list` retains a list with an expiry time.

## Choose the processor

| Processor | Location | What it stores | Expiry |
| --- | --- | --- | --- |
| `temp` | `temp.<key>` | A single input as supplied, or multiple inputs flattened at the storage boundary | Cleared on the next collection |
| `temp_list` | `temp.<key>` | Parsed list, trimmed and flattened with comma-and-space separators | Cleared on the next collection |
| `store` | `store.<key>.value` | Each input replaces the previous one; last input wins | Shared TTL helper |
| `store_list` | `store.<key>.value` | Parsed list joined with commas | Explicit numeric TTL; `-1` means one year |

Both list processors split comma strings, accept arrays, trim entries and omit empty entries. They preserve duplicates and input order. Profile learning is configured separately through `profile` processors.

## Collect page topics and retain a recent list

```json
{
  "sources": [{ "type": "meta", "attribute_name": "topic" }],
  "processors": [
    { "type": "temp_list", "storage_key": "topics" },
    { "type": "store_list", "storage_key": "topics_recent", "ttl": 300 }
  ],
  "destinations": [{
    "type": "copy",
    "storage_key": "store.topics_recent.value",
    "target_key": "topics_recent",
    "target_location": { "localstorage": "localstorage", "cookie": "0" },
    "remove_empty": true
  }]
}
```

For `<meta name="topic" content=" topic-ai, , topic-personalisation ">`, the result is:

```json
{
  "temp.topics": "topic-ai, topic-personalisation",
  "store.topics_recent.value": "topic-ai,topic-personalisation"
}
```

The dotted keys above are storage read paths. Page learning reads the flat temporary `topics` value at `temp.topics`. Consumers read the published recent list through `engine.published('topics_recent')`.

The [configuration example](site-example.md) uses `temp_list` for page topics. Add `store_list` when those values should remain available between collections.

## Retention details

Use `ttl: 300` for five minutes with `store_list`, or `ttl: -1` for one year. It adds other TTL values directly to the current timestamp and does not use `store`'s permanent/page helper. Do not assume omitted TTL, `0` or `'page'` means the same thing for these two processors.

With no parsed input, a list processor does not write a new value. `temp` was already cleared at collection start. A previously stored list can remain until a later expiry sweep removes it. An already-published output is separate; rerun its destination to refresh or remove it.

## Dimension counters alongside lists

The `dimension` processor already parses comma-separated values. The site uses it alongside `temp_list` to update category counters while preparing the page vector. There is no separate built-in `dimension_list` processor.

See the [temp_list reference](../reference/processors.md#temp_list), [store_list reference](../reference/processors.md#store_list), and [site field mapping](site-example.md#metadata-becomes-flat-candidate-fields).
