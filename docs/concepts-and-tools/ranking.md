# Ranking and recommendations

`engine.rank()` selects from the candidate rows supplied by a component and returns a result whose `items` are in display order, together with a `why` that explains the block. Pass the names of configured profiles, or `[]` to request fallback only.

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

## Explain a block

`result.why` describes the block as a whole, for example `['Gardening', 'garden', 'growing']`. Each selected row's similarity is split back onto the terms that produced it, the positive parts are summed across the block, and the strongest terms are kept: those shared by two or more selected rows, or carrying at least `whyFloor` of the block's similarity. Keys are shown through the configured labels; text terms show the word as written. Fallback rows contribute nothing, so a block of fallback rows has an empty `why`.

This works for taxonomy keys and free text alike, including feeds with only a title and description. Use `why_detail` to see each term's share and the rows it came from. Labels are presentation only and never change scores or order. See [block explanation](../reference/rank.md#block-explanation) for the exact rule and [labels](../configuration/profile.md#labels-for-explanations) for the sources.

Ranking adds result fields to the supplied objects. Clone rows when another component needs them unchanged, and provide unique IDs in the candidate feed.

See [the rank reference](../reference/rank.md) for options and defaults, or [recommendation blocks](../usage/recommendations.md) for integration code.
