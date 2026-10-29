# Fast and slow profiles

Fast and slow profiles let recommendations respond to recent browsing while retaining longer-lived interests. Both learn from the same page information. The fast profile gives older visits less influence sooner; the slow profile keeps their influence for longer. The configured half-lives determine that difference.

The [site configuration example](../configuration/site-example.md) uses a 60-second fast profile and a 3,600-second slow profile. The example below uses longer half-lives. Both are configuration choices; profile names have no built-in half-lives.

## Configure the two profiles

Place these processors after all page metadata profilers:

```json
{
  "processors": [
    { "type": "profile", "storage_key": "fast", "decay": 86400, "weight": 1 },
    { "type": "profile", "storage_key": "slow", "decay": 31536000, "weight": 1 }
  ]
}
```

Here the fast half-life is one day and the slow half-life is 365 days. These are example configuration values, not built-in defaults for those names. You can choose other names or half-lives. A newly created profile with omitted or zero `decay` has no time decay.

For an existing profile, a positive `decay` takes effect on its next fold. Omitting `decay` or changing it to zero retains the stored half-life. To start a non-decaying profile, use a new profile name configured with zero decay.

## What a half-life means

Before adding a new page, the engine reduces the accumulated vector using:

```text
remaining fraction = 0.5 ^ (elapsed seconds / half-life seconds)
new accumulator = previous accumulator * remaining fraction + page vector * engagement weight
```

After one half-life, half of a previous contribution remains. After two, one quarter remains. Decay is calculated when a profile is read or updated; it does not require a background timer or browsing-history replay.

For the example above, after one day a single old contribution retains:

| Profile | Half-life | Fraction remaining |
| --- | --- | --- |
| `fast` | 1 day | 0.5 |
| `slow` | 365 days | About 0.998 |

Suppose a visitor reads gardening content and returns later to read about transport. The fast profile will shift toward transport more quickly. The slow profile will retain more of the gardening contribution. The number of visits, elapsed time, field overlap and engagement weights all affect the result.

## Confidence and eligibility

The engine normalises a usable profile's vector for matching. It also reports confidence as the decayed accumulator's length, capped at `1`. A length below `0.001` produces no usable vector and confidence `0`.

Confidence measures remaining learned strength. It is not a percentage chance that a recommendation is correct. Repeated or weighted visits can leave confidence at `1` for some time even as the accumulated vector decays. The accumulator length is capped at `10` after a fold.

`minConfidence` can exclude weak profiles from a ranking request. If neither profile is usable, the configured fallback still supplies eligible candidates.

## Ask ranking for both

```javascript
const proportional = engine.rank(structuredClone(items), ['fast', 'slow'], 5);
const fixed = engine.rank(structuredClone(items), { fast: 2, slow: 3 }, 5);
```

An array requests slots according to profile confidence, with room reserved for later usable profiles when the result count permits. An object requests fixed numbers of slots. The numbers `2` and `3` are requested result counts, not weights for blending the two vectors.

Profiles whose cosine similarity is at least `mergeThreshold` (default `0.9`) merge for selection. The first named profile supplies the direction, the greatest confidence is retained, and fixed slot requests are combined. After one page, fast and slow normally point in the same direction and can return a single combined selection labelled `fast`.

## Inspect learning

```javascript
const snapshot = engine.snapshot();
console.table(snapshot.profiles);
const fast = engine.profile.vector('fast');
console.log(fast.confidence, fast.n, fast.decay);
```

`n` is a decayed observation counter, not an exact lifetime page-view count. Changing vector fields, weights or tokenisation settings makes incompatible stored vectors unavailable; new learning rebuilds them. See [content vectors](content-vectors.md) and [the collection lifecycle](data-pipelines.md).
