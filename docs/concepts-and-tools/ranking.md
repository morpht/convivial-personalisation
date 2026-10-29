# Ranking and recommendations

`engine.rank()` returns a new array of selected candidate objects in the order a component should display them. It uses the requested visitor profiles and the engine's current page, seen history and suppression rules.

## From candidates to results

1. Resolve candidate IDs and remove the current page, recent seen items and excluded items according to the active options.
2. Build candidate vectors and non-personal priorities from the same field configuration used for learning.
3. Select usable requested profiles and merge directions that agree closely.
4. Allocate result slots by confidence or the caller's fixed requests.
5. For each profile in request order, score eligible unused rows and select its allocated results.
6. Optionally reorder selected results for variety, then fill any empty slots from eligible fallback rows.
7. Add positions and explanatory labels and return the array.

The final list is assembled from profile selections and fallback. It is not necessarily sorted globally by score. Render the returned order instead of sorting it again.

## Scores

For a candidate that passes the similarity threshold:

```text
score = (priorityWeight * prior + (1 - priorityWeight) * clamp(similarity, 0, 1)) * demotion
```

At the default `priorityWeight: 0.2`, priority contributes 20% and similarity contributes 80% before demotion. Set `priorityWeight: 0` for similarity-only scoring. Even at `1`, a profile-selected row still needs a vector and must pass `minSim`.

Keep field weights, profile engagement weights and ranking priority separate. Field weights change vectors. Engagement weights change a visit's contribution. Priority weight changes the final ranking score.

## Fallback

A new visitor, an expired profile or exhausted profile matches can leave slots empty. Unless `fallback: 'none'`, the engine fills them from the remaining filtered candidates in prior-times-demotion order, preserving original input order for ties. With the default `prior: 'order'`, this follows the feed's order.

Fallback rows have `profile: 'fallback'`, `sim: null` and a score of prior times demotion. Fallback respects the filters already applied; it cannot restore a suppressed or excluded current-page candidate. Results can be shorter than the requested count when the eligible pool is exhausted.

## Variety and explanations

`diversify` can reorder more than two profile-selected results to avoid adjacent rows with the same first value of the first configured key field (excluding `type` and `profile_type`). It does not diversify the fallback rows appended afterwards and does not guarantee a particular distribution.

`why` contains matches against the top dimension counters for configured key fields. It is separate from vector scoring. Empty `why` does not mean a score was wrong: a match can come from text or from features without corresponding dimension counters. Enable debug traces when you need the scoring calculation.

## Mutation and identity

Ranking modifies the candidate objects by adding or updating `id`, `score`, `sim`, `profile`, `pos` and, when enabled, `why`. Clone rows before calling when another component needs the original objects. Selection tracks object identity, so distinct objects with the same ID can both appear. Give candidates stable unique IDs and deduplicate the feed before ranking.

See [the rank reference](../reference/rank.md) for all options and [recommendation blocks](../usage/recommendations.md) for integration code.
