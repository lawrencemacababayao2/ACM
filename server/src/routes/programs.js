import { Router } from 'express';
import { pool } from '../config/db.js';
import { broadcastToVerified, notifyVerifiedApp } from '../services/sms.js';
import { sendPush } from '../services/push.js';
import { auth, optionalAuth, adminOnly } from '../middleware/auth.js';
import { idempotent } from '../middleware/idempotency.js';
import { wrap, HttpError } from '../lib/utils.js';
import { programLifecycle } from '../lib/lifecycle.js';
import {
  normalizeTargetTypes,
  readTargetTypes,
  readNotifiedTypes,
  newlyTargeted,
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

// end_at is optional; the form sends 'YYYY-MM-DDTHH:MM', MySQL stores DATETIME
// with a space, so normalise here (anything unparseable is simply dropped).
function normEndAt(v) {
  if (!v) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?$/.exec(String(v).trim());
  if (!m) return null;
  const [, y, mo, d, h, mi, s] = m;
  return `${y}-${mo}-${d} ${h}:${mi}:${s || '00'}`;
}

// Published programs always create in-app notification rows for matching
// verified beneficiaries. SMS is sent in addition whenever the flag is on and
// has not been sent yet, so turning SMS on in a later edit still broadcasts
// without re-issuing the app/push half.
async function ensurePublishedNotify(program) {
  if (program.status !== 'published') return { app: 0, sms: 0, pushed: 0 };
  // Date range + time range, in both languages.
  const { en: scheduleEn, bis: scheduleBis } = scheduleSmsLines({
    schedule: program.schedule, endAt: program.end_at,
  });
  const subject = `Program: ${program.title}`;
  const subjectBis = `Programa: ${program.title}`;
  const message = `${program.title} - ${program.description || ''}${scheduleEn}\n\nFor more details, please go to the AgriConnect mobile app.`.trim();
  const messageBis = `${program.title} - ${program.description || ''}${scheduleBis}\n\nPara sa dugang detalye, adto sa AgriConnect mobile app.`.trim();
  // Recipients are unioned across every selected type, not narrowed to one.
  const categories = readTargetTypes(program);
  // Only the target types not announced on an earlier publish get a fresh
  // in-app notification + push, so re-targeting a live program reaches the
  // newly added audience without spamming the original one.
  const pending = newlyTargeted(categories, readNotifiedTypes(program));
  const wantSms = program.send_sms && !program.sms_sent;
  if (!pending.length && !wantSms) return { app: 0, sms: 0, pushed: 0 };

  let app = 0;
  let sms = 0;
  let pushed = 0;
  if (pending.length) {
    app = (await notifyVerifiedApp({ subject, subjectBis, message, messageBis, categories: pending, notificationType: 'program' })).length;
    pushed = await sendPush({
      subject, subjectBis, message, messageBis, categories: pending,
      data: { screen: 'inbox', kind: 'program', id: program.id },
    });
  }
  if (wantSms) {
    sms = (await broadcastToVerified({ subject, subjectBis, message, messageBis, categories, notificationType: 'program' })).length;
  }
  const announced = normalizeTargetTypes([...readNotifiedTypes(program), ...categories]);
  await pool.query(
    'UPDATE programs SET notified = 1, notified_types = ?, sms_sent = CASE WHEN ? THEN 1 ELSE sms_sent END WHERE id = ?',
    [toJsonColumn(announced), wantSms, program.id]
  );
  return { app, sms, pushed };
}

async function withBenefits(rows) {
  if (!rows.length) return rows;
  const ids = rows.map((r) => r.id);
  const [benefits] = await pool.query(
    `SELECT * FROM program_benefits WHERE program_id IN (${ids.map(() => '?').join(', ')}) ORDER BY sort_order, id`,
    ids
  );
  const byProgram = benefits.reduce((acc, b) => {
    (acc[b.program_id] = acc[b.program_id] || []).push(b.benefit);
    return acc;
  }, {});
  return rows.map((r) => ({ ...shapeRow(r), benefits: byProgram[r.id] || [] }));
}

async function replaceBenefits(programId, benefits) {
  const list = Array.isArray(benefits) ? benefits.map((b) => String(b || '').trim()).filter(Boolean) : [];
  await pool.query('DELETE FROM program_benefits WHERE program_id = ?', [programId]);
  for (let i = 0; i < list.length; i++) {
    await pool.query(
      'INSERT INTO program_benefits (program_id, benefit, sort_order) VALUES (?, ?, ?)',
      [programId, list[i], i]
    );
  }
}

// GET /api/programs  (admin: all with lifecycle phase; public: published,
// non-cancelled, and only the ones still relevant, i.e. upcoming or ongoing).
router.get('/', optionalAuth, wrap(async (req, res) => {
  const where = [];
  const params = [];
  if (!req.user) {
    where.push("status = 'published'", 'cancelled = 0');
  }
  // A signed-in beneficiary only sees the programs whose audience includes
  // their own type (plus 'all'/'public'), mirroring the home feed.
  if (req.user && req.user.role === 'beneficiary') {
    const benType = await beneficiaryTypeForUser(pool, req.user.id);
    if (benType) {
      where.push(audienceMatchSql(''));
      params.push(...audienceMatchParams(benType));
    }
  }
  const sql = `SELECT * FROM programs ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY created_at DESC, id DESC`;
  const [rows] = await pool.query(sql, params);
  const withPhase = rows.map((r) => ({ ...r, phase: programLifecycle(r) }));
  if (!req.user) {
    return res.json(await withBenefits(withPhase.filter((r) => r.phase === 'upcoming' || r.phase === 'ongoing')));
  }
  res.json(await withBenefits(withPhase));
}));

// POST /api/programs  { title, description, benefits[], target_beneficiary_types[], venue, schedule, end_at, send_sms, status }
router.post('/', auth, adminOnly, idempotent(), wrap(async (req, res) => {
  const { title, description, venue, schedule, end_at, send_sms, status } = req.body || {};
  if (!title) throw new HttpError(400, 'Title is required');
  // `target_type` is still accepted as a fallback so an older client keeps working.
  const targets = requireTargetTypes(
    req.body?.target_beneficiary_types ?? req.body?.target_types ?? req.body?.target_type
  );
  const st = STATUSES.has(status) ? status : 'draft';
  // Show on website is automatic: true if published AND 'public' is in targets
  const showOnWebsite = computeShowOnWebsite(targets, { published: st === 'published' });
  const sendSms = normalizeSendSms(send_sms, targets);
  const [r] = await pool.query(
    `INSERT INTO programs (title, description, target_type, target_beneficiary_types, venue, schedule, end_at, send_sms, status, published_at, show_on_website)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      String(title).trim(), description || null, legacyTargetType(targets), toJsonColumn(targets),
      venue || null, schedule || null, normEndAt(end_at), sendSms, st,
      st === 'published' ? new Date() : null, showOnWebsite,
    ]
  );
  await replaceBenefits(r.insertId, req.body?.benefits);

  const [full] = await pool.query('SELECT * FROM programs WHERE id = ?', [r.insertId]);
  const { app, sms, pushed } = await ensurePublishedNotify(shapeRow(full[0]));
  res.status(201).json({ id: r.insertId, target_beneficiary_types: targets, sms_recipients: sms, app_recipients: app, push_recipients: pushed });
}));

// PUT /api/programs/:id  (same fields as POST; business stays)
router.put('/:id', auth, adminOnly, idempotent(), wrap(async (req, res) => {
  const { title, description, venue, schedule, end_at, send_sms, status } = req.body || {};
  const [rows] = await pool.query(
    'SELECT id, status, published_at, cancelled, show_on_website, target_beneficiary_types, target_type FROM programs WHERE id = ?',
    [req.params.id]
  );
  if (!rows[0]) throw new HttpError(404, 'Program not found');

  // A partial PUT (toggling just the website flag, say) keeps the stored
  // audience: only an explicit field re-targets the row. An explicitly empty
  // list is still rejected -- nobody wants a program that reaches nobody.
  const hasTarget = req.body?.target_beneficiary_types !== undefined
    || req.body?.target_types !== undefined
    || req.body?.target_type !== undefined;
  const targets = hasTarget
    ? requireTargetTypes(req.body?.target_beneficiary_types ?? req.body?.target_types ?? req.body?.target_type)
    : readTargetTypes(rows[0]);
  const st = STATUSES.has(status) ? status : rows[0].status;
  const publishedAt = st === 'published' ? new Date() : null;
  // Show on website is automatic: true if published AND 'public' is in targets
  const showOnWebsite = computeShowOnWebsite(targets, { published: st === 'published', cancelled: !!rows[0].cancelled });
  const sendSms = normalizeSendSms(send_sms, targets);

  await pool.query(
    `UPDATE programs SET title = ?, description = ?, target_type = ?, target_beneficiary_types = ?, venue = ?, schedule = ?,
       end_at = ?, send_sms = ?, status = ?, published_at = ?, show_on_website = ? WHERE id = ?`,
    [
      String(title || '').trim(), description || null, legacyTargetType(targets), toJsonColumn(targets),
      venue || null, schedule || null, normEndAt(end_at), sendSms, st, publishedAt,
      showOnWebsite, req.params.id,
    ]
  );
  await replaceBenefits(req.params.id, req.body?.benefits);

  const [full] = await pool.query('SELECT * FROM programs WHERE id = ?', [req.params.id]);
  const { app, sms, pushed } = await ensurePublishedNotify(shapeRow(full[0]));
  res.json({ ok: true, target_beneficiary_types: targets, sms_recipients: sms, app_recipients: app, push_recipients: pushed });
}));

router.delete('/:id', auth, adminOnly, wrap(async (req, res) => {
  const [rows] = await pool.query('SELECT id FROM programs WHERE id = ?', [req.params.id]);
  if (!rows[0]) throw new HttpError(404, 'Program not found');
  await pool.query('DELETE FROM programs WHERE id = ?', [req.params.id]);
  res.json({ ok: true });
}));

// POST /api/programs/:id/cancel — soft-cancel: the row stays (visible under the
// Cancelled tab) but the public feed drops it.
router.post('/:id/cancel', auth, adminOnly, idempotent(), wrap(async (req, res) => {
  const [rows] = await pool.query('SELECT id, cancelled FROM programs WHERE id = ?', [req.params.id]);
  if (!rows[0]) throw new HttpError(404, 'Program not found');
  if (rows[0].cancelled) throw new HttpError(400, 'Program is already cancelled');
  await pool.query('UPDATE programs SET cancelled = 1 WHERE id = ?', [req.params.id]);
  res.json({ ok: true, cancelled: true });
}));

export default router;