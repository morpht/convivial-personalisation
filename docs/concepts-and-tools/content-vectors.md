# Content vectors and matching

A content vector represents a page's selected fields as numbers so the library can compare it with a visitor's interests. Titles, topics and audiences can all contribute. The fields and their weights come from `config.profile`.

The same conversion is used for pages the visitor reads and content offered as recommendations. Collect a page's topics under `topics` and use `topics` in candidate rows too; different field names will not match automatically. The [site configuration](../configuration/site-example.md#metadata-becomes-flat-candidate-fields) shows a complete mapping.

## Text fields and key fields

A field listed in both `profile.fields` and `profile.text_fields` contributes text tokens. Text is lowercased, synonyms are applied, stopwords are removed and remaining words are stemmed. Bigrams join adjacent surviving tokens. For example, `housing and transport` produces word features including `hous` and `transport` and a bigram `hous_transport`.

A configured field outside `text_fields` is a key field. `topics: 'housing,transport'` contributes `topics.housing` and `topics.transport`. Commas separate values; spaces inside a value remain part of that value. This is simple comma splitting, not quoted CSV parsing.

`topics: 'housing|Housing services'` adds the exact key feature and text features from the label. The key itself is not stemmed or mapped through synonyms. There is no special Drupal taxonomy object inside the engine.

## Synonyms, stopwords and short words

`synonyms` maps aliases to canonical words or phrases. Phrase matching is case-insensitive and tolerates repeated whitespace. Use one direction consistently, for example `{ "information architecture": "ia" }`. Canonical words can survive short-word filtering and bypass stemming.

The built-in English stoplist remains active. `stopwords` adds site-specific words. Stopwords are removed from replacement text too: mapping `ia` to `information architecture` retains `architecture` because `information` is a stopword. A single stopword cannot be rescued by a synonym or `keep_short`.

Words shorter than three characters are normally removed; `keep_short` can retain useful words such as `ai` and `ux`. Numeric tokens are normally removed except years from 1900 to 2099. The Porter stemmer can turn `housing` into `hous` and `services` into `servic`. These internal features do not change the original display text.

## Hashing and weights

Each feature contributes to a slot selected by CRC32 modulo `dims` (default `256`). Another hash bit supplies its sign. A repeated feature contributes according to its field weight and `1 + log(term frequency)`. The result is normalised to unit length.

Hash slots are shared, so collisions are possible. A vector slot is not a named topic. Field weights act before normalisation; setting a field's weight to four does not guarantee four times as many recommendations about it.

A field contributes only when it has a positive finite weight, a non-empty value and is not excluded. A field in `text_fields` without a weight in `fields` contributes nothing.

## Compare candidates with learned profiles

Cosine similarity compares vector direction. Similarity near `1` means strong alignment in this feature space; negative or low similarity is possible. A candidate must meet `minSim` for profile selection. Its score then combines similarity, the configured priority and any demotion.

A page or candidate with no surviving features has no vector. It cannot be a profile match but an eligible candidate can still appear through fallback. Original titles, descriptions and URLs remain available for rendering.

## Configuration changes

A configuration hash identifies compatible vectors. Fields, field weights, text-field choices, dimensions, tokenisation options and exclusions contribute to this hash. The engine will not use a profile built under a different hash. Visit suitable pages again to learn under the new configuration.

See [fields and profile configuration](../configuration/profile.md) for the complete configuration and [ranking](ranking.md) for selection rules.
