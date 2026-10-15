import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { randomBytes } from 'node:crypto';
import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pool } from '../config/db.js';
import { auth, sign } from '../middleware/auth.js';
import { wrap, HttpError } from '../lib/utils.js';
import {
  validateMobile, issueOtp, verifyOtp, resendWaitSeconds, normalizeMobile, RESEND_COOLDOWN_SECONDS,
} from '../services/otp.js';
import { checkUserDuplicates, checkBeneficiaryDuplicates } from '../services/duplicates.js';
import { passwordProblem } from '../lib/password.js';
import { sendOne, getSmsCredits } from '../services/sms.js';
import rateLimits from '../config/rateLimits.js';
import { makeLimiter, phoneKey, consumeDailyBudget } from '../middleware/rateLimit.js';

const router = Router();

// Same budget as the registration OTP flow, but keyed on the NEW number in the
// body. Both routes share the platform-wide daily SMS cap through one bucket.
const mobileChangeMinute = makeLimiter('mobile-change-minute', {
  ...rateLimits.otp.phoneMinute,
  keyGenerator: (req) => phoneKey(req, 'newMobile'),
  // Only a request that actually sent a code spends the per-number budget. If the
  // provider fails (or the password/format is wrong) the user can immediately retry.
  skipFailedRequests: true,
  message: 'Please wait before requesting another verification code.',
});
const mobileChangeHour = makeLimiter('mobile-change-hour', {
  ...rateLimits.otp.phoneHour,
  keyGenerator: (req) => phoneKey(req, 'newMobile'),
  skipFailedRequests: true,
  message: 'Too many codes requested for this number. Please try again later.',
});

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const UPLOAD_DIR = path.join(__dirname, '..', '..', 'uploads');

const MOBILE_PURPOSE = 'change_mobile';

const OTP_MESSAGES = {
  otp_missing: 'Please request a verification code first',
  otp_already_used: 'This code was already used. Please request a new one',
  otp_superseded: 'This code is no longer valid. Please request a new one',
  otp_expired: 'This code has expired. Please request a new one',
  otp_locked: 'Too many incorrect attempts. Please request a new code',
  otp_invalid: 'Incorrect verification code',
};

// Locked profile fields (name, birthday, RSBSA, etc.) can no longer be changed
// from the app: a beneficiary has to walk in to the MAO instead.
async function beneficiaryForUser(userId) {
  const [rows] = await pool.query('SELECT * FROM beneficiaries WHERE user_id = ? LIMIT 1', [userId]);
  return rows[0] || null;
}

async function loadUser(userId) {
  const [rows] = await pool.query('SELECT * FROM users WHERE id = ? LIMIT 1', [userId]);
  return rows[0] || null;
}

// Saves a base64 image to the uploads directory and returns its public URL. A
// profile photo is small, so it bypasses the staff-only /uploads route.
function saveDataUrlImage(dataUrl) {
  const m = String(dataUrl || '').match(/^data:image\/(png|jpe?g|webp);base64,(.+)$/i);
  if (!m) throw new HttpError(400, 'Invalid image data (PNG/JPG/WebP only)');
  const ext = m[1].toLowerCase() === 'jpeg' ? 'jpg' : m[1].toLowerCase();
  const buf = Buffer.from(m[2], 'base64');
  if (buf.length === 0) throw new HttpError(400, 'Empty image');
  if (buf.length > 5 * 1024 * 1024) throw new HttpError(400, 'Image too large (max 5 MB)');
  if (!existsSync(UPLOAD_DIR)) mkdirSync(UPLOAD_DIR, { recursive: true });
  const name = `profile-${Date.now()}-${randomBytes(6).toString('hex')}.${ext}`;
  writeFileSync(path.join(UPLOAD_DIR, name), buf);
  return `/uploads/${name}`;
}

// PATCH /api/me/photo  — the farmer's own profile picture.
router.patch('/photo', auth, wrap(async (req, res) => {
  const ben = await beneficiaryForUser(req.user.id);
  if (!ben) throw new HttpError(404, 'Beneficiary profile not found');
  const { dataUrl, remove } = req.body || {};
  if (remove || dataUrl === null) {
    await pool.query('UPDATE beneficiaries SET profile_pic = NULL WHERE id = ?', [ben.id]);
    return res.json({ ok: true, profile_pic: null });
  }
  if (!dataUrl) throw new HttpError(400, 'Image data is required');
  const url = saveDataUrlImage(dataUrl);
  await pool.query('UPDATE beneficiaries SET profile_pic = ? WHERE id = ?', [url, ben.id]);
  res.json({ ok: true, profile_pic: url });
}));

// PATCH /api/me/preferences  — notification + language preferences.
router.patch('/preferences', auth, wrap(async (req, res) => {
  const { push_notifications, sms_notifications, language } = req.body || {};
  const sets = [];
  const params = [];
  if (push_notifications !== undefined) { sets.push('push_notifications = ?'); params.push(push_notifications ? 1 : 0); }
  if (sms_notifications !== undefined) { sets.push('sms_notifications = ?'); params.push(sms_notifications ? 1 : 0); }
  if (language !== undefined) {
    if (!['en', 'bis'].includes(language)) throw new HttpError(400, 'Unsupported language', { field: 'language' });
    sets.push('language = ?'); params.push(language);
  }
  if (!sets.length) throw new HttpError(400, 'No preferences to update');
  params.push(req.user.id);
  await pool.query(`UPDATE users SET ${sets.join(', ')} WHERE id = ?`, params);
  const [rows] = await pool.query(
    'SELECT push_notifications, sms_notifications, language FROM users WHERE id = ? LIMIT 1',
    [req.user.id]
  );
  res.json(rows[0] || {});
}));

// POST /api/me/mobile/request-change  — validate the password, then text a code
// to the NEW number. Nothing changes until that code is verified.
// Per-number limits (mobileChangeMinute/Hour) sit on this route because the OTP
// goes to the NEW number, which no broader budget covers.
router.post('/mobile/request-change', auth, mobileChangeMinute, mobileChangeHour, wrap(async (req, res) => {
  const ben = await beneficiaryForUser(req.user.id);
  if (!ben) throw new HttpError(404, 'Beneficiary profile not found');

  const user = await loadUser(req.user.id);
  const { currentPassword, newMobile } = req.body || {};

  if (!currentPassword) throw new HttpError(400, 'Please enter your current password', { field: 'currentPassword' });
  if (!user || !(await bcrypt.compare(String(currentPassword), user.password_hash))) {
    throw new HttpError(400, 'Your current password is incorrect', { field: 'currentPassword' });
  }

  const valid = validateMobile(newMobile);
  if (valid.error) throw new HttpError(400, 'Please enter a valid Philippine mobile number (09XXXXXXXXX)', { field: 'newMobile' });

  if (user.mobile_number && normalizeMobile(user.mobile_number) === valid.mobile) {
    throw new HttpError(400, 'That is already your current mobile number', { field: 'newMobile' });
  }

  const dup = await checkUserDuplicates({ mobile_number: valid.mobile }, { excludeId: user.id });
  if (dup) throw new HttpError(409, dup.message, { field: 'newMobile' });

  const wait = await resendWaitSeconds(valid.mobile, MOBILE_PURPOSE);
  if (wait > 0) throw new HttpError(429, `Please wait ${wait} seconds before requesting another code`, { retryAfterSeconds: wait });

  // Platform daily SMS ceiling + credit floor, shared with the registration OTP.
  const daily = consumeDailyBudget('otp-sms', rateLimits.otp.dailySmsCap);
  if (!daily.allowed) {
    throw new HttpError(429, 'We have reached today\'s messaging limit. Please try again tomorrow.', { retryAfter: 3600 });
  }
  const credits = await getSmsCredits();
  if (credits !== null && credits < rateLimits.otp.minSmsCredits) {
    throw new HttpError(429, 'Messaging is temporarily unavailable. Please try again later.', { retryAfter: 3600 });
  }

  await issueOtp(valid.mobile, MOBILE_PURPOSE);
  res.json({ ok: true, resendAfter: RESEND_COOLDOWN_SECONDS, mobile: valid.mobile });
}));

// POST /api/me/mobile/verify-change  — confirm the code and move the account.
router.post('/mobile/verify-change', auth, wrap(async (req, res) => {
  const ben = await beneficiaryForUser(req.user.id);
  if (!ben) throw new HttpError(404, 'Beneficiary profile not found');

  const user = await loadUser(req.user.id);
  const { currentPassword, newMobile, code } = req.body || {};

  if (!currentPassword) throw new HttpError(400, 'Please enter your current password', { field: 'currentPassword' });
  if (!user || !(await bcrypt.compare(String(currentPassword), user.password_hash))) {
    throw new HttpError(400, 'Your current password is incorrect', { field: 'currentPassword' });
  }

  const valid = validateMobile(newMobile);
  if (valid.error) throw new HttpError(400, 'Please enter a valid Philippine mobile number (09XXXXXXXXX)', { field: 'newMobile' });

  const dup = await checkUserDuplicates({ mobile_number: valid.mobile }, { excludeId: user.id });
  if (dup) throw new HttpError(409, 'This mobile number is already registered.', { field: 'newMobile' });

  const check = await verifyOtp(valid.mobile, code, MOBILE_PURPOSE);
  if (!check.ok) throw new HttpError(400, OTP_MESSAGES[check.error] || 'Incorrect verification code', { field: 'code' });

  const oldMobile = user.mobile_number;
  await pool.query(
    'UPDATE users SET mobile_number = ?, mobile_normalized = ? WHERE id = ?',
    [valid.mobile, valid.mobile, user.id]
  );
  await pool.query('UPDATE beneficiaries SET contact_number = ? WHERE id = ?', [valid.mobile, ben.id]);

  // Tell the OLD number the change happened, so the previous owner notices if it
  // was not them.
  if (oldMobile) {
    const oldPretty = '+63' + normalizeMobile(oldMobile).slice(1);
    const newPretty = '+63' + valid.mobile.slice(1);
    await sendOne({
      phone: oldPretty,
      beneficiaryId: ben.id,
      subject: 'ACM: Mobile Number Changed',
      subjectBis: 'ACM: Nabag-o ang Numero',
      message: `Your AgriConnect mobile number was changed to ${newPretty}. If this was not you, contact the MAO immediately.`,
      messageBis: `Ang imong mobile number sa AgriConnect gibag-o ngadto sa ${newPretty}. Kung dili ikaw ang nagbag-o, kontaka dayon ang MAO.`,
      notificationType: 'request_status',
    });
  }

  res.json({ ok: true, mobile_number: valid.mobile, beneficiary: { contact_number: valid.mobile } });
}));

// POST /api/me/password  — change the password, keep this session, drop the rest.
router.post('/password', auth, wrap(async (req, res) => {
  const { currentPassword, newPassword, newPassword_confirmation } = req.body || {};
  const user = await loadUser(req.user.id);
  if (!user) throw new HttpError(404, 'Account not found');

  if (!currentPassword) throw new HttpError(400, 'Please enter your current password', { field: 'currentPassword' });
  if (!(await bcrypt.compare(String(currentPassword), user.password_hash))) {
    throw new HttpError(400, 'Your current password is incorrect', { field: 'currentPassword' });
  }

  const password = String(newPassword || '');
  const passwordError = passwordProblem(password);
  if (passwordError) {
    throw new HttpError(400, passwordError, { field: 'newPassword' });
  }
  if (newPassword_confirmation !== undefined && password !== String(newPassword_confirmation)) {
    throw new HttpError(400, 'Passwords do not match', { field: 'newPassword_confirmation' });
  }
  if (await bcrypt.compare(password, user.password_hash)) {
    throw new HttpError(400, 'New password must be different from your current password', { field: 'newPassword' });
  }

  const hash = await bcrypt.hash(password, 10);
  await pool.query('UPDATE users SET password_hash = ?, token_version = token_version + 1 WHERE id = ?', [hash, user.id]);

  // Every other session's token now fails the version check; this one is handed a
  // freshly signed token carrying the new version so the farmer stays signed in.
  const nextVersion = user.token_version + 1;
  const token = sign({ id: user.id, email: user.email, role: user.role, tv: nextVersion });
  res.json({ ok: true, token });
}));

export default router;
