import { Router } from 'express';
import { pool } from '../config/db.js';
import { auth, optionalAuth, adminOnly, ADMIN_ROLES } from '../middleware/auth.js';
import { idempotent } from '../middleware/idempotency.js';
import { wrap, HttpError } from '../lib/utils.js';
import { capitalizeFirst } from '../lib/text.js';

const router = Router();

// GET /api/carousel?all=1  — public: active slides ordered by sort_order; ?all=1 includes inactive (admin)
router.get('/', optionalAuth, wrap(async (req, res) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
  const all = req.query.all === '1';
  // Test membership, not an exact string: a SUPER_ADMIN is an admin too, and
  // matching role === 'admin' here locked the Landing Content screen out.
  if (all && !ADMIN_ROLES.includes(req.user?.role)) {
    throw new HttpError(403, 'Forbidden');
  }
  const [rows] = await pool.query(
    `SELECT * FROM carousel_slides
     ${all ? '' : 'WHERE status = "active"'}
     ORDER BY sort_order ASC, id ASC`
  );
  res.json(rows);
}));

// POST /api/carousel
router.post('/', auth, adminOnly, idempotent(), wrap(async (req, res) => {
  const { category, image_url, link, sort_order, status } = req.body || {};
  const title = capitalizeFirst(String(req.body?.title ?? '').trim());
  const subtitle = req.body?.subtitle ? capitalizeFirst(req.body.subtitle) : null;
  if (!title) throw new HttpError(400, 'Caption is required');
  if (!image_url || !String(image_url).trim()) throw new HttpError(400, 'Slide image is required');
  if (!category || !String(category).trim()) throw new HttpError(400, 'Category is required');
  const order = Math.max(0, Number(sort_order) || 0);
  const [r] = await pool.query(
    `INSERT INTO carousel_slides (title, subtitle, category, image_url, link, sort_order, status)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [title, subtitle, category || 'Agriculture', image_url.trim(), link || null, order, status || 'active']
  );
  res.status(201).json({ id: r.insertId });
}));

// PUT /api/carousel/reorder — admin: persist a full ordering of ids (sort_order set by position)
router.put('/reorder', auth, adminOnly, wrap(async (req, res) => {
  const { ids } = req.body || {};
  if (!Array.isArray(ids) || ids.length === 0) throw new HttpError(400, 'Ordered slide ids are required');
  const [rows] = await pool.query('SELECT id FROM carousel_slides WHERE id IN (?)', [ids]);
  const known = new Set(rows.map((r) => Number(r.id)));
  for (const id of ids) {
    if (!known.has(Number(id))) throw new HttpError(400, `Unknown slide id: ${id}`);
  }
  for (let i = 0; i < ids.length; i++) {
    await pool.query('UPDATE carousel_slides SET sort_order = ? WHERE id = ?', [i, ids[i]]);
  }
  res.json({ ok: true });
}));

// PUT /api/carousel/:id/status - admin: toggle status only
router.put('/:id/status', auth, adminOnly, wrap(async (req, res) => {
  const { status } = req.body || {};
  const next = status === 'active' ? 'active' : 'inactive';
  const [rows] = await pool.query('SELECT id FROM carousel_slides WHERE id = ?', [req.params.id]);
  if (!rows[0]) throw new HttpError(404, 'Slide not found');
  await pool.query('UPDATE carousel_slides SET status = ? WHERE id = ?', [next, req.params.id]);
  res.json({ ok: true, status: next });
}));

// PATCH /api/carousel/:id/status - admin: toggle status only
router.patch('/:id/status', auth, adminOnly, wrap(async (req, res) => {
  const { status } = req.body || {};
  const next = status === 'active' ? 'active' : 'inactive';
  const [rows] = await pool.query('SELECT id FROM carousel_slides WHERE id = ?', [req.params.id]);
  if (!rows[0]) throw new HttpError(404, 'Slide not found');
  await pool.query('UPDATE carousel_slides SET status = ? WHERE id = ?', [next, req.params.id]);
  res.json({ ok: true, status: next });
}));

// PUT /api/carousel/:id
router.put('/:id', auth, adminOnly, idempotent(), wrap(async (req, res) => {
  const { category, image_url, link, sort_order, status } = req.body || {};
  const title = capitalizeFirst(String(req.body?.title ?? '').trim());
  const subtitle = req.body?.subtitle ? capitalizeFirst(req.body.subtitle) : null;
  if (!title) throw new HttpError(400, 'Caption is required');
  if (!image_url || !String(image_url).trim()) throw new HttpError(400, 'Slide image is required');
  if (!category || !String(category).trim()) throw new HttpError(400, 'Category is required');
  const [rows] = await pool.query('SELECT id FROM carousel_slides WHERE id = ?', [req.params.id]);
  if (!rows[0]) throw new HttpError(404, 'Slide not found');
  const order = Math.max(0, Number(sort_order) || 0);
  const st = status === 'active' ? 'active' : 'inactive';
  await pool.query(
    `UPDATE carousel_slides
     SET title = ?, subtitle = ?, category = ?, image_url = ?, link = ?, sort_order = ?, status = ?
     WHERE id = ?`,
    [title, subtitle, category || 'Agriculture', image_url.trim(), link || null, order, st, req.params.id]
  );
  res.json({ ok: true });
}));

// DELETE /api/carousel/:id
router.delete('/:id', auth, adminOnly, wrap(async (req, res) => {
  await pool.query('DELETE FROM carousel_slides WHERE id = ?', [req.params.id]);
  const [remaining] = await pool.query(
    'SELECT id FROM carousel_slides ORDER BY sort_order ASC, id ASC'
  );
  for (let i = 0; i < remaining.length; i++) {
    await pool.query('UPDATE carousel_slides SET sort_order = ? WHERE id = ?', [i, remaining[i].id]);
  }
  res.json({ ok: true });
}));

export default router;