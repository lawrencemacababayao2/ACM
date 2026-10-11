// Shared text normalization for duplicate detection.
//
// Every searchable PII column is reduced to a single canonical form so lookalike
// records ("Juan dela Cruz" vs "JUAN DELA CRUZ", "Añora" vs "Anora",
// "0917-123-4567" vs "+639171234567") collapse to the same value. The server
// stores these values in mirror columns (migration 016) and the web app mirrors
// the exact same rules in web/src/lib/normalize.js, so a duplicate previewed in
// the browser is the same duplicate the API refuses.

// Names: trimmed, lower-cased, runs of whitespace collapsed, accents stripped
// (NFD then remove combining marks, so "Añora" -> "anora"), and the punctuation
// that legitimately appears in a name (".", "-", "'" plus curly apostrophes for
// "O'Brien") removed.
export function normalizeName(value) {
  return String(value ?? '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[.\-'\u2018\u2019\u02bc]/g, '')
    .trim();
}

// The identity key. An empty middle part only matches another empty middle part
// ("Juan dela Cruz" never looks like "Juan Cruz Dela") because the separators
// are part of the key: "juan||dela cruz|cruz" differs from "juan|cruz de la|".
export function nameKey({ first_name, middle_name, last_name, suffix }) {
  return [
    normalizeName(first_name),
    normalizeName(middle_name),
    normalizeName(last_name),
    String(suffix ?? '').trim().toLowerCase().replace(/[.\-'\u2018\u2019\u02bc]/g, ''),
  ].join('|');
}

// RSBSA numbers are 15 digits; dashes and spaces are a display aid only.
export function normalizeRsbsa(value) {
  return String(value ?? '').replace(/[^A-Za-z0-9]/g, '').toUpperCase();
}

// Email matching is case-insensitive; trimming keeps a stray trailing space out
// of the key.
export function normalizeEmail(value) {
  return String(value ?? '').trim().toLowerCase();
}

export { normalizeMobile } from '../services/otp.js';