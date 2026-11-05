# Build a recommendation block

A component supplies candidates, waits for the engine, ranks the rows and renders them in returned order. Keep profile learning in the site's initializer so every component shares one collected page state.

This example uses the `interests` profile from the [configuration example](../configuration/site-example.md). Substitute your own configured names, or pass `[]` for fallback only.

## Before you start

Have an initialized `window.convivialPersonalisation` whose collection has started, a JSON feed containing flat candidate rows, and a container element to render into. When the site can switch personalisation off, the engine is absent; render the feed in its own order in that case rather than reading the site's setting. Each row needs a stable unique ID, a `title`, a `url` and the [configured matching fields](../configuration/profile.md). The function below takes the feed URL and container as arguments.

## Fetch, rank and render

```javascript
async function recommendations(feedUrl, container) {
  const engine = window.convivialPersonalisation;
  const response = await fetch(feedUrl);
  if (!response.ok) throw new Error(`Feed request failed: ${response.status}`);
  const items = await response.json();
  await engine.ready;
  const block = 'related-content';
  const result = engine.rank(structuredClone(items), ['interests'], 3, { block });
  container.replaceChildren();
  if (result.why.length) {
    const reason = document.createElement('p');
    reason.textContent = `Because you read about ${result.why.join(', ')}`;
    container.append(reason);
  }
  const rendered = [];
  for (const item of result.items) {
    const url = new URL(item.url, location.origin);
    if (!['http:', 'https:'].includes(url.protocol)) continue;
    const link = document.createElement('a');
    link.href = url.href;
    link.textContent = item.title;
    link.addEventListener('click', () => engine.click(block, item));
    container.append(link);
    rendered.push(item);
  }
  if (rendered.length) engine.impression(block, { ...result, items: rendered });
  return rendered;
}
```

This expects a flat JSON array and an engine whose collection has already started. Adapt the markup and impression list to the actual cards rendered. The example filters unsafe URL protocols and uses text content for titles. The reason line uses `result.why`, which is empty for a block of fallback rows; see [explain a block](../concepts-and-tools/ranking.md#explain-a-block).

Because fetching is asynchronous, current-page learning may already have folded by the time ranking runs. If the product requires ranking from earlier visits only, fetch candidates before starting collection and call `rank()` immediately after that collection resolves. See [the lifecycle](../concepts-and-tools/data-pipelines.md).

## Choose an allocation

For multiple configured profiles, pass their names as an array or request a count for each name. See [profiles with different half-lives](fast-and-slow.md) for an optional example. Similar profiles can share a selection; a missing profile cannot fill its requested slots.

Use `fallback: 'none'` only when the component can handle fewer results. The default fallback helps new visitors receive content before useful profiles exist.

## Interpret and measure

`block` is an optional component identifier chosen by your integration, here `'related-content'`. It defaults to `'default'` and has no effect on scoring or order. `rank()` stores the latest result under that name for diagnostics and later event calls; it does not emit an impression. Call `impression()` after rendering, passing the result or the rendered rows, and `click()` on actual interaction. The impression event carries `cp_why`, the explanation labels joined by commas. Events require granted consent and enabled analytics. The library supplies local data-layer events; your analytics integration determines how to consume them.

Give each block a distinct name so diagnostics and event records identify the intended component. Keep the candidate order meaningful because it supplies the default priority and fallback order.

## Verify the block

Confirm that the displayed order matches `result.items`, a first visit can show fallback content with an empty `why`, and a learned visit can return rows selected by `interests` with a `why` naming the shared terms. Deny personalisation consent and confirm the block falls back to the feed order with no `why`. Check that each rendered link has the expected title and destination. With analytics enabled and consent granted, rendering and clicking should add the corresponding block events to the configured data layer. For unexpected results, use [the troubleshooting checks](../support/troubleshooting.md).
