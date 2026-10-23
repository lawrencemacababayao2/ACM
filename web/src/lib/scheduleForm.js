// Web helpers for the date-range/time-range schedule fields shared by the
// Programs and Training & Seminars forms. The four inputs (start/end date,
// start/end time) are stored as two DATETIMEs (schedule + end_at) so nothing
// downstream changes: the server, lifecycle helpers, calendar and public site
// all keep reading the same two values they always did.

function pad2(n) { return String(n).padStart(2, '0'); }
const datePart = (v) => (v ? String(v).slice(0, 10) : '');
function timePart(v) {
  if (!v) return '';
  const s = String(v);
  return s.length >= 16 ? s.slice(11, 16) : s.slice(0, 5);
}

function parseLocal(v) {
  if (!v) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?$/.exec(String(v).trim());
  if (!m) return null;
  return { y: +m[1], mo: +m[2], d: +m[3], h: +m[4], mi: +m[5], s: +(m[6] || 0) };
}
function epoch(p) { return p ? Date.UTC(p.y, p.mo - 1, p.d, p.h, p.mi, p.s) : null; }

// A stored row -> the four input values the form edits. Legacy trainings keep
// event_date/end_time, so those are merged here and the End fields reopen with
// the value that was originally saved.
export function scheduleToFields(r) {
  const endRaw = r?.end_at
    || (r?.event_date && r?.end_time ? `${datePart(r.event_date)}T${timePart(r.end_time)}` : '');
  return {
    date_from: datePart(r?.schedule),
    time_from: timePart(r?.schedule),
    date_to: endRaw ? datePart(endRaw) : '',
    time_to: endRaw ? timePart(endRaw) : '',
  };
}

// The four input values -> the two DATETIMEs the API stores. A blank end is a
// real all-day activity: end_at stays empty (the server and lifecycle helpers
// default to 11:59 PM), we never fabricate a time for it.
export function fieldsToSchedule(f) {
  const schedule = f.date_from && f.time_from ? `${f.date_from}T${f.time_from}` : '';
  const endDate = f.date_to || f.date_from;
  const hasEnd = Boolean(f.date_to || f.time_to);
  const end_at = hasEnd && endDate && f.time_to
    ? `${endDate}T${f.time_to}`
    : '';
  return { schedule, end_at };
}

export function validateScheduleFields(f) {
  const any = f.date_from || f.time_from || f.date_to || f.time_to;
  if (!any) return null;
  if (!f.date_from || !f.time_from) return 'Pick both a start date and a start time, or leave the whole schedule blank.';
  if (f.date_to && !f.time_to) return 'Pick both an end date and an end time, or leave the end blank.';
  const s = parseLocal(`${f.date_from}T${f.time_from}`);
  if (!s) return 'Schedule must be a valid date and time';
  if (s.y < 2000 || s.y > 2100) return 'Schedule year must be between 2000 and 2100';
  if (f.time_to) {
    const eDate = f.date_to || f.date_from;
    const e = parseLocal(`${eDate}T${f.time_to}`);
    if (!e) return 'End must be a valid date and time';
    if (e.y < 2000 || e.y > 2100) return 'End year must be between 2000 and 2100';
    if (epoch(e) <= epoch(s)) return 'End time must be later than the start time';
  }
  return null;
}

export function fmtDay(v) {
  if (!v) return '';
  const d = new Date(`${datePart(v)}T00:00:00`);
  if (Number.isNaN(d.getTime())) return datePart(v);
  return d.toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
  });
}

export function fmtTime12(v) {
  if (!v) return '';
  const m = /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(String(v));
  if (!m) return String(v);
  let h = +m[1];
  const mi = m[2];
  const ap = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return `${h}:${mi} ${ap}`;
}