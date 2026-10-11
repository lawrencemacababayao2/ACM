import { Router } from 'express';
import { pool } from '../config/db.js';
import { auth } from '../middleware/auth.js';
import { wrap, HttpError } from '../lib/utils.js';

const router = Router();

// POST /api/push/token  { token, lang }  (auth) — register/refresh device token
router.post('/token', auth, wrap(async (req, res) => {
  const token = String(req.body?.token || '').trim();
  if (!token) throw new HttpError(400, 'Token is required');
  const lang = req.body?.lang === 'en' ? 'en' : 'bis';
  await pool.execute(
    `INSERT INTO push_tokens (user_id, token, lang) VALUES (?, ?, ?)
     ON DUPLICATE KEY UPDATE user_id = VALUES(user_id), lang = VALUES(lang), updated_at = CURRENT_TIMESTAMP`,
    [req.user.id, token, lang]
  );
  res.json({ ok: true });
}));

export default router;