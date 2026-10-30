# Ranking and recommendations

`engine.rank()` selects from the candidate rows supplied by a component and returns them in display order. Pass the names of configured profiles, or `[]` to request fallback only.

## Control selection

- Use `excludeCurrent` and `removeSeenItems` to omit the current page and recently viewed content.
- Use `minSim` and `minConfidence` to set minimum matching requirements.
- Use `prior` and `priorityWeight` to balance content priority with learned relevance.
- Use `diversify` to vary the order of profile-selected results.
- Use suppression rules to exclude or demote content after a visitor action.

An array of profile names lets the library allocate results according to available confidence. An object requests a count for each profile, such as `{ interests: 3 }`. Similar profiles can share a selection, and missing profiles cannot fill their requested slots.

## Fallback

Fallback supplies eligible content when learned matches cannot fill the requested count, including for new visitors. The default settings preserve feed order for fallback. Other priority or demotion settings can change that order.

Use `fallback: 'none'` to return only profile matches. Fallback respects the active current-page, seen-history and suppression filters. Results may be shorter than requested when there are too few eligible candidates.

## Interpret results

Each result includes its selecting `profile`, `score`, similarity `sim` and display position `pos`. Fallback rows use `profile: 'fallback'` and `sim: null`. Render the returned order; scores alone do not determine the final display order.

With `explain: true`, `why` lists matching dimension labels. These labels help describe a match but are not a breakdown of its score. A relevant result can have an empty `why` array, for example when it matches through text rather than a collected dimension.

Ranking adds result fields to the supplied objects. Clone rows when another component needs them unchanged, and provide unique IDs in the candidate feed.

See [the rank reference](../reference/rank.md) for options and defaults, or [recommendation blocks](../usage/recommendations.md) for integration code.
