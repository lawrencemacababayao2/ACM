export const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

export const pad = (n) => String(n).padStart(2, '0');

// Local calendar dates, never UTC. toISOString() would shift the day for anyone
// west of Greenwich, which silently moves a filter to the wrong date.
export const toISO = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export const parseISO = (s) => {
  if (!s) return new Date(NaN);
  const [y, m, d] = String(s).split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
};

export const monthStart = (d) => new Date(d.getFullYear(), d.getMonth(), 1);

export const sameDay = (a, b) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

// Always six weeks so the popover does not change height between months.
export function buildGrid(view) {
  const first = new Date(view.getFullYear(), view.getMonth(), 1);
  const gridStart = new Date(first);
  gridStart.setDate(1 - first.getDay());
  return Array.from({ length: 42 }, (_, i) => {
    const d = new Date(gridStart);
    d.setDate(gridStart.getDate() + i);
    return d;
  });
}

export const formatDay = (iso) => {
  const d = parseISO(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

export function formatRange(from, to) {
  const f = parseISO(from);
  const t = parseISO(to);
  if (f.getFullYear() === t.getFullYear()) {
    const md = (d) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    return `${md(f)} – ${md(t)}`;
  }
  const mdY = (d) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  return `${mdY(f)} – ${mdY(t)}`;
}

/** 'HH:MM' in 24h to the 12h label the UI shows, e.g. 08:30 -> '8:30 AM'. */
export function formatTime12(h24, m24) {
  const suffix = h24 < 12 ? 'AM' : 'PM';
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${pad(m24)} ${suffix}`;
}

/** '09:05' -> { h: 9, m: 5 }. Tolerates '9:05' and stray whitespace. */
export function parseTime24(v) {
  if (!v) return null;
  const m = String(v).trim().match(/^(\d{1,2}):(\d{2})/);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return { h, m: min };
}

/** Splits 'YYYY-MM-DDTHH:MM' into its local parts, the datetime-local shape. */
export function splitDateTime(v) {
  if (!v) return { date: '', time: '' };
  const i = String(v).indexOf('T');
  if (i === -1) return { date: String(v).slice(0, 10), time: '' };
  return { date: String(v).slice(0, 10), time: String(v).slice(i + 1, i + 6) };
}

/**
 * Recombines parts into the exact 'YYYY-MM-DDTHH:MM' string that
 * <input type="datetime-local"> used to emit, so submit payloads, the edit form
 * and toLocalInput() all keep working unchanged.
 */
export function joinDateTime(date, time) {
  if (!date) return '';
  return `${date}T${time || '00:00'}`;
}