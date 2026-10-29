# Profiler configuration

The engine accepts one configuration object with `profilers`, `profile`, `privacy`, `analytics`, optional `order` and optional `debug`. Each entry in `profilers` defines a collection pipeline.

## Pipeline properties

| Property | Meaning |
| --- | --- |
| `name` | Normally supplied from the entry's object key |
| `status` | `false`, `0` or `'0'` disables the pipeline; omitted enables it |
| `weight` | Execution order only when `config.order` is `'weight'` |
| `deferred` | Skip the pipeline while a named fetcher cache record remains fresh |
| `sources` | Input definitions run before the pipeline's processing |
| `processors` | State and learning operations, in listed order |
| `destinations` | Output operations, after all processors in this pipeline |

A source's `type`, processor's `type` or destination's `type` selects the plugin. Plugin-specific options sit beside `type`.

## Complete small configuration

This configuration matches the metadata and candidate rows used throughout the guide:

```json
{
  "profile": {
    "fields": { "title": 3, "topics": 4 },
    "text_fields": ["title"],
    "id_field": "nid",
    "dims": 256
  },
  "analytics": { "events": false },
  "profilers": {
    "page_id": {
      "sources": [{ "type": "meta", "attribute_name": "nid" }],
      "processors": [{ "type": "temp", "storage_key": "nid" }]
    },
    "page_title": {
      "sources": [{ "type": "meta", "attribute_name": "title" }],
      "processors": [{ "type": "temp", "storage_key": "title" }]
    },
    "page_topics": {
      "sources": [{ "type": "meta", "attribute_name": "topics" }],
      "processors": [
        { "type": "temp_list", "storage_key": "topics" },
        { "type": "dimension", "storage_key": "topics", "normalize": true }
      ]
    },
    "learn": {
      "processors": [
        { "type": "profile", "storage_key": "fast", "decay": 86400 },
        { "type": "profile", "storage_key": "slow", "decay": 31536000 }
      ]
    }
  }
}
```

All metadata is available before `learn`. The `profile` processors build the learned profiles from the assembled page item. They ignore their pipeline's source list. Asking `rank()` for a profile does not create it.

The runnable `example/config.js` in this repository uses this configuration. Its test checks that the copy here remains identical.

## Publishing a value

Destination storage paths and output names serve different purposes:

```json
{
  "type": "copy",
  "storage_key": "temp.topics",
  "target_key": "page_topics",
  "target_location": { "localstorage": true, "cookie": false },
  "remove_empty": true
}
```

This reads `temp.topics` and publishes a flat `page_topics` key. Destination targets must be explicitly enabled; omitting `target_location` does not implicitly publish to local storage. Cookies require the additional privacy setting.

## Custom plugins

Register plugins with `engine.use()`. Plugin arguments are `(engine, profiler, options, values)`:

```javascript
engine.use({
  sources: {
    page_category(engine, profiler, options, values) {
      const category = document.body.dataset.category;
      if (category) values.push(category);
    }
  }
});
await engine.collect();
```

A custom source may return a promise, which collection awaits. Processors and destinations should complete synchronously; collection does not await promises returned by them. Register plugins before collection. See [the API](../reference/api.md).
