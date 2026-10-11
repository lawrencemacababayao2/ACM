import { Router } from 'express';
import { pool } from '../config/db.js';
import { auth, optionalAuth } from '../middleware/auth.js';
import { wrap } from '../lib/utils.js';
import {
  readTargetTypes, targetLabel, audienceMatchSql, audienceMatchParams, beneficiaryTypeForUser,
} from '../lib/targetTypes.js';
import { trainingLifecycle, programLifecycle } from '../lib/lifecycle.js';

const router = Router();

// Schedules live in two tables with different date columns:
//   trainings.event_date + start_time/end_time   (DATE + two TIME columns)
//   programs.schedule                            (DATETIME)
// Both are normalized to a single `date_time` so the Kalendaryo screen (and any
// future consumer) only has to understand one shape. The raw columns are kept so
// the shared ItemDetail detail screen can still render its usual fields.

// Trains used to store a hand-typed "8:00 AM - 5:00 PM" string, which meant this
// function had to run a regex to guess the start hour back out of it and fell
// back to midnight for any format it did not recognise. start_time is now a real
// TIME column, so the value is read directly and the guesswork is gone.
function toDateTime(dateValue, timeValue) {
  if (!dateValue) return null;
  const raw = String(dateValue);
  // programs.schedule is already a full DATETIME. It was previously handed to this
  // function as a bare date, so the time half was dropped and every program landed
  // on the calendar at midnight regardless of when it was actually scheduled.
  if (raw.includes('T') || raw.includes(' ')) return raw.replace(' ', 'T').slice(0, 19);
  // trainings is a DATE plus TIME columns; TIME arrives as "HH:MM:SS" and the
  // caller wants "YYYY-MM-DDTHH:MM:SS".
  const day = raw.slice(0, 10);
  const t = String(timeValue || '').slice(0, 5);
  return `${day}T${t || '00:00'}:00`;
}

// GET /api/calendar
// Optional ?from=YYYY-MM-DD&to=YYYY-MM-DD to bound the range (defaults to today
// onward, so the Kalendaryo list shows what is still coming up).
router.get('/', optionalAuth, wrap(async (req, res) => {
  const today = new Date().toISOString().slice(0, 10);
  const from = String(req.query.from || today).slice(0, 10);
  const to = String(req.query.to || '9999-12-31').slice(0, 10);

  // A signed-in beneficiary only sees events whose audience includes their own
  // type (plus 'all' and 'public' — the same rule the home feed applies).
  // Anonymous visitors (the website calendar) and admins see everything.
  let benType = null;
  if (req.user) benType = await beneficiaryTypeForUser(pool, req.user.id);
  const trainingsWhere = benType ? ` AND ${audienceMatchSql('')}` : '';
  const programsWhere = benType ? ` AND ${audienceMatchSql('p')}` : '';
  const trainingsParams = benType ? audienceMatchParams(benType) : [];
  const programsParams = benType ? audienceMatchParams(benType) : [];

  const [trainings] = await pool.query(
    `SELECT id, title, description, venue, event_date, start_time, end_time, end_at, status,
            target_type, target_beneficiary_types
     FROM trainings
     WHERE status <> 'cancelled' AND publish_status = 'published' AND event_date IS NOT NULL
       AND event_date BETWEEN ? AND ?${trainingsWhere}
     ORDER BY event_date ASC, id ASC`,
    [from, to, ...trainingsParams]
  );

  const [programs] = await pool.query(
    `SELECT p.id, p.title, p.description, p.venue, p.schedule, p.end_at, p.cancelled, p.target_type,
            p.target_beneficiary_types,
            (SELECT COUNT(*) FROM program_benefits pb WHERE pb.program_id = p.id) AS benefit_count
     FROM programs p
     WHERE p.status = 'published' AND p.cancelled = 0 AND p.schedule IS NOT NULL
       AND DATE(p.schedule) BETWEEN ? AND ?${programsWhere}
     ORDER BY p.schedule ASC, p.id ASC`,
    [from, to, ...programsParams]
  );

  // The audience travels as the list plus a pre-joined label. `target_type` is
  // still sent for older builds of the app, but it collapses any multi-type
  // audience to 'all', so the app should render the list when it is present.
  const audienceOf = (row) => ({
    target_beneficiary_types: readTargetTypes(row),
    target_label: targetLabel(row),
  });

  const events = [
    ...trainings.map((t) => ({
      kind: 'training',
      id: t.id,
      title: t.title,
      body: t.description || '',
      venue: t.venue || '',
      date_time: toDateTime(t.event_date, t.start_time),
      start_time: t.start_time || '',
      end_time: t.end_at || t.end_time || '',
      status: t.status || 'upcoming',
      phase: trainingLifecycle(t),
      ...audienceOf(t),
    })),
    ...programs.map((p) => ({
      kind: 'program',
      id: p.id,
      title: p.title,
      body: p.description || '',
      venue: p.venue || '',
      date_time: toDateTime(p.schedule),
      start_time: '',
      end_time: '',
      benefits_count: Number(p.benefit_count || 0),
      target_type: p.target_type,
      phase: programLifecycle(p),
      ...audienceOf(p),
      // ItemDetail reads `schedule` for programs; keep it consistent.
      schedule: p.schedule,
    })),
  ]
    .filter((e) => !!e.date_time)
    .sort((a, b) => String(a.date_time).localeCompare(String(b.date_time)));

  res.json(events);
}));

export default router;
