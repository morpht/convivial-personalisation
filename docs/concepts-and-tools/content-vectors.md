# Content matching

When profiles are configured, the library compares a candidate's selected fields with learned visitor interests. The builder chooses those fields and their relative weights in `config.profile`.

## Align page and candidate fields

Use the same field names and category IDs for collected page data and candidate rows. For example, collect topics into `temp.topics` and supply candidates with a `topics` property. Different names are not matched automatically. See the [configuration example](../configuration/site-example.md#metadata-becomes-flat-candidate-fields).

Fields listed in `text_fields` are treated as text. Other weighted fields are treated as category keys. A value such as `gardening|Gardening` provides a stable ID and a readable label; commas separate multiple values.

## Choose relevant inputs

Higher field weights give a field more influence on matching. They do not guarantee a particular number of recommendations. Include a field in `fields` for it to contribute, even when it also appears in `text_fields`.

Use `synonyms` for equivalent terms, `stopwords` for words to ignore and `keep_short` for useful short words. These settings affect matching while the original content remains available for display. Exact category IDs should be consistent across your content.

Candidates with no usable matching fields can still appear through fallback. Changes to matching settings can require fresh learning before stored profiles are usable again.

See [fields and profile configuration](../configuration/profile.md) for settings and [ranking](ranking.md) for result behaviour.
