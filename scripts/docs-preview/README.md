# Documentation tools

These tools render the guide in `docs/` independently of the library's build and test setup. Use Node.js 22.12 or newer. Run these commands from the repository root:

```bash
npm --prefix scripts/docs-preview ci
npm --prefix scripts/docs-preview test
npm --prefix scripts/docs-preview start
```

The local server listens at `http://127.0.0.1:48746/`. Restart it after changing guide content. The `CONVIVIAL_DOCS_ROOT` environment variable can select another repository root for validation.

To export the guide for offline browsing, choose a new output directory:

```bash
npm --prefix scripts/docs-preview run export -- --output=/tmp/convivial-personalisation-docs
```

Open the exported `index.html`. Navigation, search, themes, code copying and Markdown work without a server. The export uses the same renderer and assets as the local server. Redirects in `.gitbook.yaml` preserve old page URLs.

The page menu includes all eight actions shown by GitBook: Copy page, View as Markdown, Open in ChatGPT, Open in Claude, Connect with MCP, Connect to VSCode, Connect to Claude Code and Connect to Codex. The six AI/MCP actions remain visible and disabled locally because they require a published guide. GitBook enables them through the hosted site's customization settings. Preview notices are kept out of the reader's guide.
