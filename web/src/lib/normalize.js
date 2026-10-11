// Client mirror of server/src/lib/normalize.js. The browser previews a
// duplicate through these exact same canonical forms, so what the inline notice
// shows is definitionally the record the API would refuse on submit. Keep the
// two files in step.

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

export function nameKey({ first_name, middle_name, last_name, suffix }) {
  return [
    normalizeName(first_name),
    normalizeName(middle_name),
    normalizeName(last_name),
    String(suffix ?? '').trim().toLowerCase().replace(/[.\-'\u2018\u2019\u02bc]/g, ''),
  ].join('|');
}

export function normalizeRsbsa(value) {
  return String(value ?? '').replace(/[^A-Za-z0-9]/g, '').toUpperCase();
}

export function normalizeEmail(value) {
  return String(value ?? '').trim().toLowerCase();
}

export function normalizeMobile(value) {
  let p = String(value ?? '').replace(/[^0-9+]/g, '');
  if (p.startsWith('+63')) p = '0' + p.slice(3);
  else if (p.startsWith('63')) p = '0' + p.slice(2);
  if (!p.startsWith('0')) p = '0' + p;
  return p;
}