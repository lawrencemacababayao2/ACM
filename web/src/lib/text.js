// Web mirror of server/src/lib/text.js. Capitalizes only the very first letter of
// a text value and leaves every other character exactly as typed.

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

// Live-typing form: leading whitespace is removed and the first letter is
// capitalized. Returning a plain string keeps the caller free to restore the
// caret itself (the length delta tells it how far to move).
export function capitalizeFirstLive(value) {
  const v = String(value ?? '').replace(/^\s+/, '');
  return capitalizeFirst(v);
}

// Runs the live formatter against a real input/textarea event, keeping the caret
// where the user was typing. Returns the next value so callers can store it.
export function applyCapitalizeFirst(input) {
  const before = input.value;
  const caret = input.selectionStart ?? before.length;
  const next = capitalizeFirstLive(before);
  const delta = next.length - before.length;
  if (typeof input.setSelectionRange === 'function') {
    const pos = Math.max(0, caret + delta);
    requestAnimationFrame(() => {
      try { input.setSelectionRange(pos, pos); } catch { /* input not focusable */ }
    });
  }
  return next;
}

