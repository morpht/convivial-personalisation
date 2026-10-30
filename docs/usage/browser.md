# Add the library to your site

Load the minified browser bundle with a script tag, then create one shared engine for the page. Components can read its published values and, when configured, use learned profiles for ranking. For a minimal initializer without profiles, use [collect and publish a value](../getting-started/installation.md).

## Before you start

You need access to your site's public files and page template. This guide uses example paths under `/libraries/`, `/personalisation/` and `/js/`; adjust them to your site. The steps below use the [site configuration example](../configuration/site-example.md), which includes profile learning. Choose pipelines appropriate to your site.

## 1. Get the browser bundle

Get `dist/bundle.js` from [morpht/convivial-personalisation](https://github.com/morpht/convivial-personalisation). It is the minified UMD browser build and exposes `window.ConvivialPersonalisation.default`.

To build it from source, use Git, Node.js 22.12 or newer and npm:

```bash
git clone https://github.com/morpht/convivial-personalisation.git
cd convivial-personalisation
npm ci
npm run build
```

The build writes `dist/bundle.js`. Copy that file to your site's public directory at the path shown below. Save the [example configuration JSON](../assets/configuration/site-config.json) at the configuration path too.

| Repository file | Example public URL |
| --- | --- |
| `dist/bundle.js` | `/libraries/convivial-personalisation/bundle.js` |
| `docs/assets/configuration/site-config.json` | `/personalisation/config.json` |

The example JSON wraps the engine configuration in `{ site, config }`. Set `site` to your own stable site ID. Review its field names, privacy settings and profile half-lives for your site. Serving the built bundle requires no Node.js runtime on the site.

## 2. Attach the scripts and configured inputs

Add this to the page's `<head>`. The first script loads the library; the module starts it in the next step. Keep this order and leave `async` off the library script so the constructor is available when the initializer runs.

```html
<meta name="nid" content="page-gardening">
<meta name="title" content="Growing a garden">
<meta name="topic" content="gardening">
<script src="/libraries/convivial-personalisation/bundle.js"></script>
<script type="module" src="/js/personalisation.js"></script>
```

The sample configuration uses metatags as one of its sources and maps singular `topic` metadata into the `topics` vector field. Candidate rows need that same `topics` field. Add other configured metadata when the page provides it.

## 3. Configure and start the engine

Create `/js/personalisation.js` with:

```javascript
const response = await fetch('/personalisation/config.json');
if (!response.ok) throw new Error(`Configuration request failed: ${response.status}`);
const settings = await response.json();
const Engine = window.ConvivialPersonalisation.default;
const engine = new Engine(settings.config, settings.site);
await engine.collect();
```

Construction exposes the instance at `window.convivialPersonalisation`. Start recommendation components after this initializer has constructed the engine and called `collect()`. Merely waiting on `ready` before collection starts does not collect metadata.

Wire the site's consent interface to [the consent API](../concepts-and-tools/consent-and-data.md). In a bundled application, the default export from `src/index.js` provides the same constructor.

## 4. Verify initialization

After the initializer completes, inspect the browser console:

```javascript
const engine = window.convivialPersonalisation;
console.log(engine.version, engine.collected);
console.log(engine.currentItem());
```

The version should be `1.0.0`, `collected` should be `true`, and the page item should contain the expected ID and vector fields. Follow [build a recommendation block](recommendations.md) to supply candidates and render results. For Drupal's attachment and initializer workflow, use [the Drupal guide](drupal.md).
