# Build a recommendation block

A component supplies candidates, waits for the engine, ranks the rows and renders them in returned order. Keep profile learning in the site's initializer so every component shares one collected page state.

This example assumes the initializer configures profiles named `fast` and `slow`. Substitute your own configured names, or pass `[]` for fallback only. See [profiles with different half-lives](fast-and-slow.md) for one configuration pattern.

## Before you start

Have an initialized `window.convivialPersonalisation` whose collection has started, a JSON feed containing flat candidate rows, and a container element to render into. Each row needs a stable unique ID, a `title`, a `url` and the [configured vector fields](../configuration/profile.md). The function below takes the feed URL and container as arguments.

## Fetch, rank and render

```javascript
async function recommendations(feedUrl, container) {
  const engine = window.convivialPersonalisation;
  const response = await fetch(feedUrl);
  if (!response.ok) throw new Error(`Feed request failed: ${response.status}`);
  const items = await response.json();
  await engine.ready;
  const block = 'related-content';
  const ranked = engine.rank(structuredClone(items), ['fast', 'slow'], 3, { block });
  container.replaceChildren();
  for (const item of ranked) {
    const url = new URL(item.url, location.origin);
    if (!['http:', 'https:'].includes(url.protocol)) continue;
    const link = document.createElement('a');
    link.href = url.href;
    link.textContent = item.title;
    link.addEventListener('click', () => engine.click(block, item));
    container.append(link);
  }
  engine.impression(block, ranked);
  return ranked;
}
```

This expects a flat JSON array and an engine whose collection has already started. Adapt the markup and impression list to the actual cards rendered. The example filters unsafe URL protocols and uses text content for titles.

Because fetching is asynchronous, current-page learning may already have folded by the time ranking runs. If the product requires ranking from earlier visits only, fetch candidates before starting collection and call `rank()` immediately after that collection resolves. See [the lifecycle](../concepts-and-tools/data-pipelines.md).

## Choose an allocation

When those profiles have been configured with different half-lives, request `['fast', 'slow']` for a mix of recent and established interests. To request two results from fast and one from slow, use `{ fast: 2, slow: 1 }` with count `3`. Similar profile directions may merge; a missing profile cannot fill its requested slots.

Use `fallback: 'none'` only when the component can handle fewer results. The default fallback helps new visitors receive content before useful profiles exist.

## Interpret and measure

`block` is an optional component identifier chosen by your integration, here `'related-content'`. It defaults to `'default'` and has no effect on scoring or order. `rank()` stores the latest result under that name for diagnostics and later event calls; it does not emit an impression. Call `impression()` after rendering and `click()` on actual interaction. Events require granted consent and enabled analytics. The library supplies local data-layer events; your analytics integration determines how to consume them.

Give each block a distinct name so diagnostics and event records identify the intended component. Keep the candidate order meaningful because it supplies the default priority and fallback order.

## Verify the block

Confirm that the displayed order matches the returned array, a first visit can show fallback content, and a learned visit can return rows selected by `fast` or `slow`. Check that each rendered link has the expected title and destination. With analytics enabled and consent granted, rendering and clicking should add the corresponding block events to the configured data layer. For unexpected results, use [the troubleshooting checks](../support/troubleshooting.md).
