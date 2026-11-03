# Convivial Personalisation

Clientside personalisation engine for building profiles and ranking content.

Convivial Personalisation provides configurable sources, processors and destinations. It uses metatags, URL parameters, cookies, saved values in local storage, page content and other inputs; maintains dimensions and stored values; and publishes outputs to site components. Profiles are optional, with names and settings chosen by the builder. This repository contains version 0.0.1 of the library and its guide.

Start by [adding the library to your site](docs/usage/browser.md), use the short [collection and publishing example](docs/getting-started/installation.md), or browse the [guide](docs/README.md). Builders choose which pipelines and, if needed, which profiles to configure.

## Develop and preview

Use Node.js 22.12 or newer.

```bash
npm ci
npm run build
npm run check
npm test
npm start
```

The documentation preview is at http://127.0.0.1:48746/. Restart it after editing Markdown. To run the interactive library example, use `npm run dev` and open http://127.0.0.1:8080/example/.

Run the preview and checks from this repository. They read the same `docs/` Markdown selected by `.gitbook.yaml` for publication. If they show another checkout, remove an unintended `CONVIVIAL_DOCS_ROOT` environment override and restart the preview.

## Repository layout

| Path | Purpose |
| --- | --- |
| `src/` | Current engine, plugins, profile and ranking implementation |
| `dist/bundle.js` | Browser UMD build; exposes `ConvivialPersonalisation.default` |
| `test/` | Library tests and documentation example tests |
| `example/` | Runnable metadata, collection and ranking example |
| `docs/` | GitBook guide for the version in this repository |
| `scripts/` | Portable documentation preview and validation tools |
| `SOURCE.json` | Exact source revision of the initial library extraction |

The runtime source was extracted from the latest local personalisation library in the GovCMS repository. Source attribution and the extraction revision are retained. Subsequent library and documentation work belongs here. No other local checkout is required to build, test or preview this repository.

## Documentation and publishing

Edit the guide alongside changes to `src/`. Keep `docs/SUMMARY.md` and section landing pages in sync. `npm run check` verifies local links, navigation, version, code syntax and plugin coverage; `npm test` executes the guide's example against both source and the browser bundle.

GitBook can import this repository using `.gitbook.yaml`, which selects `docs/`. The local preview does not publish the guide or change an existing GitBook connection.

The page menu retains Copy page, View as Markdown, ChatGPT, Claude, MCP, VSCode, Claude Code and Codex. Copying and Markdown work locally. The AI and MCP actions remain disabled until the guide has a published GitBook URL. GitBook controls the hosted menu in the site's customization settings; these options are not defined by the guide Markdown.
