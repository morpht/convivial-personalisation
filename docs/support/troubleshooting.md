# Troubleshooting

Begin with the running engine's version and snapshot:

```javascript
const engine = window.convivialPersonalisation;
console.log(engine.version);
console.log(engine.snapshot());
engine.debug = true;
```

The version should be `1.0.0`. If the page has another version, inspect the served bundle and the site's asset cache. Enable Verbose browser-console messages and filter on the trace prefix `[convivial-profiler]`. Reproduce one collection or ranking operation; repeated collection can learn the same page more than once.

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

## Empty explanation labels

`why` uses top dimension counters. Vector learning alone does not populate those counters. Add a `dimension` processor for key fields if the component needs their labels. Text matches can still be relevant with an empty `why` array.

## Missing published values

Check the internal storage path, destination target settings, consent, persistence and the value returned by `engine.published()`. Internal `store` TTL and an already-published flat output are separate; run destinations to update or remove stale outputs. Cookie writing is disabled by default.

## HTTP data arrives too late

The `get` source returns a promise and collection awaits it before processing that pipeline. Ensure custom asynchronous sources also return their promises. Call `collect()` before components await `ready`. Look for source errors, a deferred pipeline with a fresh cache, or a newer collection cancelling stale work.

## Matching ignores an expected field

Check that the field has a positive weight in `profile.fields`. Text fields must also appear in `text_fields`; category IDs must match the collected values. Review `stopwords`, `synonyms` and `keep_short` when useful text is missing from matches.

## Preview or checks use another checkout

Run `npm start`, `npm run check` and `npm test` in this repository. The tools resolve this repository relative to themselves. Remove an unintended `CONVIVIAL_DOCS_ROOT` environment override. Restart the preview after editing; it loads documentation at startup.
