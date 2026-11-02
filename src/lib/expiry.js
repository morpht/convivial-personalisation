/**
 * @file
 * One TTL semantics for every plugin (fixes D5 and D11).
 *
 *   ttl > 0            → expires `ttl` seconds from now
 *   ttl 0, blank, null,
 *   undefined, -1      → permanent (expire === null)
 *   ttl 'page'         → expires at the end of this page load (expire === now)
 */

import { getTime } from './utility';

export function expiry(ttl, now = getTime()) {
  if (ttl === 'page') return now;
  if (ttl === null || ttl === undefined || ttl === '') return null;
  const n = Number(ttl);
  if (!isFinite(n) || n <= 0) return null;
  return now + Math.round(n);
}

export function isExpired(entry, now = getTime()) {
  if (!entry || typeof entry !== 'object') return false;
  const e = entry.expire;
  if (e === null || e === undefined) return false;
  const n = Number(e);
  if (!isFinite(n)) return false; // NaN expiry (legacy) never expires
  return n < now;
}
