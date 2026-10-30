# JavaScript API

## Constructor

```javascript
const Engine = window.ConvivialPersonalisation.default;
const engine = new Engine(config, 'example-site', {
  persist: true,
  debug: false
});
```

The arguments are the configuration object, a stable site ID and an optional options object. Options are `persist` (default `true`), `debug` (overrides `config.debug`) and `now` (a function returning Unix seconds, useful for tests). Use a site ID that is not a reserved object key and does not start with `_`.

Construction loads permitted storage and registers built-in plugins. It does not start collection. In a browser, the instance is assigned to `window.convivialPersonalisation`. `engine.version` and `engine.schema` identify its runtime version and storage schema.

## `collect()` and `ready`

`collect()` starts one collection and returns a promise resolving to the engine. `ready` is that promise for the latest started collection; initially it is already resolved. Sources can be asynchronous. See [collection timing](../concepts-and-tools/data-pipelines.md).

## `fold()` and `currentItem()`

`fold()` applies queued page learning immediately, marks the eligible page as seen and flushes state. An empty queue is harmless. Ordinary integration uses the deferred fold scheduled after collection; explicit folding is useful for controlled examples.

`currentItem()` returns the current assembled page item, or builds one from current temporary metadata if it has not already been built. It can return `null` when there is no usable metadata or ID.

## `rank(items, profiles, count, options)`

Returns an array synchronously. It uses this engine's profiles and history and mutates the candidate objects. See [the complete rank reference](rank.md).

## `use(plugin)`

Registers functions in `sources`, `processors` or `destinations`, and returns the engine. Each function receives `(engine, profiler, options, values)`.

```javascript
engine.use({
  sources: {
    selected_topic(engine, profiler, options, values) {
      const topic = engine.published('selected_topic');
      if (topic) values.push(topic);
    }
  }
});
```

Reference the registered name in a plugin definition's `type`. Sources may return promises; processors and destinations are synchronous hooks.

## `consent(state)`, `personalised` and `erase()`

`consent('granted')` or `consent('denied')` changes the choice and returns the resulting state. GPC can force `'gpc'`. `personalised` is true only for granted consent. `erase()` removes this site's state and tracked outputs without changing the saved consent choice. See [consent](../concepts-and-tools/consent-and-data.md).

## `publish()`, `published()` and `unpublish()`

```javascript
engine.publish('selected_topic', 'gardening', { localstorage: true, cookie: false });
const topic = engine.published('selected_topic');
engine.unpublish('selected_topic', { localstorage: true, cookie: true });
```

Published values are strings. `publish(key, value, where)` defaults to a local-storage target and keeps that target's value in memory when persistent publication is unavailable. `published(key)` reads memory first and then permitted local storage, returning `null` if unavailable. `unpublish()` removes the selected targets; enable the cookie target when removing a published cookie.

## `impression()`, `click()` and `pushEvent()`

After a block is rendered, call `impression(block, items)`. It emits `cp.block_impression` with block, variant, profile names, IDs and count. If items are omitted it uses the last result recorded for that block.

On interaction, call `click(block, item, position)`. It emits `cp.block_click` with the item ID, profile, one-based position and formatted similarity. Omitting position uses `item.pos`. `rank()` does not call these methods automatically.

`pushEvent(payload)` appends to the configured data-layer array only when analytics events are enabled and personalisation is allowed. These methods do not send HTTP requests themselves. `variant()` always returns `'personalised'`; the library does not assign experimental cohorts.

## `snapshot()` and diagnostics

`snapshot()` returns a diagnostic object with version, schema, site, consent, profile confidence, decayed observation counts, half-lives, page metadata, dimension rankings, seen count, suppressions, stored values, counters, published-key names and block summaries. Treat it as read-only diagnostic data; some nested data is shallow-copied.

Set `engine.debug = true` for local traces. Browser consoles may require the Verbose level. Filter on the diagnostic prefix `[convivial-profiler]`. Each trace carries an event name, sequence, collection generation and relevant block or ranking identifiers.

## Profile operations

`engine.profile` has the following methods:

| Method | Result or effect |
| --- | --- |
| `names()` | Stored profile names |
| `vector(name)` | `{ v, confidence, n, decay }`; `v` can be null |
| `dimension(name)` | Copy of a dimension's counters |
| `ranked(name)` | Descending `[value, count]` pairs |
| `top(name)` / `tops(name, count)` | Leading value or values |
| `confidence(name)` | Leading dimension counter's relative margin |
| `markSeen(id, size)` | Record an ID; normal default capacity is 200 |
| `seenAge(id)` | Seconds since last recorded view, or null |
| `hasSeen(id)` / `seenCount()` | Presence or recorded ID count |
| `suppress(rule)` | Add or refresh an exclusion/demotion rule |
| `suppressions()` | Current live rules, removing expired entries |
| `clearSuppression(scope, key)` | Remove matching rules; omit key for all in that scope |

Use profile processors for normal learning and `snapshot()` for inspection. Component code should use the instance's `rank()` method.
