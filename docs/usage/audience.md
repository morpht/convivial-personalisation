# Prioritise an audience choice

An explicit choice and a learned interest are different signals. Use collection pipelines to record each, then decide how the site should use them.

This guide assumes an engine configuration with an `audiences` vector field. Add the following pipelines to `profilers` in the order shown. The result is a published `audience` value that components can read.

## Publish an explicit choice

```json
{
  "sources": [{ "type": "query", "param": "audience" }],
  "processors": [{ "type": "store", "storage_key": "audience_choice", "ttl": 3600 }],
  "destinations": [{
    "type": "copy",
    "storage_key": "store.audience_choice.value",
    "target_key": "audience_choice",
    "target_location": { "localstorage": true },
    "remove_empty": true
  }]
}
```

A URL containing `?audience=students` records and publishes `students`. The `store` TTL governs the internal entry. Its published output is a separate key; run the relevant pipeline to refresh or remove that output when the internal entry expires.

## Count and publish learned categories

A page-audience profiler can combine `temp_list` with `dimension` using `storage_key: 'audiences'`. The temporary field contributes to the vector when configured in `profile.fields`. The dimension accumulates named counters and can feed this destination:

```json
{
  "type": "top",
  "dimension": "audiences",
  "min_confidence": 0.25,
  "mixed_value": "mixed",
  "target_key": "audience_learned",
  "target_location": { "localstorage": true },
  "remove_empty": true
}
```

The confidence threshold here measures the leading dimension's margin, not fast or slow profile confidence. Dimension counts do not automatically decay.

## Give the explicit choice precedence

Place a final profiler after the choice and learned-category profilers. Its `bestpick` destination can publish the first usable output:

```json
{
  "type": "bestpick",
  "storage_keys": ["audience_choice", "audience_learned"],
  "default_value": "general",
  "target_key": "audience",
  "target_location": { "localstorage": true }
}
```

Read the result with `engine.published('audience')`, including in memory-only operation. `bestpick.storage_keys` names published keys, unlike destinations that read internal storage paths.

This published category does not automatically filter `rank()` results. A recommendation component can filter its candidate pool using the explicit choice, while the configured fast and slow vectors rank the remaining items. Keep audience keys consistent across collection and candidate fields.

After collecting a URL containing `?audience=students`, check that `engine.published('audience')` returns `'students'`. Once the stored choice has expired and collection runs again, the result should come from the learned category or the `general` default.
