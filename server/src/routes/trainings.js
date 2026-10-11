import { Router } from 'express';
import { pool } from '../config/db.js';
import { broadcastToVerified, notifyVerifiedApp } from '../services/sms.js';
import { sendPush } from '../services/push.js';
import { auth, optionalAuth, adminOnly } from '../middleware/auth.js';
import { idempotent } from '../middleware/idempotency.js';
import { wrap, HttpError } from '../lib/utils.js';
import { trainingLifecycle } from '../lib/lifecycle.js';
import {
  readTargetTypes,
  legacyTargetType,
  toJsonColumn,
  requireTargetTypes,
  PUBLIC_TARGET,
  audienceMatchSql,
  audienceMatchParams,
  beneficiaryTypeForUser,
} from '../lib/targetTypes.js';
import { computeShowOnWebsite, normalizeSendSms } from '../lib/publication.js';
import { scheduleSmsLines } from '../lib/scheduleMsg.js';

const router = Router();

const STATUSES = new Set(['draft', 'published']);

// Re-shape a row for the client: the authoritative list plus the derived legacy
// value, so the admin UI and the mobile app read the same audience from one row.
function shapeRow(row) {
  if (!row) return row;
  const target_beneficiary_types = readTargetTypes(row);
  return {
    ...row,
    target_beneficiary_types,
    target_type: legacyTargetType(target_beneficiary_types),
  };
}

// Published trainings always create in-app notification rows for matching
// verified beneficiaries. SMS is sent in addition whenever the flag is on and
// has not been sent yet, so turning SMS on in a later edit still broadcasts
// without re-issuing the app/push half. This mirrors the programs publish flow
// and calls the same shared fan-out helpers.
async function ensurePublishedNotify(training) {
  if (training.publish_status !== 'published') return { app: 0, sms: 0, pushed: 0 };
  // Date range + time range, in both languages.
  const { en: scheduleEn, bis: scheduleBis } = scheduleSmsLines({
    schedule: training.schedule, endAt: training.end_at,
  });
  const subject = `Training: ${training.title}`;
  const subjectBis = `Pagbansay: ${training.title}`;
  const message = `${training.title} - ${training.description || ''}${scheduleEn}\n\nFor more details, please go to the AgriConnect mobile app.`.trim();
  const messageBis = `${training.title} - ${training.description || ''}${scheduleBis}\n\nPara sa dugang detalye, adto sa AgriConnect mobile app.`.trim();
  // Recipients are unioned across every selected type, not narrowed to one.
  const categories = readTargetTypes(training);
  const wantSms = training.send_sms && !training.sms_sent;
  if (training.notified && !wantSms) return { app: 0, sms: 0, pushed: 0 };

  let app = 0;
  let sms = 0;
  let pushed = 0;
  if (!training.notified) {
    app = (await notifyVerifiedApp({ subject, subjectBis, message, messageBis, categories, notificationType: 'training' })).length;
    pushed = await sendPush({ subject, subjectBis, message, messageBis, categories });
  }
  if (wantSms) {
    sms = (await broadcastToVerified({ subject, subjectBis, message, messageBis, categories, notificationType: 'training' })).length;
  }
  await pool.query(
    'UPDATE trainings SET notified = 1, sms_sent = CASE WHEN ? THEN 1 ELSE sms_sent END WHERE id = ?',
    [wantSms, training.id]
  );
  return { app, sms, pushed };
}

// Benefits live in a 1:N table like program_benefits, so a widowed training row
// naturally loses its list too (the FK cascades) and the page never has to
// reconcile a denormalised column.
async function withBenefits(rows) {
  if (!rows.length) return rows;
  const ids = rows.map((r) => r.id);
  const [benefits] = await pool.query(
    `SELECT * FROM training_benefits WHERE training_id IN (${ids.map(() => '?').join(', ')}) ORDER BY sort_order, id`,
    ids
  );
  const byTraining = benefits.reduce((acc, b) => {
    (acc[b.training_id] = acc[b.training_id] || []).push(b.benefit);
    return acc;
  }, {});
  return rows.map((r) => ({ ...shapeRow(r), benefits: byTraining[r.id] || [] }));
}

async function replaceBenefits(trainingId, benefits) {
  const list = Array.isArray(benefits) ? benefits.map((b) => String(b || '').trim()).filter(Boolean) : [];
  await pool.query('DELETE FROM training_benefits WHERE training_id = ?', [trainingId]);
  for (let i = 0; i < list.length; i++) {
    await pool.query(
      'INSERT INTO training_benefits (training_id, benefit, sort_order) VALUES (?, ?, ?)',
      [trainingId, list[i], i]
    );
  }
}

// One Schedule value, exactly like programs. Accepts the form's 'YYYY-MM-DDTHH:MM'
// (schedule = start, end_at = end of the date/time range) and the stored
// 'YYYY-MM-DD HH:MM:SS'. The DATE/TIME halves are derived so the calendar feed
// and mobile consumers (which still read event_date/start_time/end_time) keep
// working without a second source of truth to feed. end_time comes from end_at,
// so the legacy columns carry the true end of the range rather than a stub.
function readSchedule(v, endAt) {
  if (!v) return { schedule: null, event_date: null, start_time: null, end_time: null, end_at: null };
  const raw = String(v).trim();
  const m = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?$/.exec(raw);
  if (!m) {
    throw new HttpError(400, 'Schedule must be a valid date and time', { field: 'schedule' });
  }
  const [, y, mo, d, h, mi, s] = m;
  const date = new Date(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(s || 0));
  const real = date.getFullYear() === Number(y) && date.getMonth() === Number(mo) - 1 && date.getDate() === Number(d);
  if (!real) {
    throw new HttpError(400, 'Schedule must be a valid date and time', { field: 'schedule' });
  }
  // Year range validation
  if (Number(y) < 2000 || Number(y) > 2100) {
    throw new HttpError(400, 'Schedule year must be between 2000 and 2100', { field: 'schedule' });
  }

  let end_at = null;
  let end_time = `${h}:${mi}:${s || '00'}`;
  if (endAt != null && String(endAt).trim()) {
    const em = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?$/.exec(String(endAt).trim());
    if (!em) {
      throw new HttpError(400, 'End must be a valid date and time', { field: 'end_at' });
    }
    const [, ey, emo, ed, eh, emi, es] = em;
    const endDate = new Date(Number(ey), Number(emo) - 1, Number(ed), Number(eh), Number(emi), Number(es || 0));
    const realEnd = endDate.getFullYear() === Number(ey) && endDate.getMonth() === Number(emo) - 1 && endDate.getDate() === Number(ed);
    if (!realEnd) {
      throw new HttpError(400, 'End must be a valid date and time', { field: 'end_at' });
    }
    // Year range validation for end_at
    if (Number(ey) < 2000 || Number(ey) > 2100) {
      throw new HttpError(400, 'End year must be between 2000 and 2100', { field: 'end_at' });
    }
    // End must be after start
    const startEpoch = new Date(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(s || 0)).getTime();
    const endEpoch = endDate.getTime();
    if (endEpoch <= startEpoch) {
      throw new HttpError(422, 'End must be after the start.', { field: 'end_at' });
    }
    end_at = `${ey}-${emo}-${ed} ${eh}:${emi}:${es || '00'}`;
    end_time = `${eh}:${emi}:${es || '00'}`;
  }
  return {
    schedule: `${y}-${mo}-${d} ${h}:${mi}:${s || '00'}`,
    event_date: `${y}-${mo}-${d}`,
    start_time: `${h}:${mi}:${s || '00'}`,
    end_time,
    end_at,
  };
}

// GET /api/trainings  (admin: all, each with a lifecycle phase; public: only the
// published, non-cancelled records that are still upcoming or ongoing).
// The optional ?phase= (and legacy ?status=) query params serve the mobile
// consumers; the admin page filters the full list client-side, like Programs.
router.get('/', optionalAuth, wrap(async (req, res) => {
  const { phase, status, target } = req.query;
  const params = [];
  const where = [];
  if (status) { where.push('status = ?'); params.push(status); }
  // Membership, not equality, so filtering by one type also returns the sessions
  // that went to several.
  if (target) {
    if (target === 'all') {
      where.push(`JSON_CONTAINS(target_beneficiary_types, JSON_QUOTE('all'))`);
    } else {
      where.push(`JSON_CONTAINS(target_beneficiary_types, JSON_QUOTE(?))`);
      params.push(target);
    }
  }
  // A draft reaches nobody, so anonymous readers only ever see published rows,
  // the same rule programs and announcements apply.
  if (!req.user) where.push("publish_status = 'published'", "status <> 'cancelled'");
  // A signed-in beneficiary only sees the sessions whose audience includes
  // their own type (plus 'all'/'public'), mirroring the home feed.
  if (req.user && req.user.role === 'beneficiary') {
    const benType = await beneficiaryTypeForUser(pool, req.user.id);
    if (benType) {
      where.push(audienceMatchSql(''));
      params.push(...audienceMatchParams(benType));
    }
  }
  const [rows] = await pool.query(
    `SELECT * FROM trainings ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY created_at DESC, id DESC`,
    params
  );
  const withPhase = rows.map((r) => ({ ...r, phase: trainingLifecycle(r) }));
  let out = withPhase;
  if (phase) out = out.filter((r) => r.phase === phase);
  if (status) out = out.filter((r) => r.phase === status);
  if (!req.user) out = out.filter((r) => r.phase === 'upcoming' || r.phase === 'ongoing');
  res.json(await withBenefits(out));
}));

// POST /api/trainings  { title, description, benefits[], target_beneficiary_types[], venue, schedule, end_time, send_sms, status }
// `status` is the publish state (draft|published), exactly like programs.
router.post('/', auth, adminOnly, idempotent(), wrap(async (req, res) => {
  const { title, description, venue, send_sms, status } = req.body || {};
  if (!title) throw new HttpError(400, 'Title is required');
  // `target_type` is still accepted as a fallback so an older client keeps working.
  const targets = requireTargetTypes(
    req.body?.target_beneficiary_types ?? req.body?.target_types ?? req.body?.target_type
  );
  const st = STATUSES.has(status) ? status : 'published';
  // Show on website is automatic: true if published AND 'public' is in targets
  const showOnWebsite = computeShowOnWebsite(targets, { published: st === 'published' });
  const sendSms = normalizeSendSms(send_sms, targets);
  const { schedule, event_date, start_time, end_time, end_at } = readSchedule(req.body?.schedule, req.body?.end_at);
  const [r] = await pool.query(
    `INSERT INTO trainings (title, description, target_type, target_beneficiary_types, venue, schedule, event_date, start_time, end_time, end_at, status, publish_status, published_at, created_by, send_sms, sms_sent, notified, show_on_website)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'upcoming', ?, ?, ?, ?, 0, 0, ?)`,
    [
      String(title).trim(), description || null, legacyTargetType(targets), toJsonColumn(targets),
      venue || null, schedule, event_date, start_time, end_time, end_at,
      st, st === 'published' ? new Date() : null, req.user.id, sendSms, showOnWebsite,
    ]
  );
  await replaceBenefits(r.insertId, req.body?.benefits);

  const [full] = await pool.query('SELECT * FROM trainings WHERE id = ?', [r.insertId]);
  const { app, sms, pushed } = await ensurePublishedNotify(shapeRow(full[0]));
  res.status(201).json({ id: r.insertId, target_beneficiary_types: targets, sms_recipients: sms, app_recipients: app, push_recipients: pushed });
}));

// PUT /api/trainings/:id  (same fields as POST; business stays)
router.put('/:id', auth, adminOnly, idempotent(), wrap(async (req, res) => {
  const { title, description, venue, send_sms, status } = req.body || {};
  const [rows] = await pool.query(
    'SELECT id, published_at, status, publish_status, show_on_website, target_beneficiary_types, target_type FROM trainings WHERE id = ?',
    [req.params.id]
  );
  if (!rows[0]) throw new HttpError(404, 'Training not found');

  // A partial PUT (toggling just the website flag, say) keeps the stored
  // audience: only an explicit field re-targets the row. An explicitly empty
  // list is still rejected -- nobody wants a training that reaches nobody.
  const hasTarget = req.body?.target_beneficiary_types !== undefined
    || req.body?.target_types !== undefined
    || req.body?.target_type !== undefined;
  const targets = hasTarget
    ? requireTargetTypes(req.body?.target_beneficiary_types ?? req.body?.target_types ?? req.body?.target_type)
    : readTargetTypes(rows[0]);
  const st = STATUSES.has(status) ? status : rows[0].publish_status;
  const publishedAt = st === 'published' ? new Date() : null;
  // Show on website is automatic: true if published AND 'public' is in targets
  const showOnWebsite = computeShowOnWebsite(targets, { published: st === 'published', cancelled: rows[0].status === 'cancelled' });
  const sendSms = normalizeSendSms(send_sms, targets);
  const { schedule, event_date, start_time, end_time, end_at } = readSchedule(req.body?.schedule, req.body?.end_at);

  await pool.query(
    `UPDATE trainings SET title = ?, description = ?, target_type = ?, target_beneficiary_types = ?, venue = ?,
       schedule = ?, event_date = ?, start_time = ?, end_time = ?, end_at = ?, status = ?, publish_status = ?, published_at = ?, send_sms = ?,
       show_on_website = ?
     WHERE id = ?`,
    [
      String(title || '').trim(), description || null, legacyTargetType(targets), toJsonColumn(targets),
      venue || null, schedule, event_date, start_time, end_time, end_at,
      rows[0].status, st, publishedAt, sendSms, showOnWebsite, req.params.id,
    ]
  );
  await replaceBenefits(req.params.id, req.body?.benefits);

  const [full] = await pool.query('SELECT * FROM trainings WHERE id = ?', [req.params.id]);
  const { app, sms, pushed } = await ensurePublishedNotify(shapeRow(full[0]));
  res.json({ ok: true, target_beneficiary_types: targets, sms_recipients: sms, app_recipients: app, push_recipients: pushed });
}));

router.delete('/:id', auth, adminOnly, wrap(async (req, res) => {
  const [rows] = await pool.query('SELECT id FROM trainings WHERE id = ?', [req.params.id]);
  if (!rows[0]) throw new HttpError(404, 'Training not found');
  await pool.query('DELETE FROM trainings WHERE id = ?', [req.params.id]);
  res.json({ ok: true });
}));

// POST /api/trainings/:id/cancel — soft-cancel via the legacy status column
// ('cancelled'); the row stays visible (Cancelled tab) but public feeds and the
// calendar drop it.
router.post('/:id/cancel', auth, adminOnly, idempotent(), wrap(async (req, res) => {
  const [rows] = await pool.query('SELECT id, status FROM trainings WHERE id = ?', [req.params.id]);
  if (!rows[0]) throw new HttpError(404, 'Training not found');
  if (rows[0].status === 'cancelled') throw new HttpError(400, 'Training is already cancelled');
  await pool.query("UPDATE trainings SET status = 'cancelled' WHERE id = ?", [req.params.id]);
  res.json({ ok: true, cancelled: true });
}));

export default router;