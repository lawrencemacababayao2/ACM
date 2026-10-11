import { Router } from 'express';
import { pool } from '../config/db.js';
import { auth } from '../middleware/auth.js';
import { wrap } from '../lib/utils.js';
import { readTargetTypes } from '../lib/targetTypes.js';

const router = Router();

// How many cards the Home carousel shows. Small on purpose: the carousel loops,
// so a short list still feels full without loading the whole archive.
const FEED_LIMIT = 10;

// A post reaches a signed-in beneficiary when its audience is everyone ('all'),
// the general public ('public'), or this beneficiary's own type. The audience is
// a JSON array, but rows written before that column existed only carry the
// legacy `target_type`, so both columns are consulted.
const AUDIENCE_MATCH = `(
    JSON_CONTAINS(target_beneficiary_types, JSON_QUOTE('all'))
    OR JSON_CONTAINS(target_beneficiary_types, JSON_QUOTE('public'))
    OR JSON_CONTAINS(target_beneficiary_types, JSON_QUOTE(?))
    OR target_type = 'all'
    OR target_type = ?
    OR target_type = 'public'
  )`;

// GET /api/home/feed  — the merged, targeted "Latest from the MAO" list the
// mobile Home carousel renders. Newest first, one entry per post.
router.get('/feed', auth, wrap(async (req, res) => {
  const [beneficiaries] = await pool.query(
    'SELECT beneficiary_type, category FROM beneficiaries WHERE user_id = ? LIMIT 1',
    [req.user.id]
  );
  const type = beneficiaries[0]?.beneficiary_type || beneficiaries[0]?.category || 'farmer';
  const match = AUDIENCE_MATCH;

  const [announcements] = await pool.query(
    `SELECT id, title, body, published_at, created_at, target_type, target_beneficiary_types
     FROM announcements
     WHERE status = 'published' AND type IN ('announcement', 'general') AND ${match}`,
    [type, type]
  );
  const [programs] = await pool.query(
    `SELECT id, title, description, venue, schedule, end_at, published_at, created_at, target_type, target_beneficiary_types
     FROM programs
     WHERE status = 'published' AND cancelled = 0 AND ${match}`,
    [type, type]
  );
  const [trainings] = await pool.query(
    `SELECT id, title, description, venue, schedule, event_date, start_time, end_time, end_at, published_at, created_at, target_beneficiary_types
     FROM trainings
     WHERE publish_status = 'published' AND status <> 'cancelled' AND ${match}`,
    [type, type]
  );

  // Helper: check if an event has ended (past)
function isEventPast(item) {
  const now = new Date();
  if (item.kind === 'program') {
    const end = item.end_at || item.schedule;
    return end ? new Date(end) < now : false;
  }
  if (item.kind === 'training') {
    const end = item.end_at || item.end_time ? `${item.event_date}T${item.end_time}` : item.event_date;
    return end ? new Date(end) < now : false;
  }
  // advisories never expire
  return false;
}

const items = [
    ...announcements.map((r) => ({
      kind: 'advisory',
      id: r.id,
      title: r.title,
      body: r.body || '',
      recency: r.published_at || r.created_at,
      target_beneficiary_types: readTargetTypes(r),
    })),
    ...programs.map((r) => ({
      kind: 'program',
      id: r.id,
      title: r.title,
      body: r.description || '',
      recency: r.published_at || r.created_at,
      venue: r.venue || null,
      schedule: r.schedule,
      end_at: r.end_at,
      target_beneficiary_types: readTargetTypes(r),
    })),
    ...trainings.map((r) => ({
      kind: 'training',
      id: r.id,
      title: r.title,
      body: r.description || '',
      recency: r.published_at || r.created_at,
      venue: r.venue || null,
      schedule: r.schedule,
      event_date: r.event_date,
      event_time: r.start_time,
      end_time: r.end_time,
      end_at: r.end_at,
      target_beneficiary_types: readTargetTypes(r),
    })),
  ].filter((item) => !isEventPast(item));

  items.sort((a, b) => new Date(b.recency || 0).getTime() - new Date(a.recency || 0).getTime());
  const top = items.slice(0, FEED_LIMIT);

  // Benefits are only attached to the posts that made the cut, so the feed does
  // not pay for rows it will not show.
  const programIds = top.filter((i) => i.kind === 'program').map((i) => i.id);
  const trainingIds = top.filter((i) => i.kind === 'training').map((i) => i.id);
  const benefits = new Map();
  if (programIds.length) {
    const [rows] = await pool.query('SELECT program_id AS pid, benefit FROM program_benefits WHERE program_id IN (?) ORDER BY sort_order, id', [programIds]);
    for (const r of rows) benefits.set(`program-${r.pid}`, [...(benefits.get(`program-${r.pid}`) || []), r.benefit]);
  }
  if (trainingIds.length) {
    const [rows] = await pool.query('SELECT training_id AS tid, benefit FROM training_benefits WHERE training_id IN (?) ORDER BY sort_order, id', [trainingIds]);
    for (const r of rows) benefits.set(`training-${r.tid}`, [...(benefits.get(`training-${r.tid}`) || []), r.benefit]);
  }

  res.json(top.map((i) => ({ ...i, benefits: benefits.get(`${i.kind}-${i.id}`) || [] })));
}));

export default router;
