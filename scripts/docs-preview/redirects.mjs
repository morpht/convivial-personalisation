import fs from 'node:fs';
import path from 'node:path';
import { pageUrl } from './render.mjs';

/** Read the plain page-path redirects used by this guide's GitBook config. */
export function readRedirects(root, pages) {
  const config = fs.readFileSync(path.join(root, '.gitbook.yaml'), 'utf8');
  const section = config.match(/^redirects:\s*\n((?:[ \t]+[^\n]*\n?)*)/m)?.[1] || '';
  return section.split('\n').filter(line => line.trim()).map(line => {
    const match = line.match(/^  ([\w/-]+): ([\w/.-]+\.md)\s*$/);
    if (!match) throw new Error('Expected a plain page-path redirect: ' + line);
    const [, from, file] = match;
    if (!pages.some(page => page.file === file)) {
      throw new Error('Redirect target is missing from the guide: ' + file);
    }
    return { from: '/' + from, to: pageUrl(file), file };
  });
}
