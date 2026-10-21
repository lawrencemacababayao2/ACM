// Presentation-grade name formatting and validation, separate from the
// duplicate-detection normalizer in ./normalize.js (which lower-cases and strips
// accents so "JUAN DELA CRUZ" and "juan dela cruz" collapse to one key). This
// module is about what actually gets stored and shown.

// Title-cases every word: first letter up, rest left alone so "McDonald" and
// "Dela Cruz" survive. A word boundary is a space, hyphen or apostrophe, so
// "anne-marie" -> "Anne-Marie" and "o'brien" -> "O'Brien".
function capitalizeWords(value) {
  return String(value ?? '').replace(/(^|[\s\-'\u2019])(\p{L})/gu, (m, sep, ch) => sep + ch.toUpperCase());
}

// Trimmed and with runs of whitespace collapsed to one space.
export function normalizeName(value) {
  return String(value ?? '').trim().replace(/\s+/g, ' ');
}

// Stored form: trimmed, spaces collapsed, and capitalized. A value that is
// entirely upper- or lower-case is fully converted to Title Case (so "JUAN DELA
// CRUZ" -> "Juan Dela Cruz"); a value with deliberate inner capitals is left
// otherwise alone apart from the per-word first letter.
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

// Length is measured up to the column limit; the caller passes its own limit
// when it differs (users store names up to 80).
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

// Strips anything not allowed in a name and collapses the result. Used on the
// lenient registration path where the deployed mobile app must never be
// rejected for content it could previously send.
export function sanitizeName(value) {
  return normalizeName(String(value ?? '').replace(/[^\p{L}\p{M}'.\- ]/gu, ''));
}
