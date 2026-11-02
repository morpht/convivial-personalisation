import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { readPages, renderPage } from './docs-preview/render.mjs';
import { readRedirects } from './docs-preview/redirects.mjs';

const root = path.resolve(process.env.CONVIVIAL_DOCS_ROOT || fileURLToPath(new URL('..', import.meta.url)));
const docs = path.join(root, 'docs');
const portArgument = process.argv.find(value => value.startsWith('--port='));
const port = Number(portArgument?.slice(7) || 48746);
if (!Number.isInteger(port) || port < 0 || port > 65535) {
  throw new Error('Use --port=<number> between 0 and 65535.');
}

const pages = readPages(docs);
// Only explicit documentation routes are served, never repository files.
const routes = new Map();
const add = (url, body, type) => routes.set(url, { body, type });
for (const page of pages) {
  add(page.url, renderPage(page, pages), 'text/html; charset=utf-8');
  add('/' + page.file, page.markdown, 'text/plain; charset=utf-8');
}
routes.set('/', routes.get('/index.html'));
for (const redirect of readRedirects(root, pages)) {
  for (const suffix of ['', '.html', '.md']) {
    routes.set(redirect.from + suffix, {
      location: suffix === '.md' ? '/' + redirect.file : redirect.to,
    });
  }
}
add('/search-index.json', JSON.stringify(pages.map(page => ({
  title: page.title, url: page.url, section: page.parent?.title || '',
  text: page.markdown.replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/[`#*|>]/g, '').replace(/\s+/g, ' ').trim(),
}))), 'application/json; charset=utf-8');
for (const [file, type] of Object.entries({
  'style.css': 'text/css', 'client.js': 'text/javascript',
  'theme.js': 'text/javascript', 'site-icon.svg': 'image/svg+xml',
})) {
  add('/preview/' + file,
    fs.readFileSync(fileURLToPath(new URL('./docs-preview/' + file, import.meta.url))), type);
}
function addAssets(directory, prefix) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const filename = path.join(directory, entry.name);
    const url = prefix + '/' + entry.name;
    if (entry.isDirectory()) addAssets(filename, url);
    else if (entry.isFile()) add(url, fs.readFileSync(filename), {
      '.svg': 'image/svg+xml', '.png': 'image/png',
      '.jpg': 'image/jpeg', '.webp': 'image/webp',
      '.json': 'application/json; charset=utf-8',
    }[path.extname(filename)] || 'text/plain; charset=utf-8');
  }
}
addAssets(path.join(docs, 'assets'), '/assets');

const server = http.createServer((request, response) => {
  if (!['GET', 'HEAD'].includes(request.method)) {
    response.writeHead(405, { Allow: 'GET, HEAD' }).end();
    return;
  }
  let route;
  try {
    route = routes.get(decodeURIComponent(
      new URL(request.url, 'http://localhost').pathname
    ));
  } catch {
    response.writeHead(400).end('Invalid URL');
    return;
  }
  response.writeHead(route?.location ? 301 : route ? 200 : 404, {
    ...(route?.location ? { Location: route.location } : {}),
    'Content-Type': route?.type || 'text/plain; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' https:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'",
  });
  response.end(request.method === 'HEAD' || route?.location ? undefined
    : route?.body || 'Page not found');
});
server.listen(port, '127.0.0.1', () => {
  console.log(`Documentation preview: http://127.0.0.1:${server.address().port}/`);
  console.log(`${pages.length} pages. Restart after editing documentation.`);
});
server.on('error', error => {
  console.error(error.code === 'EADDRINUSE'
    ? `Port ${port} is in use. Stop the other preview or use --port=48747.`
    : error.message);
  process.exitCode = 1;
});
