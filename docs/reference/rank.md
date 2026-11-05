# rank() arguments and options

```javascript
const engine = window.convivialPersonalisation;
await engine.ready;
const result = engine.rank(structuredClone(items), ['interests'], 3, {
  block: 'related-content'
});
// result.items is the display order; result.why explains the block.
```

The initializer must already have constructed the engine and started collection. `rank()` is synchronous and returns a result object, not a bare array. It receives candidates; it does not fetch or render them.

```text
{
  items,       // the ranked rows, in render order
  why,         // ['Gardening', 'garden', 'growing']
  why_detail,  // [{ term, label, field, kind, share, items }] behind why
  profiles,    // { interests: { used: true, confidence: 0.8 } }
  count,       // items.length
  variant      // 'personalised'
}
```

Code written against `0.0.x`, where `rank()` returned the array itself, needs `.items`. Pass the whole result to a template so it can render `items` and `why` together.

## Arguments

```text
engine.rank(items, profiles = [], count = 5, options = {})
```

| Argument | Meaning |
| --- | --- |
| `items` | Array of flat row objects with configured fields and stable unique IDs |
| `profiles` | Array of configured profile names or object mapping names to requested slot counts; defaults to `[]` |
| `count` | Maximum number of results; use a non-negative integer |
| `options` | Controls below; omitted options use their defaults |

Pass the names of profiles configured by the site. The call above uses `interests` from the [configuration example](../configuration/site-example.md).

```javascript
engine.rank(structuredClone(items), ['interests'], 5);
engine.rank(structuredClone(items), { interests: 5 }, 5);
engine.rank(structuredClone(items), [], 5);
engine.rank(structuredClone(items));
```

The first call allocates slots by confidence. The second requests fixed slots. The third and fourth request fallback only. Omitting `profiles` or passing `undefined` uses `[]`. An incoming `null` is converted to `[]` at the function boundary, before processing starts. An empty array requests fallback only, even when the engine has learned profiles. Pass the names learned by your configured `profile` processors to use them for ranking. Unavailable profiles relinquish their selection; unused capacity can be filled by fallback.

An empty candidate array or zero count returns `{ items: [], why: [], why_detail: [], profiles: {}, count: 0 }`. An empty profile selection still allows fallback; with `fallback: 'none'`, it returns no items. Fallback honours the current-page, seen-item and suppression filters. Distinct row objects with the same ID are not generally deduplicated. Deduplicate your feed first.

## Options

| Option | Default | Behaviour |
| --- | --- | --- |
| `block` | `'default'` | Optional component name for recorded results, diagnostic traces and explicit impression/click events; does not affect ranking |
| `excludeCurrent` | `true` | Remove the current page by resolved ID |
| `removeSeenItems` | `true` | Remove IDs viewed within the seen window |
| `seenWindow` | `2592000` | Seen window in seconds (30 days) |
| `minSim` | `0.05` | Minimum cosine similarity for a profile-selected row |
| `minConfidence` | `0` | Minimum usable profile confidence |
| `mergeThreshold` | `0.9` | Merge requested profile directions at or above this cosine similarity |
| `prior` | `'none'` | Non-personal priority: none, order, recency, editorial, or function |
| `priorityWeight` | `0.2` | Priority's score share; remaining share is similarity |
| `recencyHalfLife` | `2592000` | Half-life in seconds for recency priority |
| `fallback` | `'order'` | Fill remaining slots using candidate priority and demotion; `'none'` disables padding |
| `diversify` | `true` | When more than two rows are selected by profiles, reorder them using the first configured key field other than `type` or `profile_type`; fallback rows are appended afterwards |
| `explain` | `true` | Compute the block's `why`; `false` returns `why: []` without changing scores or order |
| `whyMax` | `null` | Terms in `why`; `null` uses `profile.why_max`, which defaults to `3` |
| `whyFloor` | `0.1` | A term found in one selected row only is kept when it carries this share of the block's similarity |

`priorityWeight` is parsed as a number and clamped to `[0, 1]`; an invalid value uses `0.2`. `minSim` still applies to profile selection even when priority weight is `1`.

## Block identifiers

`block` is a name chosen by the integration, such as `'related-content'`. The engine remembers the latest result for each name and includes it in diagnostic traces. Use the same name in `impression(block, items)` and `click(block, item)` to identify the component in event records. If `impression()` omits its items argument, it uses that block's latest result.

Use a distinct name for each component. Reusing a name replaces its recorded result; omitting it uses `'default'`. The value does not change scoring, filtering or ordering. `rank()` does not emit impressions or clicks automatically. See [event handling](../usage/recommendations.md#interpret-and-measure) for consent and analytics requirements.

## Priority choices

| `prior` | Behaviour |
| --- | --- |
| `'none'` | Neutral priority, the default: every row gets 0.5, so similarity alone orders the selection and `priorityWeight` has no effect. |
| `'order'` | Prefer earlier rows in the supplied feed. |
| `'recency'` | Uses the first available `changed`, `updated`, `created`, or `date`; numeric timestamps are Unix seconds. Missing or unusable dates receive 0.5. |
| `'editorial'` | Prefer lower numeric row `weight` values. Invalid weights receive neutral priority. |
| Function | `(item, index, total) => number`, interpreted as a priority between 0 and 1 |

Fallback uses candidate priority and demotion, independent of `priorityWeight`. With the default `'none'` every candidate has the same priority, so fallback keeps feed order. Choosing `prior: 'recency'` changes fallback order even when `fallback` remains `'order'`.

## Returned rows

| Field | Meaning |
| --- | --- |
| `id` | Resolved string identifier |
| `profile` | Selecting profile name or `'fallback'` |
| `sim` | Cosine similarity, or null for fallback |
| `score` | Ranking score; use `pos` for final display order |
| `pos` | One-based final display position |

Original display fields remain. The input array's objects are mutated; `items` is a new array. Rows carry no `why`; the explanation is returned once for the block.

## Block explanation

`why` lists up to `whyMax` display strings for the block as a whole. It is a numerical decomposition of the signal that ranked the rows:

1. For each row a profile selected (never fallback), the cosine similarity is split onto the row's tokens, so the contributions sum to that row's `sim`.
2. Positive contributions from fields outside `profile.why_exclude` (default `type` and `profile_type`) are summed per token across the block.
3. A token is kept when two or more selected rows share it, or when it alone carries `whyFloor` of the block's total similarity.
4. Tokens are sorted by share and labelled. A key shows its label from `engine.labels()` or the key itself; a text token shows the word as written, not its stem. Duplicate labels collapse; the first `whyMax` remain.

Because it reads the same tokens that built the vectors, it works for taxonomy keys and for free text alike. A feed with only `title` and `description` is explained by the words its selected rows share with the profile. `why_detail` carries `{ term, label, field, kind, share, items }` for each kept entry; `items` lists the row IDs it came from. `profiles` reports, for each requested name, whether it selected a row and its confidence. See [labels](../configuration/profile.md#labels-for-explanations) for the label sources.

Render the returned order. Sequential profile selections, variety reordering and fallback mean it is not a global score sort. See [ranking behaviour](../concepts-and-tools/ranking.md).
