# Suppress content after a completed goal

Suppression can remove content or reduce its ranking priority after a visitor completes a goal or dismisses a recommendation. It affects future rankings while personalisation is allowed.

Start with an initialized engine and candidate IDs or field values that identify the content to affect. Use the API for an action handled in JavaScript, or add the pipeline below when the completion arrives as a query parameter.

## Add an exclusion or demotion

```javascript
engine.profile.suppress({ scope: 'id', key: 'completed-guide', mode: 'exclude', ttl: 86400 });
engine.profile.suppress({ scope: 'topics', key: 'gardening', mode: 'demote', factor: 0.3, ttl: 3600 });
```

An exclusion removes a matching row before selection and fallback. A demotion multiplies its score and its fallback priority. Multiple matching demotions multiply together. Use a factor from zero to one for reduction; omitting it uses `0.3`.

Use a positive numeric TTL in seconds, or omit it for a rule without expiry. Repeating the same scope, key and mode refreshes that rule and increases its count. Expired rules are removed when live suppressions are read.

## Scope matching

| Scope | Match |
| --- | --- |
| `id` or `nid` | Resolved candidate ID, or exact candidate URL |
| `campaign` | Exact `campaign` field |
| `term` | Full key feature such as `topics.gardening`; use its lowercased key |
| A field name, such as `topics` | Any comma-separated key value in that field, compared case-insensitively |

A field suppression checks its ID portion in `id|Label`; it does not match the display label or stemmed text tokens.

## Configure a goal pipeline

```json
{
  "sources": [{ "type": "query", "param": "completed_intent" }],
  "processors": [
    { "type": "suppress", "scope": "intent", "mode": "exclude", "ttl": 604800 },
    { "type": "advance", "dimension": "stage", "value": "completed", "amount": 1 }
  ]
}
```

`advance` adds a value to a dimension when the pipeline has input. It does not automatically change or subtract from learned profile vectors. A `suppress` processor can also use `dimension_sub` and `amount` to reduce a corresponding dimension counter.

## Inspect and clear

```javascript
console.table(engine.profile.suppressions());
engine.profile.clearSuppression('topics', 'gardening');
engine.profile.clearSuppression('campaign');
```

The last call clears all rules in that scope. Denied consent disables learned suppression use and erases the site's stored state. `removeSeenItems` is a separate ranking filter with its own `seenWindow`.

Rank a fresh copy of the same candidate feed after adding an exclusion. The matching item should be absent from both profile selections and fallback. After clearing the rule, it becomes eligible again, subject to the other ranking filters.
