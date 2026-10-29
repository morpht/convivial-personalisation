# Build a recommendation block

A component supplies candidates, waits for the engine, ranks the rows and renders them in returned order. Keep profile learning in the site's initializer so every component shares one collected page state.

The [fast and slow example](fast-and-slow.md) demonstrates ranking with a complete site configuration and candidate feed.

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

For a mix of recent and established interests, request `['fast', 'slow']`. To request two results from fast and one from slow, use `{ fast: 2, slow: 1 }` with count `3`. Similar profile directions may merge; a missing profile cannot fill its requested slots.

Use `fallback: 'none'` only when the component can handle fewer results. The default fallback helps new visitors receive content before useful profiles exist.

## Interpret and measure

`rank()` stores the last result under the block name, but does not emit an impression. Call `impression()` after rendering and `click()` on actual interaction. Events require granted consent and enabled analytics. The library supplies local data-layer events; your analytics integration determines how to consume them.

Give each block a distinct name so diagnostics and event records identify the intended component. Keep the candidate order meaningful because it supplies the default priority and fallback order.

## Verify the block

Confirm that the displayed order matches the returned array, a first visit can show fallback content, and a learned visit can return rows selected by `fast` or `slow`. Check that each rendered link has the expected title and destination. With analytics enabled and consent granted, rendering and clicking should add the corresponding block events to the configured data layer. For unexpected results, use [the troubleshooting checks](../support/troubleshooting.md).
