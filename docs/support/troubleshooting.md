# Troubleshooting

## No impression or click events

Check `window.convivialPersonalisation.analytics.events` and `window.convivialPersonalisation.consentState`. Events require analytics enabled and consent equal to `'granted'`. Check whether the site's initializer overrides the configured analytics setting; see [impression and click events](../usage/drupal.md#impression-and-click-events).

`rank()` does not emit events. A custom renderer must call `impression()` after rendering and `click()` on interaction. Inspect the array named by `engine.analytics.datalayer`, which defaults to `window.dataLayer`. If records appear there but not in an analytics dashboard, check the tag-manager triggers and delivery configuration. The library does not send these records over HTTP.

Begin with the running engine's version and snapshot:

```javascript
const engine = window.convivialPersonalisation;
console.log(engine.version);
console.log(engine.snapshot());
engine.debug = true;
```

The version should be `0.2.0`. If the page has another version, inspect the served bundle and the site's asset cache. Enable Verbose browser-console messages and filter on the trace prefix `[convivial-personalisation]`. Reproduce one collection or ranking operation; repeated collection can learn the same page more than once.

## A configured profile is missing

Check that `profile` processors exist with the requested `storage_key` names, all metadata profilers run first, the page contains surviving vector features, and consent allows learning. Inspect `snapshot().page`, `storage.data.temp` and `snapshot().profiles`.

Immediately after collection, learning may still be queued. Wait for the normal fold, or call `fold()` in an isolated diagnostic example. Changes to matching settings can require fresh learning before stored profiles are usable again.

## Every result is fallback

Fallback is expected for a new visitor or denied consent. Otherwise inspect profile confidence, `minConfidence`, field names and `minSim`. Page metadata and candidates must use the same fields and key values. A profile name in a ranking call does not create a profile.

Set `fallback: 'none'` temporarily to see only profile matches. Restore fallback after testing if the component should also show content to visitors without a usable profile.

## Different profiles return the same results

Profiles can return the same content when they have learned similar interests. Check their configured `decay` values and test with different browsing histories over time. Names such as `fast` and `slow` have no built-in learning behaviour.

## Relevant rows disappear

Check current-page ID, seen history and `seenWindow`, live suppressions, similarity and the number of requested slots. Supply unique candidate IDs. A page-learning exclusion does not itself remove a candidate from a feed.

Temporarily set `removeSeenItems: false` and `excludeCurrent: false` to check whether those filters explain a missing row. Restore the site's settings after the comparison.

## Results seem out of score order

The library selects per profile in request order, may reorder for variety, and appends fallback. The combined results can therefore be out of score order. Render `pos` order as returned. Check `prior` and `priorityWeight` when feed order outweighs similarity.

## Empty or unlabelled explanations

`result.why` is built from the items a profile selected. It is empty when every row is fallback, when `explain` is `false`, or when no term passes the noise floor. With one selected row, only terms carrying at least `whyFloor` of its similarity are kept. Lower `whyFloor` or raise `whyMax` to see more terms, and read `result.why_detail` for the shares.

A key shown as its machine name, such as `topic-ai`, has no label. Add it to `config.data`, `profile.labels` or the JSON at `profile.labels_url`, then check `engine.labels()`. A fetched label file is cached for a day in `localStorage.convivial_personalisation_labels`; remove that entry to refetch. Labels never change scores or order.

Page metadata and candidate rows must use keys only. A value such as `topic-ai|Artificial intelligence` is hashed as one unknown key and matches nothing.

## Missing published values

Check the internal storage path, destination target settings, consent, persistence and the value returned by `engine.published()`. Internal `store` TTL and an already-published flat output are separate; run destinations to update or remove stale outputs. Cookie writing is disabled by default.

## Matching ignores an expected field

Check that the field has a positive weight in `profile.fields`. Text fields must also appear in `text_fields`; category IDs must match the collected values. Review `stopwords`, `synonyms` and `keep_short` when useful text is missing from matches.
