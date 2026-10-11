import { Router } from 'express';
import { randomBytes } from 'node:crypto';
import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { auth, adminOnly } from '../middleware/auth.js';
import { wrap, HttpError } from '../lib/utils.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const UPLOAD_DIR = path.join(__dirname, '..', '..', 'uploads');

const router = Router();

// POST /api/uploads  — staff: accept a base64 data URL and persist it to disk
router.post('/', auth, adminOnly, wrap(async (req, res) => {
  const { dataUrl } = req.body || {};
  if (!dataUrl || typeof dataUrl !== 'string') throw new HttpError(400, 'Image data is required');
  const m = dataUrl.match(/^data:image\/(png|jpe?g|gif|webp);base64,(.+)$/i);
  if (!m) throw new HttpError(400, 'Invalid image data (PNG/JPG/GIF/WebP only)');
  const ext = m[1].toLowerCase() === 'jpeg' ? 'jpg' : m[1].toLowerCase();
  const buf = Buffer.from(m[2], 'base64');
  if (buf.length === 0) throw new HttpError(400, 'Empty image');
  if (buf.length > 15 * 1024 * 1024) throw new HttpError(400, 'Image too large (max 15 MB)');
  if (!existsSync(UPLOAD_DIR)) mkdirSync(UPLOAD_DIR, { recursive: true });
  const name = `${Date.now()}-${randomBytes(6).toString('hex')}.${ext}`;
  writeFileSync(path.join(UPLOAD_DIR, name), buf);
  const url = `${req.protocol}://${req.get('host')}/uploads/${name}`;
  res.status(201).json({ url, name });
}));

export default router;