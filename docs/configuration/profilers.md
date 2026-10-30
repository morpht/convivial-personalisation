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

## Define a pipeline

Each entry under `config.profilers` can have sources, processors and destinations. For example, this pipeline collects the document title into a temporary field:

```json
{
  "page_title": {
    "sources": [{ "type": "document_part", "part": "title" }],
    "processors": [{ "type": "temp", "storage_key": "title" }]
  }
}
```

Place it inside `config.profilers`. Add only the processors and destinations the site needs. See the [configuration example](site-example.md) for a small downloadable setup with optional profile learning.

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
