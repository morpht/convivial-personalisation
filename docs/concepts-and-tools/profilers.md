# Profilers

A profiler defines a unit of work for Convivial Personalisation. It contains sources, processors and destinations. The engine runs these stages when you call `collect()`.

## The three stages

| Stage | Purpose | Example |
| --- | --- | --- |
| Source | Read inputs into the profiler's values | `query` reads a URL parameter |
| Processor | Process those values or update engine state | `dimension` counts the supplied topics |
| Destination | Make results available to site components | `top` publishes the leading topic |

Each entry in `config.profilers` configures one profiler. Its `sources`, `processors` and `destinations` arrays select plugins and their options. A stage can be omitted when the profiler does not need it.

The engine creates a fresh values array for each profiler. Its sources populate that array, its processors run in their listed order, and its destinations run last. Asynchronous sources finish before processing begins.

## Follow a value through a profiler

The [collection example](../getting-started/installation.md) defines a profiler named `topics`:

1. The `query` source reads `gardening` from `?topic=gardening`.
2. The `dimension` processor adds that value to the engine's topic counts.
3. The `top` destination publishes the leading topic as `preferred_topic`.

The profiler defines the work to perform. The values retained by that work belong to [engine state](engine-state.md). Other profilers and site components can use that shared state.

## Configure and run profilers

Use [profiler configuration](../configuration/profilers.md) to select plugins, enable or disable a profiler, and set its execution order. The plugin references describe the available [sources](../reference/sources.md), [processors](../reference/processors.md) and [destinations](../reference/destinations.md).

See [collection and learning lifecycle](data-pipelines.md) for collection timing and operations that depend on earlier profilers.
