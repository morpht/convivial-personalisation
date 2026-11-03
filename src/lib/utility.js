/**
 * @file
 * Convivial Personalisation utility functions.
 */

export function getTime() {
  return Math.round(Date.now() / 1000);
}

export function getCookie(name) {
  if (typeof document === 'undefined') return null;
  const m = document.cookie.match(
    '(^|;) ?' + name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '=([^;]*)(;|$)',
  );
  return m ? decodeURIComponent(m[2]) : null;
}

/**
 * Sets a cookie. `days` defaults to 365 (D7: a missing value used to yield
 * "expires=Invalid Date", i.e. a session cookie). `days <= 0` deletes.
 */
export function setCookie(name, value, days = 365, attrs = {}) {
  if (typeof document === 'undefined') return;
  const d = Number(days);
  const expires = new Date(
    Date.now() + (isFinite(d) ? d : 365) * 864e5,
  ).toUTCString();
  let s =
    name +
    '=' +
    encodeURIComponent(value) +
    ';path=' +
    (attrs.path || '/') +
    ';expires=' +
    expires +
    ';SameSite=' +
    (attrs.sameSite || 'Lax');
  if (
    attrs.secure ||
    (typeof location !== 'undefined' && location.protocol === 'https:')
  )
    s += ';Secure';
  document.cookie = s;
}

export function isLocalStorageAvailable() {
  try {
    if (typeof localStorage === 'undefined') return false;
    const t = '__cp_test__';
    localStorage.setItem(t, t);
    localStorage.removeItem(t);
    return true;
  } catch (e) {
    return false;
  }
}

/** Dotted-path getter: getPath({a:{b:1}}, 'a.b') === 1. */
export function getPath(source, path) {
  if (source === undefined || source === null) return undefined;
  const parts = Array.isArray(path) ? path : String(path).split('.');
  return parts.reduce(
    (prev, curr) =>
      prev === undefined ||
      prev === null ||
      !safeKey(curr) ||
      !Object.prototype.hasOwnProperty.call(prev, curr)
        ? undefined
        : prev[curr],
    source,
  );
}

/** Reserved object properties are never valid storage keys. */
export function safeKey(key) {
  return !['__proto__', 'prototype', 'constructor'].includes(String(key));
}

export function debug(...args) {
  if (typeof console !== 'undefined' && console.debug)
    console.debug('[convivial-personalisation]', ...args);
}

export function warn(...args) {
  if (typeof console !== 'undefined' && console.warn)
    console.warn('[convivial-personalisation]', ...args);
}

// Keep console sentences short; the adjacent snapshot contains full values.
const logValue = (value) => {
  const text = JSON.stringify(value) ?? 'missing';
  return text.length > 180 ? text.slice(0, 177) + '...' : text;
};
const logNumber = (value) =>
  Number.isFinite(value) ? String(Number(value.toPrecision(5))) : String(value);

/** Explain diagnostic facts without changing the decisions that produced them. */
export function explainTrace(event, d) {
  const q = logValue;
  const n = logNumber;
  const subject =
    d.candidate !== undefined ? `Candidate ${q(d.candidate)}` : 'Current page';
  switch (event) {
    case 'engine.init':
      return `Convivial Personalisation ${d.version} is ready. Consent is ${q(d.consent)}; persistent storage enabled = ${d.persist}. Debug explanations are enabled for this instance.`;
    case 'consent.changed':
      return `Consent is now ${q(d.state)}. Persistent storage enabled = ${d.persist}; ${d.persist ? 'future profile changes may be saved' : 'values remain in page memory and persistent profile updates are disabled'}.`;
    case 'engine.erased':
      return 'The erase operation cleared this site’s visitor state and cancelled queued profile updates; subsequent collection starts with empty profiles.';
    case 'collect.start':
      return `Collecting ${d.profilers.length} enabled profilers in ${d.order === 'weight' ? 'ascending execution-weight order' : 'the order written in the configuration'}. Disabled profilers ${q(d.disabled)} will not run. Execution weights control order; field weights control vector contributions.`;
    case 'collect.order':
      return 'Profiler execution weights disagree with configuration order, but order="weight" is not enabled. Weight sorting applied = false; configuration order wins.';
    case 'collect.cancelled':
      return `Collection ${d.cancelledGeneration} stopped because a newer collection or erase operation started; its remaining profilers will not run.`;
    case 'collect.complete':
      return `Collection finished with ${Object.keys(d.temp).length} temporary fields and ${d.queuedFolds} queued profile operations. Metadata is ready; queued updates run after blocks have a chance to rank against the existing profile.`;
    case 'profiler.start':
      return `Profiler ${q(d.profiler)} is enabled. Read its sources first, then process their values and evaluate destinations.`;
    case 'profiler.skipped':
      return `Profiler ${q(d.profiler)} skipped: its deferred cache expires at ${d.expire}, after now (${d.at}). Cache still valid = true; collection is unnecessary.`;
    case 'profiler.complete':
      return `Profiler ${q(d.profiler)} finished its pipeline. The preceding decision logs show which values were written, retained or skipped.`;
    case 'source.start':
      return `Profiler ${q(d.profiler)} is reading ${q(d.source.type)} source ${q(d.source.attribute_name ?? d.source.param ?? d.source.name ?? d.source.part ?? d.source.resource_url)} because it is configured as an input.`;
    case 'source.complete':
      return `Source ${q(d.type)} finished for ${q(d.profiler)}; the profiler now has ${d.accumulatedValues.length} accumulated values: ${q(d.accumulatedValues)}. Results current = ${!d.stale}; ${d.stale ? 'a newer run prevents these results from running processors' : 'processing waits for any remaining sources'}.`;
    case 'source.skipped':
      return `Profiler ${q(d.profiler)} cannot read source ${q(d.type)} because no handler is registered. Source applied = false; check the source type or plugin registration.`;
    case 'source.error':
      return `Source ${q(d.type)} failed for ${q(d.profiler)}: ${q(d.error?.message)}. Other sources can continue; this input may be missing or incomplete.`;
    case 'profiler.sources.complete':
      return `Profiler ${q(d.profiler)} has ${d.values.length} values after its sources finished. ${d.stale ? 'This run is stale, so its processors and destinations will be skipped.' : d.values.length ? 'Its processors can now evaluate these inputs.' : 'No input was found; processors may still use stored values or derive their own data.'}`;
    case 'plugin.start':
      return `Profiler ${q(d.profiler)} is evaluating ${d.kind === 'processors' ? 'processor' : 'destination'} ${q(d.plugin.type)} with ${d.values.length} source values. The next decisions explain its effect.`;
    case 'plugin.complete': {
      const stored = Object.fromEntries(
        Object.entries(d.stored || {}).filter(
          ([, value]) => value !== undefined,
        ),
      );
      return `${q(d.type)} finished for ${q(d.profiler)} without throwing. ${Object.keys(stored).length ? `Storage for ${q(d.storageKey)} is now ${q(stored)}.` : 'No storage value is present at its configured key; destination decisions and publish logs describe any output.'}`;
    }
    case 'plugin.skipped':
      return `${q(d.type)} was skipped for ${q(d.profiler)} because no ${d.kind} handler is registered. Rule applied = false; check the plugin name.`;
    case 'plugin.error':
      return `${q(d.type)} failed in ${q(d.profiler)}: ${q(d.error?.message)}. The pipeline continues, but this rule may have applied only partially; inspect its preceding writes.`;
    case 'list.processed':
      return `${d.processor} received ${q(d.input)}. Splitting at commas, trimming whitespace and dropping empty entries produced ${d.items.length} items: ${q(d.items)}. ${d.items.length ? `The value at ${d.bucket}.${d.key} is now ${q(d.stored)}; list values are saved as a comma-separated string.` : `No usable items remain, so ${d.bucket}.${d.key} was left unchanged.`}`;
    case 'dimension.values':
      return `Dimension ${q(d.key)} has ${d.values.length} parsed items. Normalization enabled = ${d.normalize}; each valid scalar item adds ${n(d.amount)}${d.normalize && d.values.length ? ` (= 1 / ${d.values.length})` : ''} to its interest counter. Non-scalar items are ignored.`;
    case 'destination.decision':
      return `Destination ${q(d.target)} (${d.rule}): ${d.reason} Condition passed = ${d.passed}; action = ${d.action}.`;
    case 'page.exclusion':
      return `Page excluded = ${d.excluded} because ${d.reason}${d.matched !== undefined ? ` (${q(d.matched)})` : ''}. ${d.excluded ? 'This page will not contribute to learned profiles.' : 'This page may contribute if it produces a usable vector.'}`;
    case 'page.skipped':
      return 'No configured profile metadata or page ID was found in temp. Page profiling skipped = true; check profile.fields, storage keys and profiler order.';
    case 'page.item':
      return `Built the page item from matching temp keys: ${q(d.item)}. Page excluded = ${d.excluded}; ${d.excluded ? 'vector building is skipped' : 'the same field configuration will build page and candidate vectors'}.`;
    case 'vector.field.skipped':
      return `${subject}: field ${q(d.field)} contributes nothing because ${d.reason === 'excluded' ? 'it is listed in exclude.fields' : `its weight (${n(d.weight)}) is not a finite positive number`}. Field enabled = false.`;
    case 'vector.field':
      return `${subject}: field ${q(d.field)} is treated as ${d.kind === 'text' ? 'text because it is in text_fields; words will be tokenized next' : 'a list of terms because it is not in text_fields; commas separate items and spaces inside an item are preserved'}. Parsed ${d.values.length} values: ${q(d.values)}. Field weight ${n(d.weight)} applies before vector normalization${d.values.length ? '.' : '; no values means no contribution.'}`;
    case 'text.tokenize':
      return `${subject}, field ${q(d.field)}: split text at punctuation and whitespace into ${q(d.raw)}. Removed ${q(d.discarded)} for the stated reasons. ${d.normalised !== d.phrases ? 'Synonyms changed the normalized text. ' : ''}After synonyms and Porter stemming, tokens are ${q(d.tokens)}. Stems may omit word endings, including a final "e". Adjacent-word pairs enabled = ${d.bigramsEnabled}; produced ${d.bigrams.length} pairs.`;
    case 'vector.text':
      return `${subject}: field ${q(d.field)} contributes ${d.tokens.length} word tokens and ${d.bigrams.length} adjacent-word pairs at weight ${n(d.weight)}, after applying the text cap (${d.textCap}). These terms feed the vector below.`;
    case 'vector.term.skipped':
      return `${subject}: term ${q(d.key)} is explicitly excluded. Term applied = false; it adds nothing to the vector.`;
    case 'vector.token':
      return `${subject}: token ${q(d.token)} occurs ${d.tf} time(s) at weight ${n(d.weight)}. Hash slot ${d.slot} receives ${n(d.sign)} × ${n(d.weight)} × (1 + ln(${d.tf})) = ${n(d.contribution)}; slot total changes from ${n(d.before)} to ${n(d.accumulated)}. The sign is a hash direction, not negative interest.`;
    case 'vector.empty':
      return `${subject}: no tokens survived the field, weight and text rules. Vector available = false; this item cannot produce a profile similarity score.`;
    case 'vector.complete':
      return `${subject}: built ${d.dims} vector slots with original length ${n(d.magnitude)}. ${d.magnitude > 0 ? `Dividing by ${n(d.norm)} makes its length approximately 1, so similarity compares direction while preserving relative field weights.` : 'Contributions cancelled to zero; the vector has no direction and its cosine similarity is 0.'}`;
    case 'profile.queued':
      return `Profile ${q(d.name)} has a queued update with engagement weight ${n(d.weight)} and ${d.decay > 0 ? `decay half-life ${d.decay}s` : 'time decay disabled'}. Vector available = ${d.hasVector}; page excluded = ${d.excluded}. ${d.hasVector && !d.excluded ? 'The update will run at fold time if consent allows it.' : 'This operation will not add a page vector.'}`;
    case 'profile.reset':
      return `Profile ${q(d.name)} starts a fresh ${d.dims}-slot vector because ${d.reason}. Existing vector reusable = false; the profile’s effective configuration must match the current one.`;
    case 'profile.fold.start':
      return `Updating profile ${q(d.name)}: ${d.age}s elapsed with ${d.decay > 0 ? `a ${d.decay}s half-life` : 'time decay disabled'}, so old interests retain factor ${n(d.decayFactor)}. Each new slot = old slot × ${n(d.decayFactor)} + page slot × engagement weight ${n(d.weight)}.`;
    case 'profile.fold.complete':
      return `Profile ${q(d.name)} now includes the weighted page. Its length before capping was ${n(d.norm)}; cap applied = ${d.capScale < 1}${d.capScale < 1 ? ` (scale ${n(d.capScale)})` : ''}. Decayed visit count is ${n(d.n)}.`;
    case 'profile.unavailable':
      return `Profile ${q(d.name)} cannot score candidates because ${d.reason}. Usable profile = false; other profiles or fallback may supply results.`;
    case 'profile.vector':
      return `Profile ${q(d.name)} retains factor ${n(d.decayFactor)} after ${d.age}s. Remaining length ${n(d.norm)} must be at least ${n(d.minimumNorm)}: usable = ${d.usable}. Confidence is ${n(d.confidence)}; this controls eligibility and automatic slot allocation.`;
    case 'fold.start':
      return `Applying ${d.count} queued profile operations now that ranking has had a chance to use the existing profile. Each operation still needs a page vector.`;
    case 'fold.skipped':
      return `Skipped ${d.count} queued profile operations because consent is ${q(d.consent)}. Learning allowed = false.`;
    case 'fold.error':
      return `A queued profile update failed: ${q(d.error?.message)}. Other queued operations continue; this update may be incomplete.`;
    case 'fold.complete':
      return `Queued profile operations finished; ${d.seen.length} page IDs are recorded as seen. Storage flush wrote data = ${d.persisted}; false means nothing was written (unchanged data, disabled persistence or a storage failure).`;
    case 'storage.expired':
      return `${d.bucket}.${d.key} expired at ${d.expire}, at or before now (${d.at}). Entry still valid = false; it is removed before collection.`;
    case 'publish':
      return `Output ${q(d.key)} is ${q(d.value)}. Available in page memory = ${d.memory}; localStorage write succeeded = ${d.savedLocal}. Cookie write allowed = ${d.cookieAllowed}. Targets, consent and persistence settings determine these outcomes; a failed storage write can also prevent saving.`;
    case 'rank.start':
      return `Ranking up to ${d.count} results using profiles ${q(d.profiles)}. Personalisation active = ${d.personalised} because consent is ${q(d.consent)} and variant is ${q(d.variant)}. ${d.personalised ? 'Usable profiles will score candidates.' : 'Profile similarity will not be used; configured fallback can still supply results.'}`;
    case 'rank.options':
      return `There are ${d.candidates} candidates and ${d.limit} result slots. Similarity must reach ${n(d.options.minSim)}; current-page removal = ${d.options.excludeCurrent}, seen-item removal = ${d.options.removeSeenItems}, fallback = ${q(d.options.fallback)}. These rules explain the next exclusions and choices.`;
    case 'rank.candidate.skipped':
      return `Candidate ${q(d.id)} is removed because ${d.reason === 'current page' ? `it matches the current page ${q(d.currentId)} and excludeCurrent is enabled` : d.reason === 'seen' ? `it was seen ${d.age}s ago, within the ${d.seenWindow}s removal window` : 'an active suppression rule excludes it'}. Eligible for this result set = false, including fallback.`;
    case 'rank.candidate':
      return `Candidate ${q(d.id)} passed the exclusion checks. Vector available = ${d.hasVector}; prior score = ${n(d.prior)}, suppression multiplier = ${n(d.demotion)}. ${d.hasVector ? 'It can now be compared with eligible profiles.' : 'It cannot receive a profile similarity score, but fallback may still use it.'}`;
    case 'rank.profile':
      return `Profile ${q(d.name)} needs a vector and confidence >= ${n(d.minConfidence)}. Vector present = ${d.hasVector}; confidence = ${n(d.confidence)}. Eligible profile = ${d.eligible}.`;
    case 'rank.profile.merged':
      return `Profile ${q(d.name)} is merged into ${q(d.into)} because their similarity ${n(d.similarity)} reaches ${n(d.threshold)}. Separate result slots are unnecessary for profiles this similar.`;
    case 'rank.allocation':
      return `Result slots are ${q(d.slots)}, ${d.method === 'fixed' ? 'using explicitly requested counts' : 'allocated from eligible profiles and their confidence'}. A profile with no slots will not select items.`;
    case 'rank.similarity':
      return `Candidate ${q(d.id)} compared with profile ${q(d.profile)} has similarity ${n(d.sim)}; required >= ${n(d.minSim)}. Similarity passed = ${d.eligible}; ${d.eligible ? 'it proceeds to weighted scoring' : 'this profile cannot select it, although fallback may still use it'}.`;
    case 'rank.score':
      return `Candidate ${q(d.id)} for ${q(d.profile)} scores (${n(d.priorContribution)} prior contribution + ${n(d.similarityContribution)} similarity contribution) × suppression multiplier ${n(d.demotion)} = ${n(d.score)}. Priority weight (priorityWeight) is ${n(d.priorityWeight)}; similarity weight is ${n(d.similarityWeight)}. Selection still depends on competing scores and available slots.`;
    case 'rank.selection':
      return `Candidate ${q(d.id)} is position ${d.position} by score (${n(d.score)}) for profile ${q(d.profile)}, which has ${d.slots} slot${d.slots === 1 ? '' : 's'}. Selected for this profile’s shortlist = ${d.selected}; ${d.selected ? 'final ordering and the overall limit are applied next' : 'higher-ranked candidates filled those slots'}.`;
    case 'rank.diversify.before':
      return `Diversity is enabled and the shortlist has more than 2 items. Reordering by ${q(d.field)} will avoid adjacent items sharing their first term where possible; scores do not change. Current order: ${q(d.ids)}.`;
    case 'rank.diversify.after':
      return `Order after the diversity rule: ${q(d.ids)}. This order may differ from score order because diversity is enabled.`;
    case 'rank.fallback':
      return `Candidate ${q(d.id)} fills a fallback slot because ${d.missingBefore} slots remained and fallback is enabled. Profile match required = false; fallback score = prior ${n(d.prior)} × suppression multiplier ${n(d.demotion)} = ${n(d.score)}.`;
    case 'rank.complete':
      return d.reason
        ? 'No results are returned because there are no candidates or no requested slots.'
        : `Returning ${d.items.length} of ${d.requested} requested results; ${d.fallbackCount} came from fallback. Final order: ${q(d.items.map((item) => `${item.pos}: ${item.id} (${item.profile}, score ${n(item.score)})`))}. ${d.items.length < d.requested ? 'The eligible candidates and fallback setting could not fill every slot.' : 'All requested slots are filled.'}`;
    default:
      return `${event}: ${d.reason || 'Additional plugin diagnostics are available in the attached details.'}`;
  }
}
