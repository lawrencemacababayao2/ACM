import { Router } from 'express';
import { pool } from '../config/db.js';
import { wrap, HttpError } from '../lib/utils.js';
import { readTargetTypes, targetLabel, PUBLIC_TARGET } from '../lib/targetTypes.js';
import { programLifecycle, trainingLifecycle } from '../lib/lifecycle.js';

// Public read model for the landing website. It is deliberately a separate route
// rather than a mode on /api/programs or /api/trainings: those feeds serve the
// mobile app and the admin, which must keep seeing items the website hides
// (registered-group-only drafts, rows with the website toggle off), while this
// one only ever hands out published, website-visible, non-cancelled records and
// nothing but the safe public fields -- no SMS state, no publish internals, no
// beneficiary targeting beyond a readable label.

const router = Router();

const LIMIT_DEFAULT = 12;
const LIMIT_MAX = 50;

// Rate limiting and response caching for this anonymous feed live where the
// router is mounted (see index.js): the shared public-data limiter plus a
// one-minute cache wrap every public read, so this file stays only about shaping
// the response.

function boolish(v) {
  const s = String(v ?? '').trim().toLowerCase();
  if (['1', 'true', 'yes'].includes(s)) return true;
  if (['0', 'false', 'no'].includes(s)) return false;
  return null;
}

// Only the public shape crosses the wire. Anything a staff tool or the app layer
// relies on (publish state, SMS flags, created_by, notify bookkeeping) is left
// behind on purpose.
function toPublicRow(row, type, phase) {
  const types = readTargetTypes(row);
  const startAt = type === 'training'
    ? (row.event_date ? `${String(row.event_date).slice(0, 10)} ${String(row.start_time || '00:00:00').slice(0, 8)}` : row.schedule || null)
    : row.schedule || null;
  const endAt = type === 'training'
    ? (row.event_date ? `${String(row.event_date).slice(0, 10)} ${String(row.end_time || '23:59:59').slice(0, 8)}` : null)
    : row.end_at || null;
  const benefits = type === 'program' && Array.isArray(row.benefits)
    ? row.benefits.filter((b) => b && b.trim())
    : undefined;
  return {
    id: Number(row.id),
    type,
    title: row.title,
    description: row.description || '',
    venue: row.venue || '',
    start_at: startAt,
    end_at: endAt,
    status: phase,
    target_label: targetLabel(row),
    open_to_all: types.includes(PUBLIC_TARGET),
    ...(benefits && benefits.length ? { benefits } : {}),
  };
}

// GET /api/public/programs-trainings
//   ?type=program|training        (default: both)
//   ?openToAll=true               (only items open to the general public)
//   ?when=upcoming|past           (default upcoming; past = completed)
//   ?page=1 & ?limit=12           (limit capped at 50)
router.get('/programs-trainings', wrap(async (req, res) => {
  const type = String(req.query.type || 'all').trim().toLowerCase();
  if (!['all', 'program', 'training'].includes(type)) {
    throw new HttpError(400, 'type must be program or training', { field: 'type' });
  }
  const openToAll = boolish(req.query.openToAll);
  const when = String(req.query.when || 'upcoming').trim().toLowerCase() === 'past' ? 'past' : 'upcoming';
  const page = Math.max(1, Number.parseInt(String(req.query.page), 10) || 1);
  const limit = Math.min(LIMIT_MAX, Math.max(1, Number.parseInt(String(req.query.limit), 10) || LIMIT_DEFAULT));

  const rows = [];
  if (type === 'all' || type === 'program') {
    const where = ["status = 'published'", 'cancelled = 0', 'show_on_website = 1'];
    const params = [];
    const [programs] = await pool.query(
      `SELECT id, title, description, venue, schedule, end_at, target_type, target_beneficiary_types
       FROM programs WHERE ${where.join(' AND ')} ORDER BY schedule ASC, id ASC`,
      params
    );
    const withBenefits = await attachBenefits(programs, 'program');
    for (const r of withBenefits) rows.push({ row: r, type: 'program', phase: programLifecycle(r) });
  }
  if (type === 'all' || type === 'training') {
    const where = ["publish_status = 'published'", "status <> 'cancelled'", 'show_on_website = 1'];
    const params = [];
    const [trainings] = await pool.query(
      `SELECT id, title, description, venue, schedule, event_date, start_time, end_time,
              target_type, target_beneficiary_types
       FROM trainings WHERE ${where.join(' AND ')} ORDER BY event_date ASC, id ASC`,
      params
    );
    for (const r of trainings) rows.push({ row: r, type: 'training', phase: trainingLifecycle(r) });
  }

  // Lifecycle decides what "upcoming" means: ongoing counts as still coming up,
  // completed is what when=past returns, cancelled never reached the query at all.
  let items = rows.filter(({ row, phase }) => {
    if (openToAll !== null && openToAll !== readTargetTypes(row).includes(PUBLIC_TARGET)) return false;
    if (when === 'past') return phase === 'completed';
    return phase === 'upcoming' || phase === 'ongoing';
  });

  // Soonest first while it is still ahead of us; most recent first once past.
  items.sort((a, b) => {
    const sa = String(toPublicRow(a.row, a.type, a.phase).start_at || '');
    const sb = String(toPublicRow(b.row, b.type, b.phase).start_at || '');
    return when === 'past' ? sb.localeCompare(sa) : sa.localeCompare(sb);
  });

  const total = items.length;
  const slice = items.slice((page - 1) * limit, page * limit);
  const payload = {
    items: slice.map(({ row, type: t, phase }) => toPublicRow(row, t, phase)),
    total,
    page,
    limit,
    pages: Math.max(1, Math.ceil(total / limit)),
  };
  res.json(payload);
}));

// Benefits live in a 1:N table, so they are fetched once per response set the
// same way the admin feed does it, then hung off their row.
async function attachBenefits(rows, type) {
  if (!rows.length) return rows;
  const table = type === 'program' ? 'program_benefits' : 'training_benefits';
  const column = type === 'program' ? 'program_id' : 'training_id';
  const ids = rows.map((r) => r.id);
  const [benefits] = await pool.query(
    `SELECT ${column} AS owner_id, benefit FROM ${table} WHERE ${column} IN (${ids.map(() => '?').join(', ')}) ORDER BY sort_order, id`,
    ids
  );
  const byOwner = benefits.reduce((acc, b) => {
    (acc[b.owner_id] = acc[b.owner_id] || []).push(b.benefit);
    return acc;
  }, {});
  return rows.map((r) => ({ ...r, benefits: byOwner[r.id] || [] }));
}

export default router;
