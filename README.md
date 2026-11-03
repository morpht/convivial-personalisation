# Convivial Personalisation

Clientside personalisation engine for building profiles and ranking content.

Convivial Personalisation provides configurable sources, processors and destinations. It uses metatags, URL parameters, cookies, saved values in local storage, page content and other inputs; maintains dimensions and stored values; and publishes outputs to site components. Profiles are optional, with names and settings chosen by the builder. This repository contains version 0.0.1 of the library and its guide.

Start by [adding the library to your site](docs/usage/browser.md), use the short [collection and publishing example](docs/getting-started/installation.md), or browse the [guide](docs/README.md). Builders choose which pipelines and, if needed, which profiles to configure.

## Development

Use Node.js 22.12 or newer.

```bash
npm ci
npm run build
npm test
npm run dev
```

Open http://127.0.0.1:8080/example/ to use the interactive library example.

## Repository layout

| Path | Purpose |
| --- | --- |
| `src/` | Current engine, plugins, profile and ranking implementation |
| `dist/bundle.js` | Browser UMD build; exposes `ConvivialPersonalisation.default` |
| `test/` | Library tests and documentation example tests |
| `example/` | Runnable metadata, collection and ranking example |
| `docs/` | GitBook guide for the version in this repository |
| `SOURCE.json` | Exact source revision of the initial library extraction |

Source attribution and the extraction revision are retained in `SOURCE.json`. No other local checkout is required to build, test or run the example.

## Documentation and publishing

Edit the guide alongside changes to `src/`. Keep `docs/SUMMARY.md` and section landing pages in sync. `npm test` executes the guide's example against both source and the browser bundle.

GitBook can import this repository using `.gitbook.yaml`, which selects `docs/`. GitBook controls the hosted page menu in the site's customization settings.
