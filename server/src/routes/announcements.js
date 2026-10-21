import { Router } from 'express';
import { pool } from '../config/db.js';
import { auth, optionalAuth, adminOnly, ADMIN_ROLES } from '../middleware/auth.js';
import { idempotent } from '../middleware/idempotency.js';
import { broadcastToVerified, notifyVerifiedApp } from '../services/sms.js';
import { sendPush } from '../services/push.js';
import { wrap, HttpError } from '../lib/utils.js';
import { capitalizeFirst } from '../lib/text.js';
import {
  normalizeTargetTypes,
  readTargetTypes,
  readNotifiedTypes,
  newlyTargeted,
  legacyTargetType,
  toJsonColumn,
  requireTargetTypes,
  audienceMatchSql,
  audienceMatchParams,
  beneficiaryTypeForUser,
} from '../lib/targetTypes.js';

const router = Router();

const TARGETS = new Set(['all', 'farmer', 'fisherfolk', 'livestock_owner']);
const STATUSES = new Set(['draft', 'published']);
const NOTIF_TYPES = new Set(['announcement', 'program', 'training']);

// One row per publish/republish on the advisory's publication trail.
async function logPublish({ announcementId, action, publishedAt, actorId, sms = 0, app = 0 }) {
  await pool.query(
    `INSERT INTO announcement_publish_log
       (announcement_id, action, published_at, actor_id, sms_recipients, app_recipients)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [announcementId, action, publishedAt, actorId, sms, app]
  );
}

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

// Publish (or already-published) announces create in-app notification rows for
// every matching verified beneficiary. SMS is sent in addition whenever the flag
// is on and has not been sent yet, so turning SMS on in a later edit still
// broadcasts without re-issuing the app/push half.
async function ensurePublishedNotify(announcement) {
  if (announcement.status !== 'published') return { app: 0, sms: 0, pushed: 0 };
  const subject = `ACM: ${announcement.title}`;
  const message = `${announcement.title}\n${String(announcement.body || '').replace(/\s+/g, ' ').slice(0, 150)}`;
  const messageBis = `Bag-ong pahibalo\n${announcement.title}\n${String(announcement.body || '').replace(/\s+/g, ' ').slice(0, 150)}`;
  // The announcements.type column already distinguishes announcement/program/
  // training, so reuse it for notification_type and keep the row deep-linkable.
  const notifType = NOTIF_TYPES.has(announcement.type) ? announcement.type : 'announcement';
  // Recipients are unioned across every selected type; see typePredicate in
  // services/sms.js for why both beneficiary_type and category are matched.
  const categories = readTargetTypes(announcement);
  // Only the target types not announced on an earlier publish get a fresh
  // in-app notification + push, so re-targeting a live advisory reaches the
  // newly added audience without spamming the original one.
  const pending = newlyTargeted(categories, readNotifiedTypes(announcement));
  const wantSms = announcement.send_sms && !announcement.sms_sent;
  if (!pending.length && !wantSms) return { app: 0, sms: 0, pushed: 0 };

  let app = 0;
  let sms = 0;
  let pushed = 0;
  if (pending.length) {
    app = (await notifyVerifiedApp({ subject, subjectBis: subject, message, messageBis, categories: pending, notificationType: notifType, announcementId: announcement.id })).length;
    pushed = await sendPush({
      subject, subjectBis: subject, message, messageBis, categories: pending,
      data: { screen: 'inbox', kind: 'advisory', id: announcement.id },
    });
  }
  if (wantSms) {
    sms = (await broadcastToVerified({ subject, subjectBis: subject, message, messageBis, categories, notificationType: notifType, announcementId: announcement.id })).length;
  }
  const announced = normalizeTargetTypes([...readNotifiedTypes(announcement), ...categories]);
  await pool.query(
    'UPDATE announcements SET notified = 1, notified_types = ?, sms_sent = CASE WHEN ? THEN 1 ELSE sms_sent END WHERE id = ?',
    [toJsonColumn(announced), wantSms, announcement.id]
  );
  return { app, sms, pushed };
}

// GET /api/announcements?status=&target=  (public read; admin sees all, staff see their own drafts)
router.get('/', optionalAuth, wrap(async (req, res) => {
  const { status, target } = req.query;
  const where = [];
  const params = [];
  if (status) { where.push('a.status = ?'); params.push(status); }
  // Membership, not equality: filtering by "farmer" should return the posts that
  // also went to fisherfolk, which a plain `target_type = 'farmer'` cannot express.
  if (target && TARGETS.has(target)) {
    if (target === 'all') {
      where.push(`JSON_CONTAINS(a.target_beneficiary_types, JSON_QUOTE('all'))`);
    } else {
      where.push(`JSON_CONTAINS(a.target_beneficiary_types, JSON_QUOTE(?))`);
      params.push(target);
    }
  }
  const role = req.user?.role;
  // Membership, not an exact match, so a SUPER_ADMIN also sees drafts. Comparing
  // against 'admin' alone silently hid unpublished announcements from them.
  if (!ADMIN_ROLES.includes(role)) {
    if (role) {
      where.push('(a.status = \'published\' OR a.created_by = ?)');
      params.push(req.user.id);
    } else {
      where.push('a.status = \'published\'');
    }
  }
  // A signed-in beneficiary only sees the posts whose audience includes their
  // own type (plus 'all'/'public'), mirroring the home feed.
  if (req.user && req.user.role === 'beneficiary') {
    const benType = await beneficiaryTypeForUser(pool, req.user.id);
    if (benType) {
      where.push(audienceMatchSql('a'));
      params.push(...audienceMatchParams(benType));
    }
  }
  const [rows] = await pool.query(
    `SELECT a.*, u.email AS author FROM announcements a
     LEFT JOIN users u ON u.id = a.created_by
     ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
     ORDER BY a.created_at DESC, a.id DESC`,
    params
  );
  res.json(rows.map(shapeRow));
}));

// POST /api/announcements  { title, body, target_beneficiary_types[], send_sms, status }
router.post('/', auth, adminOnly, idempotent(), wrap(async (req, res) => {
  const title = capitalizeFirst(String(req.body?.title ?? '').trim());
  const body = capitalizeFirst(req.body?.body ?? '');
  const { send_sms, status, type } = req.body || {};
  if (!title || !body) throw new HttpError(400, 'Title and content are required');
  // `target_type` is still accepted as a fallback so an older client keeps working.
  const targets = requireTargetTypes(
    req.body?.target_beneficiary_types ?? req.body?.target_types ?? req.body?.target_type
  );
  const st = STATUSES.has(status) ? status : 'published';
  const publishedAt = st === 'published' ? new Date() : null;

  const [r] = await pool.query(
    `INSERT INTO announcements (title, body, target_type, target_beneficiary_types, send_sms, status, published_at, type, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      String(title), body, legacyTargetType(targets), toJsonColumn(targets),
      send_sms ? 1 : 0, st, publishedAt, type || 'announcement', req.user.id,
    ]
  );

  const newRow = {
    id: r.insertId, title, body,
    target_beneficiary_types: targets, target_type: legacyTargetType(targets),
    send_sms: send_sms ? 1 : 0, status: st, sms_sent: 0, notified: 0, notified_types: [], type: type || 'announcement',
  };
  const { app, sms, pushed } = await ensurePublishedNotify(newRow);
  if (st === 'published' && publishedAt) {
    await logPublish({ announcementId: r.insertId, action: 'published', publishedAt, actorId: req.user.id, sms, app });
  }

  res.status(201).json({ id: r.insertId, ok: true, target_beneficiary_types: targets, sms_recipients: sms, app_recipients: app, push_recipients: pushed });
}));

// PUT /api/announcements/:id  { title, body, target_beneficiary_types[], send_sms, status }
router.put('/:id', auth, adminOnly, idempotent(), wrap(async (req, res) => {
  const title = capitalizeFirst(String(req.body?.title ?? '').trim());
  const body = capitalizeFirst(req.body?.body ?? '');
  const { send_sms, status } = req.body || {};
  if (!title || !body) throw new HttpError(400, 'Title and content are required');
  const [rows] = await pool.query('SELECT id, published_at, sms_sent FROM announcements WHERE id = ?', [req.params.id]);
  if (!rows[0]) throw new HttpError(404, 'Announcement not found');

  const targets = requireTargetTypes(
    req.body?.target_beneficiary_types ?? req.body?.target_types ?? req.body?.target_type
  );
  const st = STATUSES.has(status) ? status : rows[0].status;
  const publishedAt = st === 'published' ? new Date() : null;

  const traits = rows[0].published_at ? 'republished' : 'published';
  await pool.query(
    `UPDATE announcements SET title = ?, body = ?, target_type = ?, target_beneficiary_types = ?, send_sms = ?, status = ?, published_at = ? WHERE id = ?`,
    [String(title), body, legacyTargetType(targets), toJsonColumn(targets), send_sms ? 1 : 0, st, publishedAt, req.params.id]
  );

  // Decide SMS from the persisted row so a draft saved with "send SMS" checked
  // ALWAYS sends when later published, even if the edit form drops the flag.
  const [after] = await pool.query(
    'SELECT id, title, body, target_type, target_beneficiary_types, send_sms, sms_sent, status, notified, notified_types, type FROM announcements WHERE id = ?',
    [req.params.id]
  );
  const { app, sms, pushed } = await ensurePublishedNotify(shapeRow(after[0]));
  if (st === 'published' && publishedAt) {
    await logPublish({ announcementId: req.params.id, action: traits, publishedAt, actorId: req.user.id, sms, app });
  }

  res.json({ ok: true, target_beneficiary_types: targets, sms_recipients: sms, app_recipients: app, push_recipients: pushed });
}));

// DELETE /api/announcements/:id
router.delete('/:id', auth, adminOnly, wrap(async (req, res) => {
  await pool.query('DELETE FROM announcements WHERE id = ?', [req.params.id]);
  res.json({ ok: true });
}));

// GET /api/announcements/:id/history - the publish/republish trail, newest first.
router.get('/:id/history', auth, adminOnly, wrap(async (req, res) => {
  const [rows] = await pool.query(
    `SELECT l.id, l.action, l.published_at, l.sms_recipients, l.app_recipients,
            COALESCE(CONCAT_WS(' ', u.first_name, u.last_name), u.email, 'Unknown') AS actor
     FROM announcement_publish_log l
     LEFT JOIN users u ON u.id = l.actor_id
     WHERE l.announcement_id = ?
     ORDER BY l.published_at DESC, l.id DESC`,
    [Number(req.params.id)]
  );
  res.json(rows);
}));

// POST /api/announcements/:id/send-sms  -> texts target recipients (once only)
router.post('/:id/send-sms', auth, adminOnly, idempotent(), wrap(async (req, res) => {
  const [rows] = await pool.query(
    'SELECT id, title, body, send_sms, sms_sent, status, target_type, target_beneficiary_types FROM announcements WHERE id = ?',
    [req.params.id]
  );
  if (!rows[0]) throw new HttpError(404, 'Announcement not found');
  const a = rows[0];
  if (a.sms_sent) throw new HttpError(409, 'SMS already sent for this announcement');
  if (a.status !== 'published') throw new HttpError(409, 'Only published announcements can be broadcast');

  const subject = `ACM: ${a.title}`;
  const message = `${a.title}\n${a.body.replace(/\s+/g, ' ').slice(0, 150)}`;
  const results = await broadcastToVerified({
    subject,
    subjectBis: subject,
    message,
    messageBis: `Bag-ong pahibalo\n${a.title}\n${a.body.replace(/\s+/g, ' ').slice(0, 150)}`,
    categories: readTargetTypes(a),
  });
  await pool.query('UPDATE announcements SET sms_sent = 1 WHERE id = ?', [a.id]);
  res.json({ ok: true, recipients: results.length, results });
}));

export default router;