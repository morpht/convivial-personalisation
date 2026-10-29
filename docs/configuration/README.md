# Configuration

Configuration connects the metadata on your pages to the fields used for learning and ranking. Start with the collection pipelines and field names, then use the complete site example to see them together.

- [Profiler configuration](profilers.md): order sources, processors and destinations.
- [Fields and profile configuration](profile.md): use matching fields for page metadata and candidate rows.
- [List processors: temp_list and store_list](lists.md): collect comma-separated values for page learning or storage.
- [Real site configuration](site-example.md): follow all 44 pipelines, their field mapping and the fast/slow settings.

## Engine settings

The first constructor argument supports these top-level settings:

| Setting | Purpose |
| --- | --- |
| `profilers` | Collection pipelines; see [profiler configuration](profilers.md) |
| `profile` | Vector fields, weights and tokenisation; see [profile configuration](profile.md) |
| `privacy` | `consent_default`, `respect_gpc`, `cookies` and `cookie_days` |
| `analytics` | `events` and `datalayer` |
| `order` | Set to `'weight'` to sort pipelines by weight; omitted uses authored order |
| `debug` | Enable local diagnostic traces |

See [consent and data handling](../concepts-and-tools/consent-and-data.md) for privacy and analytics defaults. Experiment allocation is not implemented. The `variant()` API returns `'personalised'` without assigning a control group.

Pass the site ID separately as the second constructor argument. Runtime options `persist`, `now` and `debug` belong in the third argument; see [the constructor](../reference/api.md#constructor). Unknown settings are generally ignored, so a configuration that loads successfully may still contain options with no effect.
