# Profilers, profiles and dimensions

A **profiler** is a configured pipeline of sources, processors and destinations. A **dimension** counts named categories, such as topics or audiences. An optional learned **profile** represents visitor interests for content matching.

| Configuration element | Purpose | Example |
| --- | --- | --- |
| Source | Read an input | `query` reads a topic parameter |
| Processor | Transform or retain values | `dimension` counts topics; `store` saves a value |
| Destination | Make results available to components | `top` publishes the leading topic |
| Profile processor | Learn interests for content ranking | `profile` updates a profile named `interests` |

A pipeline can read a topic, add it to a dimension and publish the leading topic without creating a learned profile. See [collect and publish a value](../getting-started/installation.md).

## Add optional learning

When ranking needs learned interests, collect the page fields first and place `profile` processors afterwards. Each processor's `storage_key` names the profile it updates. The builder chooses the number of profiles and their settings; requesting a name in `rank()` does not create it.

Dimensions and profiles serve different purposes. Dimensions provide category counts and values for destinations. Profiles provide learned interests for content matching. A pipeline can update both when the site needs both outputs.

Profile learning can use a configured half-life. Dimension counters remain totals until changed or erased. See [profile decay and confidence](fast-and-slow-profiles.md) and [audience choices](../usage/audience.md).
