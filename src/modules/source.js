/**
 * @file
 * Source plugins: (engine, profiler, source, values) → void | Promise.
 *
 * A source pushes raw values into `values`. It may return a promise; the
 * engine waits for every source of a profiler before running processors and
 * destinations (fixes D3: async `get` no longer races the pipeline).
 */

import { getCookie } from '../lib/utility';

export function acceptlang(engine, profiler, source, values) {
  const lang = typeof navigator !== 'undefined' && navigator.language;
  values.push(lang || 'en');
}

export function cookie(engine, profiler, source, values) {
  const value = getCookie(source.name);
  if (value !== null && value !== '') values.push(value);
}

/** Async fetch of a JSON resource. Resolves once the value is pushed. */
export function get(engine, profiler, source, values) {
  if (typeof fetch !== 'function' || !source.resource_url)
    return Promise.resolve();
  const init = { credentials: source.credentials || 'same-origin' };
  return fetch(source.resource_url, init)
    .then((r) =>
      r.ok ? r.json() : Promise.reject(new Error('HTTP ' + r.status)),
    )
    .then((json) => {
      values.push(json);
    });
}

export function httpuseragent(engine, profiler, source, values) {
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
  values.push(
    /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua)
      ? 'mobile'
      : 'desktop',
  );
}

export function meta(engine, profiler, source, values) {
  if (typeof document === 'undefined') return;
  const els = document.querySelectorAll(
    'meta[name="' + source.attribute_name + '"]',
  );
  for (let i = 0; i < els.length; i++) {
    const content = els[i].getAttribute('content');
    if (content) values.push(content);
  }
}

/** Query parameter(s). Fixes D1: a bare `?set` yields `true` instead of throwing. */
export function query(engine, profiler, source, values) {
  if (typeof location === 'undefined') return;
  const params = new URLSearchParams(location.search);
  const names = [source.param, source.param + '[]'];
  names.forEach((name) => {
    params.getAll(name).forEach((v) => values.push(v === '' ? true : v));
  });
}

export function time(engine, profiler, source, values) {
  const d = new Date();
  if (source.part === 'hour') values.push(d.getHours());
  else if (source.part === 'minute') values.push(d.getMinutes());
  else if (source.part === 'second') values.push(d.getSeconds());
}

/**
 * Parts of the document that are not meta tags: title, description,
 * headings (h1/h2 in main/article, else h1), path, url.
 * Pair with a `temp` processor so the value lands in page storage for the profile builder.
 */
export function document_part(engine, profiler, source, values) {
  if (typeof document === 'undefined') return;
  switch (source.part) {
    case 'title':
      if (document.title) values.push(document.title);
      break;
    case 'description': {
      const m = document.querySelector('meta[name="description"]');
      const c = m && m.getAttribute('content');
      if (c) values.push(c);
      break;
    }
    case 'headings': {
      const sel = source.selector || 'main h1, main h2, article h1, article h2';
      let els = document.querySelectorAll(sel);
      if (!els.length) els = document.querySelectorAll('h1');
      els.forEach((h) => {
        const t = (h.textContent || '').trim();
        if (t) values.push(t);
      });
      break;
    }
    case 'path':
      values.push(location.pathname);
      break;
    case 'url':
      values.push(location.href);
      break;
    default:
      break;
  }
}
