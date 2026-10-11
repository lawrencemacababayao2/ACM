// Lifecycle stages for programs and trainings, shared by the admin UI (via the
// `phase` field attached on each row) and every consumer that buckets records.
//
// Stages are computed from LOCAL wall-clock values. The DB stores schedules in
// the server's local time, so comparing epoch values derived from the wall-clock
// parts (rather than `new Date(value)` strings, whose interpretation shifts with
// the runtime timezone) keeps every reader in agreement:
//   upcoming  = start is still in the future
//   ongoing   = start has passed and the end has not (inclusive edges)
//   completed = the end has passed
//   cancelled = explicitly cancelled (programs.cancelled / trainings.status)

function parseLocal(value) {
  if (value == null) return null;
  const raw = String(value).trim();
  const m = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?$/.exec(raw);
  if (!m) return null;
  return { y: +m[1], mo: +m[2], d: +m[3], h: +m[4], mi: +m[5], s: +(m[6] || 0) };
}

function epoch(p) {
  if (!p) return null;
  return Date.UTC(p.y, p.mo - 1, p.d, p.h, p.mi, p.s);
}

export function nowLocal() {
  const n = new Date();
  return {
    y: n.getFullYear(),
    mo: n.getMonth() + 1,
    d: n.getDate(),
    h: n.getHours(),
    mi: n.getMinutes(),
    s: n.getSeconds(),
  };
}

export function lifecyclePhase({ cancelled, start, end }, now = nowLocal()) {
  if (cancelled) return 'cancelled';
  const s = epoch(parseLocal(start));
  const e = epoch(parseLocal(end));
  const n = epoch(now);
  // No schedule at all: nothing to go stale, treat as an open-ended upcoming.
  if (s == null && e == null) return 'upcoming';
  if (s != null && n < s) return 'upcoming';
  if (e != null && n > e) return 'completed';
  return 'ongoing';
}

// Trainings keep DATE + TIME columns; a missing start/end time means the whole
// day (00:00:00 - 23:59:59), so a one-day seminar is Ongoing on its date.
// If end_at is present, it takes precedence over end_time.
export function trainingLifecycle(t, now = nowLocal()) {
  const date = t.event_date ? String(t.event_date).slice(0, 10) : null;
  if (!date) {
    // Fallback to schedule + end_at if available
    if (t.end_at) {
      return lifecyclePhase({ cancelled: t.status === 'cancelled', start: t.schedule, end: t.end_at }, now);
    }
    return lifecyclePhase({ cancelled: t.status === 'cancelled', start: t.schedule || null, end: null }, now);
  }
  const start = `${date} ${String(t.start_time || '00:00:00').slice(0, 8)}`;
  // Prefer explicit end_at; fall back to end_time; default to end of day
  const end = t.end_at ? String(t.end_at) : `${date} ${String(t.end_time || '23:59:59').slice(0, 8)}`;
  return lifecyclePhase({ cancelled: t.status === 'cancelled', start, end }, now);
}

// Programs use a single DATETIME (schedule) plus an optional explicit end
// (end_at). Without end_at the program is an all-day activity ending at 23:59:59
// on its start date.
export function programLifecycle(p, now = nowLocal()) {
  const schedule = p.schedule ? String(p.schedule) : null;
  const day = schedule ? schedule.slice(0, 10) : null;
  const start = schedule || null;
  const end = p.end_at ? String(p.end_at) : day ? `${day} 23:59:59` : null;
  return lifecyclePhase({ cancelled: !!p.cancelled, start, end }, now);
}