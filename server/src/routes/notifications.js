import { Router } from 'express';
import { pool } from '../config/db.js';
import { auth, adminOnly } from '../middleware/auth.js';
import { wrap, HttpError } from '../lib/utils.js';

const router = Router();

// GET /api/notifications  (admin: SMS log)
router.get('/', auth, adminOnly, wrap(async (req, res) => {
  const { status } = req.query;
  const params = [];
  let where = '';
  if (status) { where = 'WHERE n.status = ?'; params.push(status); }
  const [rows] = await pool.query(
    `SELECT n.*, b.first_name, b.last_name FROM notifications n
     LEFT JOIN beneficiaries b ON b.id = n.beneficiary_id
     ${where} ORDER BY n.sent_at DESC, n.id DESC LIMIT 200`,
    params
  );
  res.json(rows);
}));

// GET /api/notifications/mine  (beneficiary: every notification for them -
// content items and request_status updates alike, merged for the Inbox)
router.get('/mine', auth, wrap(async (req, res) => {
  if (req.user.role !== 'beneficiary') throw new HttpError(403, 'Beneficiary only');
  const [ben] = await pool.query(
    'SELECT id, contact_number FROM beneficiaries WHERE user_id = ? LIMIT 1',
    [req.user.id]
  );
  if (!ben[0]) throw new HttpError(404, 'Beneficiary profile not found');
  const { type } = req.query;
  const where = ['beneficiary_id = ?'];
  const params = [ben[0].id];
  if (type) {
    where.push('notification_type = ?');
    params.push(type);
  }
  const [rows] = await pool.query(
    `SELECT id, type, subject, subject_bis, message, message_bis, status,
            notification_type, announcement_id, request_id, sent_at
     FROM notifications
     WHERE ${where.join(' AND ')}
     ORDER BY sent_at DESC, id DESC LIMIT 100`,
    params
  );
  res.json(rows);
}));

export default router;
