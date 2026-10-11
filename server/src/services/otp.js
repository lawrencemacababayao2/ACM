import crypto from 'node:crypto';
import { pool } from '../config/db.js';
import { sendOne } from './sms.js';

const OTP_LENGTH = 5;
const OTP_TTL_MINUTES = 5;
export const RESEND_COOLDOWN_SECONDS = 60;
const MAX_ATTEMPTS = 5;

// Codes are hashed at rest so a dump of otp_codes never leaks a live code. The
// hash is one-way and the code is short-lived (5 minutes), so SHA-256 over a
// per-code salt is plenty; bcrypt's work factor would buy nothing here.
function hashCode(code) {
  return crypto.createHash('sha256').update(`acm-otp:${code}`).digest('hex');
}

function randomDigits(n) {
  // crypto.randomInt is uniform, so the code can safely start with 0.
  let out = '';
  for (let i = 0; i < n; i++) out += crypto.randomInt(0, 10);
  return out;
}

// Accepts 09xxxxxxxxx / 9xxxxxxxxx / +639xxxxxxxxx and returns 639xxxxxxxxx.
export function normalizeMobile(raw = '') {
  let p = String(raw).replace(/[^0-9+]/g, '');
  if (p.startsWith('+63')) p = '0' + p.slice(3);
  else if (p.startsWith('63')) p = '0' + p.slice(2);
  if (!p.startsWith('0')) p = '0' + p;
  return p;
}

// Returns null when valid, otherwise a message key describing the problem.
export function validateMobile(raw = '') {
  const digits = String(raw || '').replace(/[^0-9]/g, '');
  if (!digits) return { error: 'mobile_required' };
  // 09 followed by 9 digits = 11 digits total.
  if (!/^09\d{9}$/.test(String(raw).replace(/[^0-9]/g, '')) && !/^\+?639\d{9}$/.test(String(raw).replace(/[^0-9+]/g, ''))) {
    return { error: 'mobile_invalid' };
  }
  return { error: null, mobile: normalizeMobile(raw) };
}

// Seconds the caller must wait before requesting another code.
export async function resendWaitSeconds(mobile, purpose = 'register') {
  const [rows] = await pool.query(
    'SELECT created_at FROM otp_codes WHERE mobile_number = ? AND purpose = ? ORDER BY id DESC LIMIT 1',
    [mobile, purpose]
  );
  if (!rows[0]) return 0;
  const elapsed = Math.floor((Date.now() - new Date(rows[0].created_at).getTime()) / 1000);
  return Math.max(0, RESEND_COOLDOWN_SECONDS - elapsed);
}

// Issues a fresh code, invalidating any earlier unverified ones for that number.
export async function issueOtp(mobile, purpose = 'register') {
  const code = randomDigits(OTP_LENGTH);
  const expiresAt = new Date(Date.now() + OTP_TTL_MINUTES * 60 * 1000);

  // Mark older codes as superseded instead of "verified": an old code must
  // never be able to satisfy the register-time ownership check.
  await pool.query(
    'UPDATE otp_codes SET superseded = 1 WHERE mobile_number = ? AND purpose = ? AND superseded = 0',
    [mobile, purpose]
  );
  await pool.query(
    'INSERT INTO otp_codes (mobile_number, code, purpose, expires_at) VALUES (?, ?, ?, ?)',
    [mobile, hashCode(code), purpose, expiresAt]
  );

  const pretty = '+63' + mobile.slice(1);
  const minutes = OTP_TTL_MINUTES;
  // Delivered over the same SMS gateway the rest of the app uses. With no
  // credentials the service runs in LOG mode and prints the code instead.
  await sendOne({
    phone: pretty,
    subject: 'AgriConnect Medina verification code',
    subjectBis: 'AgriConnect Medina verification code',
    message: `Your AgriConnect Medina verification code is ${code}. It expires in ${minutes} minutes. Do not share this code with anyone.`,
    messageBis: `Ang imong AgriConnect Medina verification code mao ang ${code}. Mapamatay human sa ${minutes} minuto. Ayaw i-share ni nga code sa bisan kinsa.`,
    notificationType: 'announcement',
  });

  return { code, expiresAt, ttlMinutes: OTP_TTL_MINUTES, cooldown: RESEND_COOLDOWN_SECONDS };
}

// Checks a submitted code. Returns { ok, error } with error being a message key.
export async function verifyOtp(mobile, code, purpose = 'register') {
  const [rows] = await pool.query(
    'SELECT * FROM otp_codes WHERE mobile_number = ? AND purpose = ? ORDER BY id DESC LIMIT 1',
    [mobile, purpose]
  );
  const row = rows[0];
  if (!row) return { ok: false, error: 'otp_missing' };
  if (row.superseded) return { ok: false, error: 'otp_superseded' };
  if (row.verified_at) return { ok: false, error: 'otp_already_used' };
  if (new Date(row.expires_at).getTime() < Date.now()) return { ok: false, error: 'otp_expired' };
  if (row.attempts >= MAX_ATTEMPTS) return { ok: false, error: 'otp_locked' };
  if (String(row.code) !== hashCode(String(code).trim())) {
    await pool.query('UPDATE otp_codes SET attempts = attempts + 1 WHERE id = ?', [row.id]);
    const left = Math.max(0, MAX_ATTEMPTS - (row.attempts + 1));
    return { ok: false, error: 'otp_invalid', attemptsLeft: left };
  }
  await pool.query('UPDATE otp_codes SET verified_at = NOW() WHERE id = ?', [row.id]);
  return { ok: true };
}

// True when a verified code for this number is still inside the registration
// window, which is what lets /register trust the mobile number.
export async function hasVerifiedOtp(mobile, purpose = 'register', windowMinutes = 30) {
  const since = new Date(Date.now() - windowMinutes * 60 * 1000);
  // Only a live (non-superseded) code proves ownership of the number.
  const [rows] = await pool.query(
    'SELECT id FROM otp_codes WHERE mobile_number = ? AND purpose = ? AND superseded = 0 AND verified_at IS NOT NULL AND verified_at >= ? LIMIT 1',
    [mobile, purpose, since]
  );
  return rows.length > 0;
}

export async function purgeOldOtps() {
  await pool.query('DELETE FROM otp_codes WHERE created_at < (NOW() - INTERVAL 1 DAY)');
}
