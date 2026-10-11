import { Router } from 'express';
import { pool } from '../config/db.js';
import { auth, optionalAuth, adminOnly } from '../middleware/auth.js';
import { idempotent } from '../middleware/idempotency.js';
import { wrap, HttpError } from '../lib/utils.js';

const router = Router();

const KEYS = new Set(['about', 'stats', 'why', 'services', 'contact']);

const TABLES = {
  about: 'about_cards',
  stats: 'stats_cards',
  why: 'why_cards',
  services: 'service_cards',
  contact: 'contact_info',
};

const LIST_QUERIES = {
  about: 'SELECT id, icon, title, text, points FROM about_cards ORDER BY sort_order, id',
  stats: 'SELECT id, icon, value, label FROM stats_cards ORDER BY sort_order, id',
  why: 'SELECT id, icon, title, description AS `desc` FROM why_cards ORDER BY sort_order, id',
  services: 'SELECT id, service_key AS `key`, icon, title, short, intro, img, points FROM service_cards ORDER BY sort_order, id',
};

const REQUIRED_FIELDS = {
  about: ['title', 'text'],
  stats: ['value', 'label'],
  why: ['title', 'desc'],
  services: ['key', 'title', 'short'],
};

function isMissing(item, f) {
  const v = String(item?.[f] || '').trim();
  if (v) return false;
  return !(f === 'text' && Array.isArray(item?.points) && item.points.length > 0);
}

function parseJson(v) {
  if (typeof v !== 'string') return v;
  try { return JSON.parse(v); } catch { return v; }
}

function cleanPoints(content) {
  return Array.isArray(content)
    ? content.map((item) => (Array.isArray(item?.points)
      ? { ...item, points: item.points.filter((p) => typeof p === 'string' ? p.trim() !== '' : (p.title || '').trim() !== '' || (p.desc || '').trim() !== '') }
      : item))
    : content;
}

function validateContent(key, content) {
  const required = REQUIRED_FIELDS[key];
  if (!required) return;
  const arr = Array.isArray(content) ? content : [];
  for (let i = 0; i < arr.length; i++) {
    for (const f of required) {
      if (isMissing(arr[i], f)) {
        throw new HttpError(400, `Item ${i + 1}: "${f}" is required`);
      }
    }
  }
  if (key === 'services') {
    for (let i = 0; i < arr.length; i++) {
      const pts = Array.isArray(arr[i]?.points) ? arr[i].points : [];
      for (let p = 0; p < pts.length; p++) {
        const pt = pts[p];
        if (!pt || typeof pt !== 'object' || !String(pt.title || '').trim() || !String(pt.desc || '').trim()) {
          throw new HttpError(400, `Item ${i + 1}: detail point ${p + 1} requires both "title" and "desc"`);
        }
      }
    }
  }
}

const CONTACT_FIELDS = ['heading', 'title', 'address', 'hours', 'phone', 'email'];

function validateContact(content) {
  if (!content || typeof content !== 'object' || Array.isArray(content)) throw new HttpError(400, 'Invalid contact content');
  for (const f of CONTACT_FIELDS) {
    if (!String(content[f] || '').trim()) throw new HttpError(400, `Contact "${f}" is required`);
  }
}

async function getList(key) {
  const [rows] = await pool.query(LIST_QUERIES[key]);
  return rows.map((r) => ({ ...r, points: parseJson(r.points) }));
}

async function getContact() {
  const [rows] = await pool.query('SELECT heading, title, address, hours, phone, email FROM contact_info WHERE id = 1');
  return rows[0] || null;
}

// GET /api/landing-sections?key=about   >> public
router.get('/', optionalAuth, wrap(async (req, res) => {
  const { key } = req.query;
  if (key) {
    if (!KEYS.has(key)) throw new HttpError(404, 'Section not found');
    if (key === 'contact') {
      const c = await getContact();
      if (!c) throw new HttpError(404, 'Section not found');
      return res.json(c);
    }
    return res.json(await getList(key));
  }
  res.json({
    about: await getList('about'),
    stats: await getList('stats'),
    why: await getList('why'),
    services: await getList('services'),
    contact: await getContact(),
  });
}));

// PUT /api/landing-sections/:key   >> staff/admin replace a section's content
router.put('/:key', auth, adminOnly, idempotent(), wrap(async (req, res) => {
  const { key } = req.params;
  if (!KEYS.has(key)) throw new HttpError(400, 'Unknown section');
  const content = req.body.content;
  if (content === undefined || content === null) throw new HttpError(400, 'content is required');

  if (key === 'contact') {
    validateContact(content);
    await pool.query(
      `INSERT INTO contact_info (id, heading, title, address, hours, phone, email)
       VALUES (1, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE heading = VALUES(heading), title = VALUES(title),
         address = VALUES(address), hours = VALUES(hours),
         phone = VALUES(phone), email = VALUES(email)`,
      [content.heading, content.title, content.address, content.hours, content.phone, content.email]
    );
    return res.json({ ok: true });
  }

  const cleaned = cleanPoints(content);
  validateContent(key, cleaned);

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await conn.query(`DELETE FROM ${TABLES[key]}`);
    for (let i = 0; i < cleaned.length; i++) {
      const item = cleaned[i];
      const points = JSON.stringify(Array.isArray(item.points) ? item.points : []);
      if (key === 'about') {
        await conn.query('INSERT INTO about_cards (icon, title, text, points, sort_order) VALUES (?, ?, ?, ?, ?)',
          [item.icon || 'leaf', item.title, item.text || '', points, i]);
      } else if (key === 'stats') {
        await conn.query('INSERT INTO stats_cards (icon, value, label, sort_order) VALUES (?, ?, ?, ?)',
          [item.icon || 'leaf', item.value, item.label, i]);
      } else if (key === 'why') {
        await conn.query('INSERT INTO why_cards (icon, title, description, sort_order) VALUES (?, ?, ?, ?)',
          [item.icon || 'leaf', item.title, item.desc || '', i]);
      } else if (key === 'services') {
        await conn.query('INSERT INTO service_cards (service_key, icon, title, short, intro, img, points, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
          [item.key, item.icon || 'leaf', item.title, item.short, item.intro || '', item.img || '', points, i]);
      }
    }
    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
  res.json({ ok: true });
}));

export default router;