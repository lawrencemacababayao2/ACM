// async handler wrapper - forwards promise rejections to Express error handling
export const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

export class HttpError extends Error {
  // `details` is merged into the JSON body, e.g. { retryAfter: 42 }.
  constructor(status, message, details = null) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

// TIME columns come back as "17:00:00", but nothing user-facing should show that.
// Returns the 12-hour form, or '' when the value is absent/unusable so callers can
// fall back to omitting the time rather than printing a malformed string.
export function formatTime12(value) {
  const m = String(value ?? '').match(/^(\d{1,2}):(\d{2})/);
  if (!m) return '';
  const h = Number(m[1]);
  if (h > 23) return '';
  const suffix = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${m[2]} ${suffix}`;
}

// "8:00 AM - 5:00 PM". Either end may be missing, in which case whichever one
// exists is returned alone.
export function formatTimeRange(start, end) {
  const s = formatTime12(start);
  const e = formatTime12(end);
  if (s && e) return `${s} - ${e}`;
  return s || e || '';
}