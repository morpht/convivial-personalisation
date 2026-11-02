const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.resolve(process.env.CONVIVIAL_DOCS_ROOT || path.join(__dirname, '..'));
const docs = path.join(root, 'docs');

function markdownFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const filename = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      return markdownFiles(filename);
    }
    return entry.name.endsWith('.md') ? [filename] : [];
  });
}

function withoutCode(text) {
  return text.replace(/^```[^\n]*\n[\s\S]*?^```\s*$/gm, '');
}

function links(text) {
  return Array.from(
    withoutCode(text).matchAll(/\[[^\]]+\]\(([^\s)]+)\)/g),
    match => match[1]
  );
}

function anchors(text) {
  return Array.from(
    withoutCode(text).matchAll(/^#{1,6} (.+)$/gm),
    match => match[1].toLowerCase()
      .replace(/[^\w\s-]/g, '').replace(/\s/g, '-')
  );
}

function checkLinks(filename, text) {
  for (const link of links(text)) {
    if (/^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(link)) {
      continue;
    }
    const [relative, fragment] = link.split('#');
    const target = relative
      ? path.resolve(path.dirname(filename), decodeURIComponent(relative))
      : filename;
    assert(fs.existsSync(target), `${filename}: missing target ${link}`);
    if (fragment && target.endsWith('.md')) {
      const headings = anchors(fs.readFileSync(target, 'utf8'));
      assert(headings.includes(decodeURIComponent(fragment)),
        `${filename}: missing heading ${link}`);
    }
  }
}

function checkExamples(filename, text) {
  const blocks = text.matchAll(/^```(json|javascript)\n([\s\S]*?)^```\s*$/gm);
  for (const [, language, code] of blocks) {
    if (language === 'json') {
      JSON.parse(code);
    } else {
      const result = spawnSync(process.execPath, ['--check', '--input-type=module'], {
        input: code, encoding: 'utf8',
      });
      assert.equal(result.status, 0, `${filename}: ${result.stderr}`);
    }
  }
}

const gitbook = fs.readFileSync(path.join(root, '.gitbook.yaml'), 'utf8');
assert(/^root: \.\/docs\/\s*$/m.test(gitbook), 'GitBook must use docs/');

const summaryPath = path.join(docs, 'SUMMARY.md');
const summary = fs.readFileSync(summaryPath, 'utf8');
const navigation = links(summary).map(link => path.resolve(docs, link));
const pages = markdownFiles(docs).filter(filename => filename !== summaryPath);
const sections = Array.from(
  summary.matchAll(/^\* \[[^\]]+\]\(([^)]+)\)$/gm),
  match => match[1]
).filter(link => link !== 'README.md');
for (const section of sections) {
  assert(section.endsWith('/README.md'),
    `${section}: each section needs a README.md landing page`);
}
assert.equal(new Set(navigation).size, navigation.length, 'Duplicate navigation entry');
assert.deepEqual([...navigation].sort(), [...pages].sort(),
  'SUMMARY.md must list every guide page exactly once');

for (const filename of [summaryPath, ...pages, path.join(root, 'README.md')]) {
  const text = fs.readFileSync(filename, 'utf8');
  assert.equal((withoutCode(text).match(/^# /gm) || []).length, 1,
    `${filename}: expected one page title`);
  assert.equal((text.match(/^```/gm) || []).length % 2, 0,
    `${filename}: unclosed code block`);
  checkLinks(filename, text);
  checkExamples(filename, text);
}

const source = fs.readFileSync(path.join(root, 'src/index.js'), 'utf8');
const version = source.match(/export const VERSION = '([^']+)'/)[1];
assert.equal(JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version, version);
assert(fs.readFileSync(path.join(docs, 'README.md'), 'utf8').includes(version),
  'The introduction must name the current library version');
const references = {
  Source: 'sources.md',
  Processor: 'processors.md',
  Destination: 'destinations.md'
};
let plugins = 0;
for (const [registry, reference] of Object.entries(references)) {
  const text = fs.readFileSync(path.join(docs, 'reference', reference), 'utf8');
  const documented = Array.from(text.matchAll(/^## `([\w]+)`$/gm), match => match[1]);
  const module = fs.readFileSync(path.join(root, 'src/modules', registry.toLowerCase() + '.js'), 'utf8');
  const registered = Array.from(module.matchAll(/^export function (\w+)\(/gm), match => match[1])
    .filter(name => name !== 'pageItem');
  assert(registered.length > 0, `No ${registry} plugins found`);
  assert.deepEqual(documented.sort(), registered.sort(),
    `${reference}: headings must match the registered plugins`);
  plugins += registered.length;
}

console.log(`Documentation checks passed: ${pages.length} pages, ${plugins} plugins, local links and example syntax.`);
