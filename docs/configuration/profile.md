# Fields and profile configuration

The singular `config.profile` object defines the fields used for content matching. Named `profile` processors choose which profiles learn from the collected page.

## Align page and candidate fields

```json
{
  "profile": {
    "fields": { "title": 3, "description": 2, "topics": 4, "audiences": 4, "intent": 4, "stage": 2, "type": 2 },
    "text_fields": ["title", "description"],
    "id_field": "nid",
    "dims": 256,
    "keep_short": ["ai", "ux"],
    "synonyms": { "information architecture": "ia" },
    "stopwords": ["portal"],
    "bigrams": true
  }
}
```

Collect each page field into `temp` under exactly that name. Supply candidate rows with the same flat names. There is no automatic alias between `topics` and `profile_topic`, and no `value` wrapper around a candidate row.

A supplied `fields` map replaces the default map; include every field you want. A supplied `text_fields` array also replaces its default. Weights must be positive finite numbers.

## Defaults and options

| Setting | Default | Effect |
| --- | --- | --- |
| `fields` | `profile_title: 3`, `profile_description: 2`, `profile_topic: 4`, `profile_audience: 4`, `profile_intent: 4`, `profile_stage: 2`, `profile_type: 2` | Feature fields and weights |
| `text_fields` | `profile_title`, `profile_description`, `profile_summary`, `profile_headings`, `profile_body` | Text processing for fields that also have a weight |
| `dims` | `256`, minimum `16` | Matching representation size; normally leave at the default |
| `text_cap` | `300` | Maximum processed words per text input |
| `id_field` | `'nid'` | Preferred page and candidate ID field |
| `stopwords` | `[]` | Additional words removed alongside the built-in English list |
| `synonyms` | `{}` | Alias-to-canonical replacements |
| `keep_short` | `[]` | Useful short words retained after stopword filtering |
| `bigrams` | `true` | Include adjacent surviving word pairs |
| `exclude` | `{ types: [], terms: [], fields: [] }` | Page-learning and feature exclusions |

`profile_summary`, `profile_headings` and `profile_body` have no default weights, despite appearing in the default text-field list.

## Exclusions

- A page with `temp.exclude` equal to `true`, `1`, `'1'` or `'true'` is excluded from profile learning.
- `exclude.types` compares the first value of the page's `profile_type` field, or `type` when `profile_type` is null or absent. Matching is exact and case-sensitive.
- `exclude.terms` uses full key features such as `topics.private`. A matching page is excluded from learning; those features are also removed when constructing vectors.
- `exclude.fields` omits individual fields from vector construction.

A learning exclusion is not a candidate access filter. Ranking does not automatically exclude candidate rows by the page-learning rules. Filter the feed or use an explicit [suppression](../usage/suppression.md) when a row must not be recommended. Content access permissions remain the server's responsibility.

## IDs and display fields

The current page ID comes from temporary metadata, preferring `id_field`, then `id`, then `nid`. Candidate resolution tries `id_field`, `id`, `nid`, `uuid`, and `url`, using the first non-empty value and converting it to a string. Use stable unique IDs to make current-page and seen-history filters reliable.

Candidate display fields such as `url` and image data remain on returned objects even when they are not vector fields. An empty optional field contributes no features. See [content matching](../concepts-and-tools/content-vectors.md).
