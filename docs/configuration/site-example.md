# Real site configuration

This example uses the configuration from `convivial-govcms`. The [complete JSON configuration](../assets/configuration/site-config.json) contains 44 collection pipelines, the field weights and two profiles with different half-lives. The sections below explain how page metadata reaches those profiles and which values the site publishes.

## Outer settings and engine configuration

```javascript
const Engine = window.ConvivialPersonalisation.default;
const engine = new Engine(settings.config, settings.site, { debug: false });
await engine.collect();
```

Here `settings` is the downloaded JSON object. Its wrapper contains only `site` and `config`. Pass `settings.config` as the first constructor argument, `settings.site` as the second, and an optional options object as the third.

| Setting in this example | Who uses it |
| --- | --- |
| Outer `site` | Passed separately as the engine's storage namespace |
| `config.debug` | Enables local diagnostic traces; the constructor option above overrides it |
| `config.profilers` | The 44 collection pipelines, in authored order |
| `config.profile` | Field weights, tokenisation and vector settings |
| `config.privacy` | Engine consent defaults, GPC and cookie publication controls |
| `config.analytics.events` | Engine data-layer event control; `false` here |

The privacy configuration grants personalisation by default, respects GPC and disables cookie publication. Analytics events are disabled. Connect the site's consent interface to `engine.consent()`; see [consent and data handling](../concepts-and-tools/consent-and-data.md).

On a standalone page, load the configuration and call `collect()` as shown above. In Drupal, the site's initializer connects consent events and starts collection; see [the Drupal integration](../usage/drupal.md).

## Metadata becomes flat candidate fields

| Page input | Temporary field / candidate property | Processing | Weight |
| --- | --- | --- | --- |
| `meta[name="nid"]` | `nid` (resolved to `id`) | `temp` | Identifier only |
| `meta[name="title"]` | `title` | `temp`, text tokens | 5 |
| `meta[name="description"]` | `description` | `temp`, text tokens | 2 |
| `meta[name="keywords"]` | `keywords` | `temp`, text tokens | 3 |
| `meta[name="topic"]` | `topics` | `temp_list`, key features | 4 |
| `meta[name="audience"]` | `audiences` | `temp_list`, key features | 4 |
| `meta[name="intent"]` | `intent` | `temp_list`, key features | 10 |
| `utm_campaign` or `campaign` query parameter | `campaign` | `temp`, key features | 8 |
| `meta[name="stage"]` | `stage` | `temp_list`, key features | 1 |
| `meta[name="type"]` | `type` | `temp`, key features | 2 |

The HTML names `topic` and `audience` map to `topics` and `audiences` fields. Candidate rows must use those resulting names. The keywords field is text, even though its content may contain commas. `profile.text_fields` contains `title`, `description` and `keywords`; all other weighted fields are key fields.

```json
{
  "nid": "cat-guide",
  "title": "Cat care",
  "description": "Caring for cats and kittens",
  "keywords": "cats, kittens, feline",
  "topics": "cp-topic-cats",
  "audiences": "cp-audience-cats",
  "intent": "intent-needs-recommendations",
  "campaign": "cp-cats-fast",
  "stage": "stage-discovery",
  "type": "article",
  "url": "/guides/cats"
}
```

`intent` has weight 10 and `campaign` has weight 8, so both can strongly influence matching. A candidate can still match through other fields when its intent or campaign differs. The `rank()` option `priorityWeight` controls how scores combine similarity with candidate priority.

## Collection order and learning

No `config.order` is supplied, so pipelines run in authored order. The last two are `page_id` and `profiles`. All weighted metadata fields have therefore been collected before the page vector is built.

```json
{
  "processors": [
    { "type": "profile", "storage_key": "fast", "decay": 60 },
    { "type": "profile", "storage_key": "slow", "decay": 3600 }
  ]
}
```

These half-lives are one minute and one hour. Profile names have no built-in half-lives; the `decay` values set them here. After five minutes, an isolated earlier contribution retains `1/32` of its fast strength and about `0.944` of its slow strength. See the [fast and slow walkthrough](../usage/fast-and-slow.md).

## Published choices and rank inputs

| Published output | Priority in this configuration |
| --- | --- |
| `audience` | Override, filter, recent, top dimension |
| `topic` | Override, recent, top dimension |
| `campaign` | Override, campaign parameter, UTM campaign |
| `intent` | Override, cookie, recent |
| `stage` | Override, threshold |
| `next` | Intent, campaign, stage |

These outputs come from `bestpick`. Ranking learns the configured temporary fields; it does not automatically read these published outputs as hard filters. For example, `?audiences=cp-audience-dogs` publishes an audience override but does not replace the page's collected `temp.audiences`.

`audience_filter` is listed as an input but has no writer among these 44 pipelines; it can be supplied by a separate integration. If absent, `bestpick` proceeds to the next usable input.

Both `campaign_param` and `campaign_override` read `?campaign=`. The `campaign_param` pipeline writes `temp.campaign` later than the UTM pipeline and takes precedence for page learning. If neither parameter appears, the page has no freshly collected campaign feature even when a previously stored campaign is still published.

The `intent_satisfied` pipeline removes a matching recent published intent. It does not create a suppression rule or subtract from learned vectors. Add an explicit [suppression](../usage/suppression.md) when completed goals must remove or demote future recommendations.

## Text filtering and exclusions

The example normalises cat/kitten/feline terms to `cats`, dog/puppy/canine terms to `dogs`, and several technical phrases to short canonical terms such as `ai` and `ia`. Synonyms and stopwords apply to text and key labels; an exact key such as `topics.cp-topic-cats` is not synonym-rewritten.

The two phrase-to-`cpblockedphrase` mappings, together with that stopword, remove those phrases from text features. They do not exclude the entire page from learning or prevent a candidate from being returned. `exclude.types` and `exclude.terms` are empty here. Other fields can still contribute a vector. Use [learning exclusions](profile.md#exclusions) to exclude whole pages, or filter the candidate feed to remove content from recommendations.

## List processors

This configuration uses `temp_list` for audiences, topics, intent and stage. To retain a list between collections, use `store_list` with a numeric TTL. The [list processor guide](lists.md) compares their storage and expiry behaviour.
