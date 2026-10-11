import { randomBytes } from 'node:crypto';
import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { HttpError } from './utils.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Same directory that index.js serves at /uploads.
export const UPLOAD_DIR = path.join(__dirname, '..', '..', 'uploads');

// Decodes a base64 image data URL, writes it to server/uploads, and returns its
// public path (/uploads/<name>). Shared by the profile-photo and registration-ID
// flows so both cap size and accepted formats the same way, without depending on
// the staff-only POST /api/uploads route.
export function saveDataUrlImage(dataUrl, { prefix = 'img', maxBytes = 8 * 1024 * 1024, exts = 'png|jpe?g|webp' } = {}) {
  const m = String(dataUrl || '').match(new RegExp(`^data:image\\/(${exts});base64,(.+)$`, 'i'));
  if (!m) throw new HttpError(400, 'Invalid image data (PNG/JPG/WebP only)');
  const ext = m[1].toLowerCase() === 'jpeg' ? 'jpg' : m[1].toLowerCase();
  const buf = Buffer.from(m[2], 'base64');
  if (buf.length === 0) throw new HttpError(400, 'Empty image');
  if (buf.length > maxBytes) {
    throw new HttpError(400, `Image too large (max ${Math.round(maxBytes / (1024 * 1024))} MB)`);
  }
  if (!existsSync(UPLOAD_DIR)) mkdirSync(UPLOAD_DIR, { recursive: true });
  const name = `${prefix}-${Date.now()}-${randomBytes(6).toString('hex')}.${ext}`;
  writeFileSync(path.join(UPLOAD_DIR, name), buf);
  return `/uploads/${name}`;
}
