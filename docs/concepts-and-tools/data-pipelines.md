# Collection and learning lifecycle

Call `collect()` to run the configured pipelines. Each pipeline reads its sources, applies its processors and runs its destinations. Asynchronous sources are awaited before that pipeline's processing begins.

```javascript
await engine.collect();
const topic = engine.published('preferred_topic');
```

`engine.ready` is the promise for the latest collection. Constructing an engine does not start collection; the initializer must call `collect()` before components use `ready` to wait for it.

## Order the pipelines

Pipelines run in their configured order, or by numeric profiler `weight` when `config.order` is `'weight'`. Place page-field collection before any `profile` processors. A profile processor's own `weight` controls learning strength, separately from pipeline order.

Sources can finish at different times. Use separate ordered pipelines when one value must take precedence. Collection logs plugin errors and continues, so inspect diagnostics if an expected output is missing.

## When learning is available

Configured profile learning is applied after collection resolves. Ranking immediately after `await engine.collect()` can therefore use earlier browsing history. Additional asynchronous work, such as fetching a feed, may allow the current page to be learned first.

For a controlled example, call `engine.fold()` to finish queued learning before inspecting results. Normal integrations should collect once per intended page view; repeated collection can learn the same page again. `rank()` does not learn its candidates or mark displayed recommendations as seen.

Avoid overlapping collection calls. Starting a new collection or erasing state prevents earlier pending results from updating the engine.

See [the API](../reference/api.md) for method details and [profiler configuration](../configuration/profilers.md) for caching and ordering settings.
