import { Router } from 'express';
import { pool } from '../config/db.js';
import { auth, optionalAuth, adminOnly } from '../middleware/auth.js';
import { idempotent } from '../middleware/idempotency.js';
import { wrap, HttpError } from '../lib/utils.js';
import { capitalizeFirst } from '../lib/text.js';

const router = Router();

router.get('/', optionalAuth, wrap(async (req, res) => {
  const [rows] = await pool.query('SELECT * FROM faqs ORDER BY created_at DESC, id DESC');
  res.json(rows);
}));

router.post('/', auth, adminOnly, idempotent(), wrap(async (req, res) => {
  const { keywords } = req.body || {};
  const question = capitalizeFirst(String(req.body?.question ?? '').trim());
  const answer = capitalizeFirst(req.body?.answer ?? '');
  if (!question || !answer) throw new HttpError(400, 'Question and answer are required');
  const [r] = await pool.query(
    'INSERT INTO faqs (question, answer, keywords) VALUES (?, ?, ?)',
    [question, answer, keywords || null]
  );
  res.status(201).json({ id: r.insertId });
}));

router.put('/:id', auth, adminOnly, idempotent(), wrap(async (req, res) => {
  const { keywords } = req.body || {};
  const question = capitalizeFirst(String(req.body?.question ?? '').trim());
  const answer = capitalizeFirst(req.body?.answer ?? '');
  const [rows] = await pool.query('SELECT id FROM faqs WHERE id = ?', [req.params.id]);
  if (!rows[0]) throw new HttpError(404, 'FAQ not found');
  await pool.query(
    'UPDATE faqs SET question = ?, answer = ?, keywords = ? WHERE id = ?',
    [question, answer, keywords || null, req.params.id]
  );
  res.json({ ok: true });
}));

router.delete('/:id', auth, adminOnly, wrap(async (req, res) => {
  await pool.query('DELETE FROM faqs WHERE id = ?', [req.params.id]);
  res.json({ ok: true });
}));

export default router;