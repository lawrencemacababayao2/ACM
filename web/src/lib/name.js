// Web mirror of server/src/lib/name.js. Keep the two in step so what the admin
// panel previews is exactly what the API stores. Distinct from ./normalize.js,
// which is the duplicate-detection key (lower-cased, accents stripped).

// Title-cases every word (first letter up, rest left alone so "McDonald" stays).
function capitalizeWords(value) {
  return String(value ?? '').replace(/(^|[\s\-'\u2019])(\p{L})/gu, (m, sep, ch) => sep + ch.toUpperCase());
}

export function normalizeName(value) {
  return String(value ?? '').trim().replace(/\s+/g, ' ');
}

export function formatName(value) {
  const v = normalizeName(value);
  if (!v) return '';
  const isAllCaps = v === v.toUpperCase();
  const isAllLower = v === v.toLowerCase();
  if (isAllCaps || isAllLower) {
    return v.toLowerCase().replace(/(^|[\s\-'\u2019])(\p{L})/gu, (m, sep, ch) => sep + ch.toUpperCase());
  }
  return capitalizeWords(v);
}

const NAME_MIN_LENGTH = 2;
const NAME_MAX_LENGTH = 50;
const NAME_ALLOWED = /^[\p{L}\p{M}'.\- ]+$/u;
const HAS_LETTER = /\p{L}/u;

export function nameProblem(value, { required = true, label = 'Name', maxLength = NAME_MAX_LENGTH } = {}) {
  const v = normalizeName(value);
  if (!v) return required ? `${label} is required` : null;
  if (!HAS_LETTER.test(v)) return 'Use letters only (spaces, hyphen, apostrophe and period are allowed)';
  if (!NAME_ALLOWED.test(v)) return 'Use letters only (spaces, hyphen, apostrophe and period are allowed)';
  if (/^[-']|[-']$/.test(v)) return 'Use letters only (spaces, hyphen, apostrophe and period are allowed)';
  if (/[-']{2,}/.test(v)) return 'Use letters only (spaces, hyphen, apostrophe and period are allowed)';
  if (/(\p{L})\1\1/iu.test(v)) return 'Remove repeated letters';
  if (v.length < NAME_MIN_LENGTH) return 'Must be at least 2 characters';
  if (v.length > maxLength) return `Can't be more than ${maxLength} characters`;
  return null;
}

// Live-typing formatter for the admin name inputs: capitalizes each word,
// collapses double spaces, strips disallowed characters, and keeps a trailing
// space so a second word can be typed.
export function formatNameInput(value, maxLength = NAME_MAX_LENGTH) {
  let v = String(value ?? '').replace(/[^\p{L}\p{M}'.\- ]/gu, '');
  v = v.replace(/ {2,}/g, ' ');
  v = v.replace(/(^|[\s\-'\u2019])(\p{L})/gu, (m, sep, ch) => sep + ch.toUpperCase());
  if (v.length > maxLength) v = v.slice(0, maxLength);
  return v;
}

// Display-only: formats a stored value for tables/details without mutating it.
export function displayName(value) {
  return formatName(value);
}
