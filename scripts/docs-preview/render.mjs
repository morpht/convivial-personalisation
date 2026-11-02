import fs from 'node:fs';
import path from 'node:path';
import { Marked, Renderer } from 'marked';
import Prism from 'prismjs';
import loadLanguages from 'prismjs/components/index.js';

loadLanguages(['json', 'bash']);

export const escapeHtml = value => String(value).replace(
  /[&<>"']/g,
  character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;',
    '"': '&quot;', "'": '&#39;' })[character]
);

const paths = {
  search: '<circle cx="10" cy="10" r="6"/><path d="m15 15 5 5"/>',
  copy: '<rect x="8" y="3" width="11" height="14" rx="2"/><path d="M5 7H3v14h12v-2"/>',
  chevron: '<path d="m6 9 6 6 6-6"/>',
  menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
  list: '<path d="M8 6h12M8 12h12M8 18h12M3 6h1M3 12h1M3 18h1"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 1v2m0 18v2M1 12h2m18 0h2M4 4l2 2m12 12 2 2M4 20l2-2M18 6l2-2"/>',
  system: '<rect x="3" y="4" width="18" height="13" rx="2"/><path d="M8 21h8m-4-4v4M3 13h18"/>',
  moon: '<path d="M20 15A9 9 0 0 1 9 4a9 9 0 1 0 11 11Z"/>',
  link: '<path d="m10 14 4-4M8 16l-2 2a4 4 0 0 1-6-6l5-5a4 4 0 0 1 6 0m2 10a4 4 0 0 0 6 0l5-5a4 4 0 0 0-6-6l-2 2" transform="translate(1 0) scale(.9)"/>',
  book: '<path d="m2 8 10-6 10 6-10 6Zm0 5 10 6 10-6M2 18l10 6 10-6" transform="translate(0 -1)"/>',
  close: '<path d="m6 6 12 12M6 18 18 6"/>',
};

export function icon(name) {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.link}</svg>`;
}

export function pageUrl(file) {
  return '/' + file.replace(/(^|\/)README\.md$/, '$1index.html')
    .replace(/\.md$/, '.html');
}

export function readPages(root) {
  let parent;
  return [...fs.readFileSync(path.join(root, 'SUMMARY.md'), 'utf8')
    .matchAll(/^([ \t]*)\* \[([^\]]+)\]\(([^)]+)\)/gm)]
    .map(([, indent, title, file]) => {
      const page = { title, file, url: pageUrl(file),
        parent: indent.length > 0 ? parent : null };
      if (!page.parent) parent = page;
      page.markdown = fs.readFileSync(path.join(root, file), 'utf8');
      page.updated = fs.statSync(path.join(root, file)).mtime;
      return page;
    });
}

function localUrl(href, file) {
  if (/^(https?:|mailto:|#)/i.test(href)) return href;
  if (/^[a-z][a-z0-9+.-]*:/i.test(href) || href.startsWith('//')) return '#';
  const url = new URL(href, 'http://preview/' + file);
  return (url.pathname.endsWith('.md')
    ? pageUrl(url.pathname.slice(1)) : url.pathname)
    + url.search + url.hash;
}

export function renderMarkdown(page) {
  const headings = [];
  const slugs = new Map();
  const renderer = new Renderer();
  const parser = new Marked({ renderer: {
    heading({ text, tokens, depth }) {
      const base = text.toLowerCase().replace(/[^\w\s-]/g, '')
        .replace(/\s/g, '-');
      const count = slugs.get(base) || 0;
      slugs.set(base, count + 1);
      const id = count ? `${base}-${count}` : base;
      const content = this.parser.parseInline(tokens);
      if (depth === 2 || depth === 3) {
        headings.push({ id, title: text.replace(/`/g, ''), depth });
      }
      const anchor = depth > 1 ? `<a class="heading-link" href="#${id}" aria-label="Direct link to heading">${icon('link')}</a>` : '';
      return `<h${depth} id="${id}">${content}${anchor}</h${depth}>`;
    },
    code({ text, lang = 'text' }) {
      const language = lang.split(/\s/)[0];
      const grammar = Prism.languages[language];
      const highlighted = grammar
        ? Prism.highlight(text, grammar, language) : escapeHtml(text);
      return `<div class="code-block"><button class="copy-code" aria-label="Copy ${escapeHtml(language)} code">Copy</button><pre tabindex="0"><code class="language-${escapeHtml(language)}">${highlighted}</code></pre></div>`;
    },
    link(token) {
      const href = localUrl(token.href, page.file);
      const external = /^https?:/i.test(href);
      return `<a href="${escapeHtml(href)}"${external ? ' class="external"' : ''}>${this.parser.parseInline(token.tokens)}</a>`;
    },
    image(token) {
      const href = localUrl(token.href, page.file);
      return `<button class="zoom-image" aria-label="Enlarge image: ${escapeHtml(token.text)}"><img src="${escapeHtml(href)}" alt="${escapeHtml(token.text)}" loading="lazy"></button>`;
    },
    table(token) {
      renderer.parser = this.parser;
      return `<div class="table-wrap" tabindex="0">${renderer.table(token)}</div>`;
    },
  } });
  return { html: parser.parse(page.markdown), headings };
}

function sidebar(pages, current) {
  const item = page => `<a href="${page.url}"${page === current ? ' aria-current="page"' : ''}>${escapeHtml(page.title)}</a>`;
  return pages.filter(page => !page.parent).map((page, index) => {
    const children = pages.filter(child => child.parent === page);
    const open = current === page || current.parent === page;
    return `<li><div class="section-row">${item(page)}${children.length ? `<button class="section-toggle" aria-label="Toggle ${escapeHtml(page.title)}" aria-expanded="${open}" aria-controls="section-${index}">${icon('chevron')}</button>` : ''}</div>${children.length ? `<ul id="section-${index}"${open ? '' : ' hidden'}>${children.map(child => `<li>${item(child)}</li>`).join('')}</ul>` : ''}</li>`;
  }).join('');
}

function pageActions(page) {
  const hostedActions = [
    ['Open in ChatGPT ↗', 'Ask ChatGPT about this page'],
    ['Open in Claude ↗', 'Ask Claude about this page'],
    ['Connect with MCP', 'Add this MCP to any compatible client'],
    ['Connect to VSCode ↗', 'Use this MCP in VSCode'],
    ['Connect to Claude Code', 'Use this MCP in Claude Code'],
    ['Connect to Codex', 'Use this MCP in Codex'],
  ].map(([label, description], index) => `${index === 0 || index === 2 ? '<hr role="separator">' : ''}<button role="menuitem" tabindex="-1" aria-disabled="true">${icon('link')}<span>${label}<small>${description}</small></span></button>`).join('');
  return `<div class="page-actions"><div class="copy-split"><button data-copy-page aria-label="Copy">${icon('copy')}<span>Copy</span></button><button id="more" aria-label="More" aria-haspopup="menu" aria-expanded="false" aria-controls="page-menu">${icon('chevron')}</button></div><div id="page-menu" role="menu" aria-label="Page actions" hidden><button role="menuitem" tabindex="-1" data-copy-page>${icon('copy')}<span>Copy page<small>Copy page as Markdown for LLMs</small></span></button><a role="menuitem" tabindex="-1" href="/${escapeHtml(page.file)}" target="_blank" rel="noopener">${icon('book')}<span>View as Markdown ↗<small>View this page as plain text</small></span></a>${hostedActions}</div></div>`;
}

export function renderPage(page, pages) {
  const { html, headings } = renderMarkdown(page);
  const position = pages.indexOf(page);
  const adjacent = [[position - 1, 'Previous'], [position + 1, 'Next']]
    .filter(([index]) => pages[index]).map(([index, label]) =>
      `<a class="${label.toLowerCase()}" href="${pages[index].url}"><span>${label}</span>${escapeHtml(pages[index].title)}<b aria-hidden="true">${label === 'Next' ? '›' : '‹'}</b></a>`).join('');
  const toc = headings.map(heading => `<a class="depth-${heading.depth}" href="#${heading.id}">${escapeHtml(heading.title)}</a>`).join('');
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(page.title)} | Convivial Personalisation</title><link rel="icon" href="/preview/site-icon.svg" type="image/svg+xml"><script src="/preview/theme.js"></script><link rel="stylesheet" href="/preview/style.css"><script defer src="/preview/client.js"></script></head>
<body data-markdown="/${escapeHtml(page.file)}"><a class="skip" href="#content">Skip to content</a>
<header class="site-header"><button class="mobile-menu icon-button" aria-label="Open table of contents" aria-controls="navigation" aria-expanded="false">${icon('menu')}</button><a class="brand" href="/index.html"><img src="/preview/site-icon.svg" alt=""><span>Convivial Personalisation</span></a><div class="header-search"><button class="search-trigger icon-button" aria-label="Search" aria-controls="search-panel" aria-expanded="false">${icon('search')}</button><div class="search-box">${icon('search')}<input id="search-input" type="search" placeholder="Search…" aria-label="Search" role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="search-results" autocomplete="off"><span id="result-count" aria-live="polite"></span></div><div id="search-panel" hidden><p id="search-status" role="status"></p><div id="search-results" role="listbox" aria-label="Search results"></div></div></div></header>
<div class="layout"><nav id="navigation" class="sidebar" aria-label="Guide chapters"><ul>${sidebar(pages, page)}</ul><a class="powered" href="https://www.gitbook.com/" target="_blank" rel="noopener">${icon('book')}Powered by GitBook</a></nav>
<main id="content"><div class="page-top">${page.parent ? `<a class="breadcrumb" href="${page.parent.url}">${escapeHtml(page.parent.title)}</a>` : '<span></span>'}${pageActions(page)}${headings.length ? `<button class="mobile-toc icon-button" aria-label="On this page" aria-controls="on-this-page" aria-expanded="false">${icon('list')}</button>` : ''}</div><article>${html}</article><nav class="page-nav ${position === 0 || position === pages.length - 1 ? 'single' : ''}" aria-label="Adjacent pages">${adjacent}</nav><p class="updated">Last updated <time datetime="${page.updated.toISOString()}" title="${escapeHtml(page.updated.toUTCString())}">${page.updated.toISOString().slice(0, 10)}</time></p></main>
<aside class="page-outline">${headings.length ? `<nav id="on-this-page" aria-label="On this page"><button class="toc-toggle" aria-expanded="true" aria-controls="toc-links">${icon('list')} ON THIS PAGE</button><div id="toc-links">${toc}</div></nav>` : ''}<div class="theme-switcher" role="radiogroup" aria-label="Colour theme">${['light', 'system', 'dark'].map(theme => `<button role="radio" aria-checked="false" tabindex="-1" data-theme="${theme}" aria-label="Switch to ${theme} theme" title="Switch to ${theme} theme">${icon(theme === 'light' ? 'sun' : theme === 'dark' ? 'moon' : 'system')}</button>`).join('')}</div></aside></div>
<dialog id="image-dialog" aria-label="Enlarged image"><button class="icon-button" data-close-dialog aria-label="Close image">${icon('close')}</button><img alt=""></dialog><div id="announcement" class="sr-only" role="status"></div></body></html>`;
}
