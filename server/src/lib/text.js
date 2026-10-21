// Capitalizes only the very first letter of a text value and leaves every other
// character exactly as typed. Shared contract with web/src/lib/text.js so the
// portal previews what the API stores.

// A leading URL (http/https) or an HTML/XML tag is left untouched so structured
// content that starts with markup is never rewritten.
function startsWithMarkup(v) {
  return /^https?:\/\//i.test(v) || /^<[a-z!/]/i.test(v);
}

export function capitalizeFirst(value) {
  const v = String(value ?? '');
  if (!v) return v;
  const leading = v.match(/^\s*/)[0];
  const rest = v.slice(leading.length);
  if (!rest) return v;
  if (startsWithMarkup(rest)) return v;
  const first = rest[0];
  const upper = first.toLocaleUpperCase();
  if (upper === first) return v;
  return leading + upper + rest.slice(1);
}
