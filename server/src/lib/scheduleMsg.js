// Formats a stored schedule (schedule/end_at DATETIMEs) into the human lines
// used by the SMS + push fan-out for Programs and Training & Seminars. The
// construct is a date range plus a time range, e.g.
//   Date: Sat, Oct 10, 2026 - Sat, Oct 10, 2026
//   Time: 9:00 AM - 4:00 PM
// A missing end_at means a plain start (an all-day activity defaults to 11:59 PM
// downstream), so only the start time is listed.

function toDate(v) {
  const raw = String(v || '').trim();
  if (!raw) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?$/.exec(raw);
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]), Number(m[6] || 0));
}

function fmtDay(d) {
  return d.toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
  });
}

function fmt12(d) {
  let h = d.getHours();
  const mi = d.getMinutes();
  const ap = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return `${h}:${String(mi).padStart(2, '0')} ${ap}`;
}

// Returns the { date, time } strings for the SMS/push body, or null when there
// is no schedule to describe.
export function activityDateTime(schedule, endAt) {
  const start = toDate(schedule);
  if (!start) return null;
  const end = toDate(endAt);
  const sameDay = !!end && start.toDateString() === end.toDateString();
  const date = end && !sameDay ? `${fmtDay(start)} - ${fmtDay(end)}` : fmtDay(start);
  const time = end ? `${fmt12(start)} - ${fmt12(end)}`
    : `${fmt12(start)}`;
  return { date, time };
}

// Builds the schedule lines for a message, in English and Bisaya. The venue is
// shown in the app but is left out of the broadcast so the SMS stays short:
//   Date: Sat, Oct 10, 2026
//   Time: 9:00 AM - 4:00 PM
export function scheduleSmsLines({ schedule, endAt }) {
  const s = activityDateTime(schedule, endAt);
  const en = [];
  const bis = [];
  if (s) {
    en.push(`\nDate: ${s.date}`, `Time: ${s.time}`);
    bis.push(`\nPetsa: ${s.date}`, `Oras: ${s.time}`);
  }
  return { en: en.join('\n'), bis: bis.join('\n') };
}