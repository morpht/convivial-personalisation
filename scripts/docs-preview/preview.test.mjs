import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { execFile, spawn } from 'node:child_process';
import { once } from 'node:events';
import { tmpdir } from 'node:os';
import { promisify } from 'node:util';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';
import { readPages, renderPage } from './render.mjs';

const root = path.resolve(process.env.CONVIVIAL_DOCS_ROOT || fileURLToPath(new URL('../..', import.meta.url)));
const menuLabels = [
  'Copy page', 'View as Markdown', 'Open in ChatGPT', 'Open in Claude',
  'Connect with MCP', 'Connect to VSCode', 'Connect to Claude Code', 'Connect to Codex',
];

function checkPageMenu(document) {
  const items = [...document.querySelectorAll('#page-menu [role="menuitem"]')];
  assert.deepEqual(items.map(item => {
    const copy = item.cloneNode(true);
    copy.querySelector('small')?.remove();
    return copy.textContent.replace('↗', '').trim();
  }), menuLabels);
  assert.equal(items[0].getAttribute('aria-disabled'), null);
  assert.equal(items[1].getAttribute('aria-disabled'), null);
  for (const item of items.slice(2)) {
    assert.equal(item.getAttribute('aria-disabled'), 'true');
    assert.equal(item.hasAttribute('href'), false);
    assert.equal(item.hasAttribute('title'), false);
  }
  assert.doesNotMatch(document.body.textContent, /Available after publication|This connection is available after/);
}

test('preview serves the complete guide without exposing repository files', async () => {
  const server = spawn(process.execPath, [
    new URL('../preview-docs.mjs', import.meta.url).pathname, '--port=0',
  ], { stdio: ['ignore', 'pipe', 'pipe'] });
  let stderr = '';
  server.stderr.on('data', data => { stderr += data; });
  try {
    const origin = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Preview did not start: ' + stderr)), 10000);
      server.once('error', reject);
      server.stdout.on('data', data => {
        const match = String(data).match(/http:\/\/127\.0\.0\.1:\d+/);
        if (match) { clearTimeout(timer); resolve(match[0]); }
      });
      server.once('exit', () => { clearTimeout(timer); reject(new Error(stderr)); });
    });
    const index = await (await fetch(origin + '/search-index.json')).json();
    const summary = await fs.readFile(path.join(root, 'docs/SUMMARY.md'), 'utf8');
    assert.equal(index.length, [...summary.matchAll(/\* \[/g)].length);
    const home = new JSDOM(await (await fetch(origin + '/')).text());
    const rankLink = home.window.document.querySelector('#navigation a[href="/ranking/index.html"]');
    const usageLink = home.window.document.querySelector('#navigation a[href="/usage/index.html"]');
    assert(rankLink, 'Ranking must remain available in navigation');
    assert(usageLink.closest('li').contains(rankLink), 'Ranking belongs under Usage');
    assert(home.window.document.querySelector('#navigation a[href="/concepts-and-tools/profilers.html"]'));
    assert(home.window.document.querySelector('#navigation a[href="/concepts-and-tools/engine-state.html"]'));
    assert.equal(home.window.document.querySelector('#navigation a[href*="profilers-and-profiles"]'), null);
    home.window.close();
    const configuration = await fetch(origin + '/assets/configuration/site-config.json');
    assert.equal(configuration.status, 200);
    assert.match(configuration.headers.get('content-type'), /application\/json/);
    const settings = await configuration.json();
    assert.equal(settings.config.profilers.learn.processors[0].storage_key, 'interests');
    assert.equal(settings.config.profilers.learn.processors[0].decay, 86400);
    for (const page of index) {
      const response = await fetch(origin + page.url);
      assert.equal(response.status, 200, page.url);
      const html = await response.text();
      const rendered = new JSDOM(html);
      checkPageMenu(rendered.window.document);
      assert.equal(rendered.window.document.querySelector('.brand').textContent, 'Convivial Personalisation');
      rendered.window.close();
      const markdownUrl = html.match(/data-markdown="([^"]+)"/)[1];
      const markdown = await fetch(origin + markdownUrl);
      assert.equal(markdown.status, 200);
      assert.match(markdown.headers.get('content-type'), /text\/plain/);
      assert.equal(await markdown.text(), await fs.readFile(path.join(root, 'docs', markdownUrl), 'utf8'));
      assert.match(response.headers.get('content-security-policy'), /script-src 'self'/);
    }
    for (const suffix of ['', '.html', '.md']) {
      const response = await fetch(origin + '/concepts-and-tools/profilers-and-profiles' + suffix, { redirect: 'manual' });
      assert.equal(response.status, 301);
      const target = suffix === '.md' ? '/concepts-and-tools/profilers.md' : '/concepts-and-tools/profilers.html';
      assert.equal(response.headers.get('location'), target);
      assert.equal((await fetch(origin + target)).status, 200);
    }
    for (const route of ['/package.json', '/.git/config', '/AGENTS.md', '/test/fixtures/site-config.json', '/..%2fpackage.json', '/%zz']) {
      const response = await fetch(origin + route);
      assert([400, 404].includes(response.status), route);
    }
    assert.equal((await fetch(origin + '/', {method:'POST'})).status, 405);
    assert.equal((await fetch(origin + '/', {method:'HEAD'})).status, 200);
  } finally {
    if (server.exitCode === null) {
      const exited = once(server, 'exit');
      server.kill();
      await exited;
    }
  }
});

test('page menu keeps keyboard navigation and copies the publication Markdown', async () => {
  const pages = readPages(path.join(root, 'docs'));
  const dom = new JSDOM(renderPage(pages[0], pages), {
    url: 'http://localhost/', runScripts: 'outside-only',
  });
  const { window } = dom;
  const { document } = window;
  let copied;
  const requests = [];
  window.matchMedia = () => ({ matches: false, addEventListener() {} });
  window.IntersectionObserver = class { observe() {} };
  window.fetch = async url => {
    requests.push(url);
    return { ok: true, text: async () => pages[0].markdown };
  };
  Object.defineProperty(window.navigator, 'clipboard', {
    value: { async writeText(text) { copied = text; } },
  });
  try {
    window.eval(await fs.readFile(new URL('./theme.js', import.meta.url), 'utf8'));
    window.eval(await fs.readFile(new URL('./client.js', import.meta.url), 'utf8'));
    const more = document.querySelector('#more');
    const menu = document.querySelector('#page-menu');
    const items = [...menu.querySelectorAll('[role="menuitem"]')];
    const key = value => document.activeElement.dispatchEvent(new window.KeyboardEvent('keydown', { key: value, bubbles: true }));
    more.focus();
    key('ArrowDown');
    assert.equal(menu.hidden, false);
    assert.equal(document.activeElement, items[0]);
    for (const item of items.slice(1)) {
      key('ArrowDown');
      assert.equal(document.activeElement, item);
    }
    key('ArrowDown');
    assert.equal(document.activeElement, items[0]);
    key('End');
    assert.equal(document.activeElement, items.at(-1));
    key('Home');
    assert.equal(document.activeElement, items[0]);
    for (const item of items.slice(2)) item.click();
    assert.deepEqual(requests, []);
    assert.equal(document.querySelector('#announcement').textContent, '');
    items[0].click();
    await new Promise(resolve => setTimeout(resolve, 0));
    assert.equal(copied, pages[0].markdown);
    assert.deepEqual(requests, ['/README.md']);
    key('Escape');
    assert.equal(menu.hidden, true);
    assert.equal(document.activeElement, more);
  } finally {
    window.close();
  }
});

test('offline export preserves the full menu, guide content and old page links', async () => {
  const temporary = await fs.mkdtemp(path.join(tmpdir(), 'personalisation-docs-'));
  const output = path.join(temporary, 'guide');
  try {
    await promisify(execFile)(process.execPath, [
      fileURLToPath(new URL('./export.mjs', import.meta.url)), '--output=' + output,
    ]);
    for (const page of readPages(path.join(root, 'docs'))) {
      const dom = new JSDOM(await fs.readFile(path.join(output, page.url.slice(1)), 'utf8'));
      checkPageMenu(dom.window.document);
      assert.equal(JSON.parse(dom.window.document.querySelector('#page-markdown').textContent), page.markdown);
      assert.equal(await fs.readFile(path.join(output, page.file + '.txt'), 'utf8'), page.markdown);
      assert(dom.window.document.querySelector('script[src$="search-index.js"]'));
      dom.window.close();
    }
    const redirect = new JSDOM(await fs.readFile(path.join(output, 'concepts-and-tools/profilers-and-profiles.html'), 'utf8'));
    assert.equal(redirect.window.document.querySelector('meta[http-equiv="refresh"]').content, '0;url=profilers.html');
    redirect.window.close();
  } finally {
    await fs.rm(temporary, { recursive: true, force: true });
  }
});
