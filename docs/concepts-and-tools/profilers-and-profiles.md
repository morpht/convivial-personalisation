# Profilers, profiles and dimensions

Personalisation uses three related ideas. A **profiler** collects information from a page or browser. A **profile** learns interests from that information. A **dimension** counts named categories, such as topics or audiences.

On a gardening page, a profiler can read the topic, the fast and slow profiles can learn from it, and the topics dimension can add one to its gardening count. Ranking uses the learned profiles; a component that needs the leading topic can use the dimension.

A learned profile is stored as a vector: a numeric representation used to compare interests with content.

| Concept | Stored or configured as | Example |
| --- | --- | --- |
| Profiler | Entry in `config.profilers` | `page_topics` reads metadata |
| Source | Profiler's `sources` | `meta` reads `topics` |
| Processor | Profiler's `processors` | `temp_list` writes page topics; `profile` learns a vector |
| Destination | Profiler's `destinations` | `top` publishes the strongest audience |
| Page metadata | `storage.data.temp` | `topics: 'gardening,transport'` |
| Profile | `storage.data.profiles.<name>` | `fast` or `slow`, with vector and half-life |
| Dimension | `storage.data.dimensions.<name>` | `topics: { gardening: 3, transport: 1 }` |
| Published value | Flat key read by `engine.published()` | `selected_audience: 'students'` |

## How they work together

A metadata profiler can use both `temp_list` and `dimension` processors. The temporary values supply fields to the vector builder. The counters supply category leaders for `top` and `tops` destinations and matching labels in ranked items' `why` arrays.

After all metadata has been collected, a profiler with two `profile` processors can queue the same page vector for `fast` and `slow`. Each profile keeps its own half-life and accumulation. The profile names are configuration choices; the engine does not create them simply because a ranking call asks for them.

## Profile vectors and dimension counters

Named profiles decay over time and compare their vectors with candidate vectors. Dimension counters remain ordinary numeric totals until changed or erased; the `dimension` processor does not apply a fast or slow decay window.

Profile confidence is the remaining vector magnitude, capped at one. Dimension confidence is the leading counter's margin over the second counter, divided by the leading counter. They answer different questions and are not probabilities.

Use [fast and slow profiles](fast-and-slow-profiles.md) for ranking behaviour and [audience choices](../usage/audience.md) for publishing a category value.
