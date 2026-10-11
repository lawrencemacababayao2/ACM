import { formatTime12, parseTime24 } from './dateUtils.js';

/**
 * Display helpers for a start/end time pair.
 *
 * The API hands back MySQL TIME values ("17:00:00") while the form keeps the
 * 'HH:MM' shape the picker emits, so everything funnels through parseTime24,
 * which tolerates both.
 *
 * A missing end renders as the start alone rather than "8:00 AM - ", so a
 * half-filled range is visible instead of looking like a formatting bug. The
 * form's own validation is what stops a half-filled range being saved.
 */
function one(value) {
  const p = parseTime24(value);
  return p ? formatTime12(p.h, p.m) : '';
}

export function formatTimeRange(start, end) {
  const s = one(start);
  const e = one(end);
  if (s && e) return `${s} – ${e}`;
  return s || e || '';
}

/** True when only one end of the range is set, i.e. the value is not yet valid. */
export function isHalfRange(start, end) {
  return Boolean(one(start)) !== Boolean(one(end));
}

/** Minutes from midnight, or null. Used to order and compare ranges. */
export function minutesOf(value) {
  const p = parseTime24(value);
  return p ? p.h * 60 + p.m : null;
}