import { useEffect, useState } from 'react';

// Lifecycle stages for programs and trainings, mirroring server/src/lib/lifecycle.js.
// The server attaches `phase` per row; pages re-derive it locally on this ticking
// clock so the admin tabs roll a record into "ongoing"/"completed" the moment it
// crosses the boundary instead of waiting for a refetch.
//
// Stages are computed from LOCAL wall-clock values, exactly like the server:
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
  if (s == null && e == null) return 'upcoming';
  if (s != null && n < s) return 'upcoming';
  if (e != null && n > e) return 'completed';
  return 'ongoing';
}

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

export function programLifecycle(p, now = nowLocal()) {
  const schedule = p.schedule ? String(p.schedule) : null;
  const day = schedule ? schedule.slice(0, 10) : null;
  const start = schedule || null;
  const end = p.end_at ? String(p.end_at) : day ? `${day} 23:59:59` : null;
  return lifecyclePhase({ cancelled: !!p.cancelled, start, end }, now);
}

// Ticking clock for lifecycle phases: recomputes every interval and on focus, so
// a record crossing into "completed" while the tab was idle rolls over without a
// page reload. Returns a fresh object each tick so memoised rows re-derive.
export function useNow(intervalMs = 60000) {
  const [now, setNow] = useState(() => nowLocal());
  useEffect(() => {
    const tick = () => setNow(nowLocal());
    const id = setInterval(tick, intervalMs);
    const onVisible = () => { if (!document.hidden) tick(); };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
    };
  }, [intervalMs]);
  return now;
}