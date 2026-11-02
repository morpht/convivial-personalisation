import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { JSDOM } from 'jsdom';
import { fileURLToPath } from 'node:url';
import { readPages, renderPage, escapeHtml } from './render.mjs';
import { readRedirects } from './redirects.mjs';

const root = path.resolve(process.env.CONVIVIAL_DOCS_ROOT || fileURLToPath(new URL('../..', import.meta.url)));
const argument = process.argv.find(value => value.startsWith('--output='));
if (!argument?.slice(9)) throw new Error('Use --output=<new directory> for the offline guide.');
const output = path.resolve(argument.slice(9));
if (fs.existsSync(output)) throw new Error('Choose a new output directory: ' + output);
const pages = readPages(path.join(root, 'docs'));
const safeJson = value => JSON.stringify(value).replaceAll('<', '\\u003c');
fs.mkdirSync(path.join(output, 'preview'), { recursive: true });

let client = fs.readFileSync(path.join(root, 'scripts/docs-preview/client.js'), 'utf8');
const markdownFetch = "      const response = await fetch(document.body.dataset.markdown);\n      if (!response.ok) throw new Error('Could not load Markdown');\n      await copyText(await response.text(), button);";
const indexFetch = "      const response = await fetch('/search-index.json');\n      if (!response.ok) throw new Error('Search unavailable');\n      searchIndex = await response.json();";
assert(client.includes(markdownFetch) && client.includes(indexFetch));
client = client.replace(markdownFetch, "      await copyText(JSON.parse(document.getElementById('page-markdown').textContent), button);")
  .replace(indexFetch, '      searchIndex = window.docsSearchIndex;');
fs.writeFileSync(path.join(output, 'preview/client.js'), client);
for (const filename of ['style.css', 'theme.js', 'site-icon.svg']) {
  fs.copyFileSync(path.join(root, 'scripts/docs-preview', filename), path.join(output, 'preview', filename));
}
fs.cpSync(path.join(root, 'docs/assets'), path.join(output, 'assets'), { recursive: true });

const index = pages.map(page => ({
  title: page.title, url: page.url, section: page.parent?.title || '',
  text: page.markdown.replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/[`#*|>]/g, '').replace(/\s+/g, ' ').trim(),
}));
fs.writeFileSync(path.join(output, 'preview/search-index.js'),
  `window.docsSearchIndex = ${safeJson(index)}.map(page => ({ ...page, url: new URL(document.body.dataset.docsBase + page.url.slice(1), document.baseURI).href }));\n`);

for (const page of pages) {
  const dom = new JSDOM(renderPage(page, pages));
  const { document } = dom.window;
  const articleText = document.querySelector('article').textContent;
  const filename = page.url.slice(1);
  const relative = pathname => path.posix.relative(path.posix.dirname(filename), pathname.slice(1)) || path.posix.basename(filename);
  for (const node of document.querySelectorAll('[href], [src], [data-markdown]')) {
    for (const attribute of ['href', 'src', 'data-markdown']) {
      const value = node.getAttribute(attribute);
      if (!value?.startsWith('/') || value.startsWith('//')) continue;
      const url = new URL(value, 'https://guide.invalid');
      const pathname = url.pathname.endsWith('.md') ? url.pathname + '.txt' : url.pathname;
      node.setAttribute(attribute, relative(pathname) + url.search + url.hash);
    }
  }
  document.body.dataset.docsBase = relative('/index.html').replace(/index\.html$/, '') || './';
  const searchScript = document.createElement('script');
  searchScript.defer = true;
  searchScript.src = relative('/preview/search-index.js');
  const clientScript = document.querySelector('script[src$="/client.js"]');
  clientScript.before(searchScript);
  const markdown = document.createElement('script');
  markdown.type = 'application/json';
  markdown.id = 'page-markdown';
  markdown.textContent = safeJson(page.markdown);
  document.body.append(markdown);
  assert.equal(document.querySelector('article').textContent, articleText);
  assert.equal(document.querySelector('.brand').textContent, 'Convivial Personalisation');
  assert.doesNotMatch(articleText, /convivial-profiler(?:\.git)?\b(?!\])/i);
  assert.equal(document.querySelectorAll('[data-hosted-only], .preview-note, .preview-label').length, 0);
  assert.equal(JSON.parse(markdown.textContent), page.markdown);
  fs.mkdirSync(path.dirname(path.join(output, filename)), { recursive: true });
  fs.writeFileSync(path.join(output, filename), dom.serialize());
  fs.writeFileSync(path.join(output, page.file + '.txt'), page.markdown);
  dom.window.close();
}

// Resolve every local page, heading and asset link in the exported guide.
for (const page of pages) {
  const filename = path.join(output, page.url.slice(1));
  const dom = new JSDOM(fs.readFileSync(filename, 'utf8'));
  for (const node of dom.window.document.querySelectorAll('[href], [src]')) {
    const value = node.getAttribute('href') || node.getAttribute('src');
    if (/^[a-z][a-z0-9+.-]*:|^\/\//i.test(value)) continue;
    const url = new URL(value, 'file://' + filename);
    const target = decodeURIComponent(url.pathname);
    assert(fs.existsSync(target), `${filename}: ${value}`);
    if (url.hash && target.endsWith('.html')) {
      const destination = target === filename ? dom : new JSDOM(fs.readFileSync(target, 'utf8'));
      assert(destination.window.document.getElementById(decodeURIComponent(url.hash.slice(1))), `${filename}: ${value}`);
      if (destination !== dom) destination.window.close();
    }
  }
  dom.window.close();
}
for (const redirect of readRedirects(root, pages)) {
  for (const suffix of ['.html', '/index.html']) {
    const filename = redirect.from.slice(1) + suffix;
    const href = path.posix.relative(path.posix.dirname(filename), redirect.to.slice(1));
    const title = pages.find(page => page.file === redirect.file).title;
    fs.mkdirSync(path.dirname(path.join(output, filename)), { recursive: true });
    fs.writeFileSync(path.join(output, filename), `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta http-equiv="refresh" content="0;url=${escapeHtml(href)}"><title>${escapeHtml(title)} | Convivial Personalisation</title></head><body><a href="${escapeHtml(href)}">${escapeHtml(title)}</a></body></html>`);
  }
}
console.log(`Exported and checked ${pages.length} HTML pages, Markdown, search, assets and redirects in ${output}.`);
