/**
 * @file
 * Destination plugins: (engine, profiler, destination, values) → void.
 *
 * Destinations publish derived values to the flat namespace consumers read
 * (localStorage keys, optionally cookies, the dataLayer). All writes go
 * through engine.publish()/engine.unpublish() which honour the privacy
 * settings (cookies off by default) and consent state.
 */

import { getCookie } from '../lib/utility';

/** Drupal emits "localstorage"/"cookie" when checked and "0" when not. */
export const on = (v) =>
  v === true ||
  v === 1 ||
  (typeof v === 'string' && v !== '' && v !== '0' && v !== 'false');
const wantsLocal = (d) =>
  !!(d.target_location && on(d.target_location.localstorage));
const wantsCookie = (d) =>
  !!(d.target_location && on(d.target_location.cookie));

function publish(engine, destination, key, value) {
  engine.publish(key, value, {
    localstorage: wantsLocal(destination),
    cookie: wantsCookie(destination),
  });
}
function unpublish(engine, destination, key) {
  engine.unpublish(key, {
    localstorage: wantsLocal(destination),
    cookie: wantsCookie(destination),
  });
}

function decision(engine, destination, details) {
  engine.trace('destination.decision', () => ({
    rule: destination.type,
    target: destination.target_key,
    ...details(),
  }));
}

/** First non-empty value among published keys, else default (fixes D13 null check). */
export function bestpick(engine, profiler, destination, values) {
  const inputs = (destination.storage_keys || []).map((k) =>
    engine.published(k),
  );
  const found = inputs.filter(
    (v) =>
      v !== undefined &&
      v !== null &&
      v !== '' &&
      v !== 'null' &&
      v !== 'undefined',
  );
  let defaultUsed = false;
  if (
    !found.length &&
    destination.default_value !== undefined &&
    destination.default_value !== ''
  ) {
    found.push(destination.default_value);
    defaultUsed = true;
  }
  decision(engine, destination, () => ({
    passed: found.length > 0,
    action: found.length
      ? 'publish'
      : destination.remove_empty
        ? 'remove'
        : 'keep existing',
    reason: defaultUsed
      ? 'Every priority input was empty, so the configured default is used.'
      : found.length
        ? `The first non-empty priority key is ${JSON.stringify(destination.storage_keys[inputs.indexOf(found[0])])}; later keys cannot override it.`
        : 'Every priority input is empty and no usable default was configured.',
    inputs: (destination.storage_keys || []).map((key, i) => ({
      key,
      value: inputs[i],
    })),
    selected: found[0],
  }));
  if (found.length)
    publish(engine, destination, destination.target_key, found[0]);
  else if (destination.remove_empty)
    unpublish(engine, destination, destination.target_key);
}

export function copy(engine, profiler, destination, values) {
  let value = engine.storage.get(destination.storage_key);
  const input = value;
  const present = value !== undefined && value !== null && value !== '';
  decision(engine, destination, () => ({
    passed: present,
    action: present
      ? 'publish'
      : destination.remove_empty
        ? 'remove'
        : 'keep existing',
    reason: `Reading ${destination.storage_key} ${present ? `found a ${Array.isArray(input) ? 'list' : typeof input}; stringify = ${!!destination.stringify} controls JSON serialization` : 'found no usable value'}.`,
    input,
  }));
  if (value !== undefined && value !== null && value !== '') {
    if (destination.stringify) value = JSON.stringify(value);
    else if (Array.isArray(value)) value = value.join(',');
    publish(engine, destination, destination.target_key, value);
  } else if (destination.remove_empty) {
    unpublish(engine, destination, destination.target_key);
  }
}

export function datalayer_event(engine, profiler, destination, values) {
  values.forEach((value) => {
    engine.pushEvent({
      event: 'convivialPersonalisation.event',
      category: destination.category,
      action: destination.action,
      label: typeof value === 'object' ? JSON.stringify(value) : value,
      value: destination.normalize ? 1 / values.length : 1,
    });
  });
}

export function flag(engine, profiler, destination, values) {
  const value = engine.storage.get(destination.storage_key);
  if (value === undefined || value === null || value === '') return;
  const name =
    (destination.flag_prefix || '') + value + (destination.flag_suffix || '');
  publish(engine, destination, name, name);
}

export function formfiller(engine, profiler, destination, values) {
  if (typeof document === 'undefined') return;
  const form = document.querySelector('form' + destination.form_selector);
  if (!form) return;
  (destination.fields_selector || []).forEach((sel) => {
    const [fieldName, storageName] = String(sel).split('|');
    if (!fieldName || !storageName) return;
    const input = form.querySelector('input[name="' + fieldName + '"]');
    if (!input) return;
    let v = null;
    if (
      destination.storage_source &&
      on(destination.storage_source.localstorage)
    )
      v = engine.published(storageName);
    if (
      (v === null || v === undefined) &&
      destination.storage_source &&
      on(destination.storage_source.cookie)
    )
      v = getCookie(storageName);
    if (v !== null && v !== undefined) input.value = v;
  });
}

export function formtracker(engine, profiler, destination, values) {
  if (typeof document === 'undefined') return;
  const form = document.querySelector('form' + destination.form_selector);
  if (!form || form.__cpTracked) return;
  form.__cpTracked = true;
  form.addEventListener(
    'submit',
    () => {
      const sel =
        'form' +
        destination.form_selector +
        ' input[name="' +
        destination.field_name +
        '"]';
      const field = document.querySelector(sel);
      if (!field) return;
      let label = field.value;
      if (field.type === 'radio' || field.type === 'checkbox') {
        const checked = document.querySelector(sel + ':checked');
        if (checked) label = checked.value;
      }
      engine.pushEvent({
        event: 'convivialPersonalisation.event',
        category: destination.event_category,
        action: destination.event_action,
        label,
        value: 1,
      });
    },
    false,
  );
}

/** Day (0-6) and hour in an IANA timezone, e.g. "Australia/Sydney". Null if unsupported. */
function zonedDayHour(date, timezone) {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      weekday: 'short',
      hour: 'numeric',
      hour12: false,
    }).formatToParts(date);
    const wd = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }[
      (parts.find((p) => p.type === 'weekday') || {}).value
    ];
    const hour =
      parseInt((parts.find((p) => p.type === 'hour') || {}).value, 10) % 24;
    return wd === undefined || isNaN(hour) ? null : { day: wd, hour };
  } catch (e) {
    return null;
  }
}

/**
 * Open if the office time falls in ANY configured window for the day (fixes D9).
 * Prefer `timezone` (IANA name, DST handled by the browser) over the legacy
 * normal_ and daylight_saving_ date windows, which go stale every year.
 */
export function officehours(engine, profiler, destination, values) {
  const today = new Date();
  let day, hour;
  const zoned = destination.timezone
    ? zonedDayHour(today, destination.timezone)
    : null;
  if (zoned) {
    day = zoned.day;
    hour = zoned.hour;
  } else {
    let offset = parseFloat(destination.daylight_saving_offset) || 0;
    const ns = Date.parse(destination.normal_start);
    const ne = Date.parse(destination.normal_end);
    if (
      !isNaN(ns) &&
      !isNaN(ne) &&
      today.getTime() >= ns &&
      today.getTime() <= ne
    )
      offset = parseFloat(destination.normal_offset) || 0;
    const office = new Date(
      today.getTime() + today.getTimezoneOffset() * 60000 + offset * 3600000,
    );
    day = office.getDay();
    hour = office.getHours();
  }
  const open = (destination.office_times || [])
    .filter((w) => parseInt(w.day, 10) === day)
    .some(
      (w) => hour >= parseInt(w.start, 10) && hour <= parseInt(w.close, 10),
    );
  publish(engine, destination, destination.target_key, open ? 1 : 0);
}

export function range(engine, profiler, destination, values) {
  const value = parseFloat(engine.storage.get(destination.storage_key));
  if (!isNaN(value)) {
    const hit = (destination.ranges || []).find(
      (r) => value >= parseFloat(r.min) && value < parseFloat(r.max),
    );
    decision(engine, destination, () => ({
      passed: !!hit,
      action: hit ? 'publish' : 'keep existing',
      input: value,
      reason: hit
        ? `${value} is >= ${parseFloat(hit.min)} and < ${parseFloat(hit.max)}, so range ${JSON.stringify(hit.key)} matches.`
        : `${value} matches none of the configured ranges; this destination leaves the output unchanged.`,
      ranges: destination.ranges,
    }));
    if (hit) publish(engine, destination, destination.target_key, hit.key);
  } else {
    decision(engine, destination, () => ({
      passed: false,
      action: destination.remove_empty ? 'remove' : 'keep existing',
      reason: `${destination.storage_key} did not provide a number, so no range can match.`,
    }));
    if (destination.remove_empty)
      unpublish(engine, destination, destination.target_key);
  }
}

export function remove(engine, profiler, destination, values) {
  const keys = (destination.storage_keys || [])
    .map((k) => engine.storage.get(k))
    .concat(destination.static_values || [])
    .map((v) => (v === undefined || v === null ? '' : String(v).trim()))
    .filter(Boolean);
  keys.forEach((k) => unpublish(engine, destination, k));
}

export function season(engine, profiler, destination, values) {
  const value = engine.storage.get(destination.storage_key);
  if (value !== undefined && value !== null && value !== '') {
    const seasons = [
      'winter',
      'winter',
      'spring',
      'spring',
      'spring',
      'summer',
      'summer',
      'summer',
      'autumn',
      'autumn',
      'autumn',
      'winter',
    ];
    const adjust = parseFloat(value) < 0 ? 6 : 0;
    publish(
      engine,
      destination,
      destination.target_key,
      seasons[(new Date().getMonth() + adjust) % 12],
    );
  } else if (destination.remove_empty) {
    unpublish(engine, destination, destination.target_key);
  }
}

export function set(engine, profiler, destination, values) {
  const value = engine.storage.get(destination.storage_key);
  if (value !== undefined && value !== null && value !== '')
    publish(engine, destination, String(value), '1');
}

export function unset(engine, profiler, destination, values) {
  const value = engine.storage.get(destination.storage_key);
  if (value !== undefined && value !== null && value !== '')
    publish(engine, destination, String(value), '0');
}

export function threshold(engine, profiler, destination, values) {
  const value = parseFloat(engine.storage.get(destination.storage_key));
  const threshold = parseFloat(destination.threshold_number);
  const passed = !isNaN(value) && value >= threshold;
  decision(engine, destination, () => ({
    passed,
    action: passed
      ? 'publish'
      : destination.remove_empty
        ? 'remove'
        : 'keep existing',
    reason: `${destination.storage_key} ${isNaN(value) ? 'has no usable number' : `is ${value}`}; the rule requires a numeric value >= ${threshold}.`,
    input: value,
    threshold,
  }));
  if (passed) {
    publish(
      engine,
      destination,
      destination.target_key,
      destination.target_value,
    );
  } else if (destination.remove_empty) {
    unpublish(engine, destination, destination.target_key);
  }
}

/** Dimension key from either `dimension_key` ("dimensions.topic") or `dimension` ("topic"). */
function dimensionName(destination) {
  if (destination.dimension) return destination.dimension;
  const k = String(destination.dimension_key || '');
  return k.replace(/^dimensions(_fast)?\./, '');
}

/**
 * Top value of a dimension. Option `min_confidence` (0..1): publishes
 * `mixed_value` (default "mixed") when the lead over the runner-up is not
 * clear enough.
 */
export function top(engine, profiler, destination, values) {
  const key = dimensionName(destination);
  const value = engine.profile.top(key);
  if (value === null) {
    decision(engine, destination, () => ({
      passed: false,
      action:
        destination.default_value !== undefined &&
        destination.default_value !== ''
          ? 'publish default'
          : destination.remove_empty
            ? 'remove'
            : 'keep existing',
      reason: `Dimension ${JSON.stringify(key)} has no ranked interests, so no top value exists.`,
    }));
    if (
      destination.default_value !== undefined &&
      destination.default_value !== ''
    )
      publish(
        engine,
        destination,
        destination.target_key,
        destination.default_value,
      );
    else if (destination.remove_empty)
      unpublish(engine, destination, destination.target_key);
    return;
  }
  const min = parseFloat(destination.min_confidence) || 0;
  const confidence =
    min > 0 || engine.debug ? engine.profile.confidence(key) : null;
  const out =
    min > 0 && confidence < min ? destination.mixed_value || 'mixed' : value;
  decision(engine, destination, () => ({
    passed: !(min > 0 && confidence < min),
    action: 'publish',
    reason:
      `${JSON.stringify(value)} leads dimension ${JSON.stringify(key)} with confidence ${confidence}. ` +
      (min > 0 && confidence < min
        ? `It is below ${min}, so publish the mixed value ${JSON.stringify(out)}.`
        : `The minimum confidence (${min}) is satisfied, so publish that leader.`),
    confidence,
    minimumConfidence: min,
    output: out,
  }));
  publish(engine, destination, destination.target_key, out);
}

/** Top-N values (fixes D12: never publishes "undefined"). */
export function tops(engine, profiler, destination, values) {
  const key = dimensionName(destination);
  let list = engine.profile.tops(key, parseInt(destination.length, 10) || 3);
  if (!list.length && destination.default_value)
    list = String(destination.default_value)
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  if (!list.length) {
    if (destination.remove_empty)
      unpublish(engine, destination, destination.target_key);
    return;
  }
  publish(
    engine,
    destination,
    destination.target_key,
    destination.stringify ? JSON.stringify(list) : list.join(','),
  );
}
