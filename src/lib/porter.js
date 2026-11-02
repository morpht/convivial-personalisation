/**
 * @file
 * Porter stemmer (Porter, 1980). Deterministic; used so that "housing",
 * "housed" and "houses" hash to the same slot. Only the stem's consistency
 * matters for the vector, not its linguistic correctness.
 */

const step2list = {
  ational: 'ate',
  tional: 'tion',
  enci: 'ence',
  anci: 'ance',
  izer: 'ize',
  bli: 'ble',
  alli: 'al',
  entli: 'ent',
  eli: 'e',
  ousli: 'ous',
  ization: 'ize',
  ation: 'ate',
  ator: 'ate',
  alism: 'al',
  iveness: 'ive',
  fulness: 'ful',
  ousness: 'ous',
  aliti: 'al',
  iviti: 'ive',
  biliti: 'ble',
  logi: 'log',
};
const step3list = {
  icate: 'ic',
  ative: '',
  alize: 'al',
  iciti: 'ic',
  ical: 'ic',
  ful: '',
  ness: '',
};

const c = '[^aeiou]';
const v = '[aeiouy]';
const C = c + '[^aeiouy]*';
const V = v + '[aeiou]*';
const mgr0 = '^(' + C + ')?' + V + C;
const meq1 = '^(' + C + ')?' + V + C + '(' + V + ')?$';
const mgr1 = '^(' + C + ')?' + V + C + V + C;
const s_v = '^(' + C + ')?' + v;

export function stem(word) {
  let w = String(word);
  if (w.length < 3) return w;
  let stemPart, suffix, fp, re, re2, re3, re4;
  const firstch = w.substr(0, 1);
  if (firstch === 'y') w = firstch.toUpperCase() + w.substr(1);

  // Step 1a
  re = /^(.+?)(ss|i)es$/;
  re2 = /^(.+?)([^s])s$/;
  if (re.test(w)) w = w.replace(re, '$1$2');
  else if (re2.test(w)) w = w.replace(re2, '$1$2');

  // Step 1b
  re = /^(.+?)eed$/;
  re2 = /^(.+?)(ed|ing)$/;
  if (re.test(w)) {
    fp = re.exec(w);
    re = new RegExp(mgr0);
    if (re.test(fp[1])) w = w.replace(/.$/, '');
  } else if (re2.test(w)) {
    fp = re2.exec(w);
    stemPart = fp[1];
    re2 = new RegExp(s_v);
    if (re2.test(stemPart)) {
      w = stemPart;
      re2 = /(at|bl|iz)$/;
      re3 = new RegExp('([^aeiouylsz])\\1$');
      re4 = new RegExp('^' + C + v + '[^aeiouwxy]$');
      if (re2.test(w)) w = w + 'e';
      else if (re3.test(w)) w = w.replace(/.$/, '');
      else if (re4.test(w)) w = w + 'e';
    }
  }

  // Step 1c
  re = /^(.+?)y$/;
  if (re.test(w)) {
    fp = re.exec(w);
    stemPart = fp[1];
    re = new RegExp(s_v);
    if (re.test(stemPart)) w = stemPart + 'i';
  }

  // Step 2
  re =
    /^(.+?)(ational|tional|enci|anci|izer|bli|alli|entli|eli|ousli|ization|ation|ator|alism|iveness|fulness|ousness|aliti|iviti|biliti|logi)$/;
  if (re.test(w)) {
    fp = re.exec(w);
    stemPart = fp[1];
    suffix = fp[2];
    re = new RegExp(mgr0);
    if (re.test(stemPart)) w = stemPart + step2list[suffix];
  }

  // Step 3
  re = /^(.+?)(icate|ative|alize|iciti|ical|ful|ness)$/;
  if (re.test(w)) {
    fp = re.exec(w);
    stemPart = fp[1];
    suffix = fp[2];
    re = new RegExp(mgr0);
    if (re.test(stemPart)) w = stemPart + step3list[suffix];
  }

  // Step 4
  re =
    /^(.+?)(al|ance|ence|er|ic|able|ible|ant|ement|ment|ent|ou|ism|ate|iti|ous|ive|ize)$/;
  re2 = /^(.+?)(s|t)(ion)$/;
  if (re.test(w)) {
    fp = re.exec(w);
    stemPart = fp[1];
    re = new RegExp(mgr1);
    if (re.test(stemPart)) w = stemPart;
  } else if (re2.test(w)) {
    fp = re2.exec(w);
    stemPart = fp[1] + fp[2];
    re2 = new RegExp(mgr1);
    if (re2.test(stemPart)) w = stemPart;
  }

  // Step 5
  re = /^(.+?)e$/;
  if (re.test(w)) {
    fp = re.exec(w);
    stemPart = fp[1];
    re = new RegExp(mgr1);
    re2 = new RegExp(meq1);
    re3 = new RegExp('^' + C + v + '[^aeiouwxy]$');
    if (re.test(stemPart) || (re2.test(stemPart) && !re3.test(stemPart)))
      w = stemPart;
  }
  re = /ll$/;
  re2 = new RegExp(mgr1);
  if (re.test(w) && re2.test(w)) w = w.replace(/.$/, '');

  if (firstch === 'y') w = firstch.toLowerCase() + w.substr(1);
  return w;
}
