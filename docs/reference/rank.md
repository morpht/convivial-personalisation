# rank() arguments and options

```javascript
const engine = window.convivialPersonalisation;
await engine.ready;
const ranked = engine.rank(structuredClone(items), ['fast', 'slow'], 3, {
  block: 'related-content'
});
```

The initializer must already have constructed the engine and started collection. `rank()` is synchronous. It receives candidates; it does not fetch or render them.

## Arguments

```text
engine.rank(items, profiles = ['fast', 'slow'], count = 5, options = {})
```

| Argument | Meaning |
| --- | --- |
| `items` | Array of flat row objects with configured fields and stable unique IDs |
| `profiles` | Array of profile names, or object mapping names to requested slot counts |
| `count` | Maximum number of results; use a non-negative integer |
| `options` | Controls below; omitted options use their defaults |

The engine supplies its configuration, learned vectors, current-page ID, seen history, suppressions and interests to the ranking calculation.

```javascript
engine.rank(structuredClone(items), ['fast', 'slow'], 5);
engine.rank(structuredClone(items), { fast: 2, slow: 3 }, 5);
engine.rank(structuredClone(items), [], 5);
```

The first call allocates slots by confidence. The second requests fixed slots. The third requests fallback only. Profile names must have been learned by configured `profile` processors. Unavailable profiles relinquish their selection; unused capacity can be filled by fallback.

An empty candidate array or zero count returns `[]`. An empty profile array still allows fallback. Distinct row objects with the same ID are not generally deduplicated. Deduplicate your feed first.

## Options

| Option | Default | Behaviour |
| --- | --- | --- |
| `block` | `'default'` | Identifies recorded results and diagnostic traces |
| `excludeCurrent` | `true` | Remove the current page by resolved ID |
| `removeSeenItems` | `true` | Remove IDs viewed within the seen window |
| `seenWindow` | `2592000` | Seen window in seconds (30 days) |
| `minSim` | `0.05` | Minimum cosine similarity for a profile-selected row |
| `minConfidence` | `0` | Minimum usable profile confidence |
| `mergeThreshold` | `0.9` | Merge requested profile directions at or above this cosine similarity |
| `prior` | `'order'` | Non-personal priority: order, recency, editorial, none, or function |
| `priorityWeight` | `0.2` | Priority's score share; remaining share is similarity |
| `recencyHalfLife` | `2592000` | Half-life in seconds for recency priority |
| `fallback` | `'order'` | Fill remaining slots by prior times demotion; `'none'` disables padding |
| `diversify` | `true` | When more than two rows are selected by profiles, reorder them using the first configured key field other than `type` or `profile_type`; fallback rows are appended afterwards |
| `explain` | `true` | Add dimension-based `why` labels |

`priorityWeight` is parsed as a number and clamped to `[0, 1]`; an invalid value uses `0.2`. `minSim` still applies to profile selection even when priority weight is `1`.

## Priority choices

| `prior` | Calculation |
| --- | --- |
| `'order'` | First original input row is 1, last is 0; a single row is 1. Filtering does not renumber it. |
| `'recency'` | Uses the first available `changed`, `updated`, `created`, or `date`; numeric timestamps are Unix seconds. Missing or unusable dates receive 0.5. |
| `'editorial'` | `1 / (1 + max(0, weight))`; lower numeric row weights win. Invalid weights receive 0.5. |
| `'none'` | Constant 0.5. Set `priorityWeight: 0` for similarity-only scoring. |
| Function | `(item, index, total) => number`, interpreted as a priority between 0 and 1 |

Fallback uses prior times demotion, independent of `priorityWeight`. Choosing `prior: 'recency'` can therefore change fallback order even when `fallback` remains `'order'`.

## Returned rows

| Field | Meaning |
| --- | --- |
| `id` | Resolved string identifier |
| `profile` | Selecting profile name or `'fallback'` |
| `sim` | Cosine similarity, or null for fallback |
| `score` | Weighted score for a match, or prior times demotion for fallback |
| `pos` | One-based final display position |
| `why` | Matching dimension labels when explanations are enabled |

Original display fields remain. The input array's objects are mutated; a new array is returned. Internal temporary ranking fields are removed. Reusing already-ranked objects with `explain: false` does not clear an earlier `why` field, so clone clean feed rows for each ranking run.

Render the returned order. Sequential profile selections, variety reordering and fallback mean it is not a global score sort. [Ranking concepts](../concepts-and-tools/ranking.md) explain the process.
