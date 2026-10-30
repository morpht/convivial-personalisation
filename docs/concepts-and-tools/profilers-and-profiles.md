# Profilers, profiles and dimensions

A **profiler** is a configured pipeline of sources, processors and destinations. A **dimension** counts named categories, such as topics or audiences. A learned **profile** represents interests for content matching and is optional.

For example, a profiler can read a topic from a URL parameter, add to the topics dimension and publish its leading value. A site can use that value without creating a learned profile. Adding a `profile` processor enables learning for ranking.

A learned profile is stored as a vector: a numeric representation used to compare interests with content.

| Concept | Stored or configured as | Example |
| --- | --- | --- |
| Profiler | Entry in `config.profilers` | `page_topics` reads metadata |
| Source | Profiler's `sources` | `meta` reads `topics` |
| Processor | Profiler's `processors` | `temp_list` writes page topics; `profile` learns a vector |
| Destination | Profiler's `destinations` | `top` publishes the strongest audience |
| Page metadata | `storage.data.temp` | `topics: 'gardening,transport'` |
| Profile | `storage.data.profiles.<name>` | `interests`, with vector and half-life |
| Dimension | `storage.data.dimensions.<name>` | `topics: { gardening: 3, transport: 1 }` |
| Published value | Flat key read by `engine.published()` | `selected_audience: 'students'` |

## How they work together

A metadata profiler can use both `temp_list` and `dimension` processors. The temporary values supply fields to the vector builder. The counters supply category leaders for `top` and `tops` destinations and matching labels in ranked items' `why` arrays.

When learning is configured, place its `profile` processors after the pipelines that collect the page fields. Each processor queues the page vector for the name in its `storage_key`, with its own half-life and accumulation. The builder chooses the profile names and number of profiles; a ranking call does not create them.

## Profile vectors and dimension counters

Named profiles decay over time and compare their vectors with candidate vectors. Dimension counters remain ordinary numeric totals until changed or erased; the `dimension` processor does not apply a fast or slow decay window.

Profile confidence is the remaining vector magnitude, capped at one. Dimension confidence is the leading counter's margin over the second counter, divided by the leading counter. They answer different questions and are not probabilities.

Use [profile decay and confidence](fast-and-slow-profiles.md) for ranking behaviour and [audience choices](../usage/audience.md) for publishing a category value.
