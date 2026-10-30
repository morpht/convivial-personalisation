# Profile decay and confidence

Profile learning is optional. Each `profile` processor chooses a name and a `decay` setting. Names such as `fast` and `slow` are configuration choices with no built-in learning behaviour.

## Configure a half-life

Place this processor after the pipelines that collect the page fields:

```json
{
  "processors": [
    { "type": "profile", "storage_key": "interests", "decay": 86400 }
  ]
}
```

`decay` is a half-life in seconds. Here an earlier visit's influence halves after one day. A shorter half-life responds sooner to changing interests; a longer one retains earlier interests for longer.

A newly created profile with omitted or zero `decay` has no time decay. For an existing profile, a positive value takes effect on the next learning update. Omitting it or setting it to zero retains the stored half-life; use a new name to start a non-decaying profile.

## Confidence

Confidence indicates the strength of the available learned interests, on a scale from zero to one. It is not a probability that a recommendation is correct. Use `minConfidence` to set the minimum required for ranking; fallback can fill results when no usable profile is available.

```javascript
console.table(engine.snapshot().profiles);
const ranked = engine.rank(structuredClone(items), ['interests'], 3);
```

The snapshot helps check which profiles have been learned and their current confidence. The builder can configure multiple profiles when different learning periods are useful; see [profiles with different half-lives](../usage/fast-and-slow.md).
