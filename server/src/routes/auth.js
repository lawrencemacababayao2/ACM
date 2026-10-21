import { Router } from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import { pool } from '../config/db.js';
import { sign, verify, auth, ADMIN_ROLES } from '../middleware/auth.js';
import { wrap, HttpError } from '../lib/utils.js';
import {
  validateMobile, issueOtp, verifyOtp, resendWaitSeconds, hasVerifiedOtp, normalizeMobile,
  RESEND_COOLDOWN_SECONDS,
} from '../services/otp.js';
import { checkBeneficiaryDuplicates, checkBeneficiaryDuplicateFields, duplicateConflict } from '../services/duplicates.js';
import { passwordProblem, passwordMatchReason } from '../lib/password.js';
import { formatName, sanitizeName } from '../lib/name.js';
import rateLimits from '../config/rateLimits.js';
import {
  otpSendLimiters,
  loginLimiter,
  loginDelay,
  recordLoginFailure,
  consumeDailyBudget,
  forgotRequestLimiter,
} from '../middleware/rateLimit.js';
import { requireTurnstile } from '../middleware/turnstile.js';
import { getSmsCredits } from '../services/sms.js';
import { saveDataUrlImage } from '../lib/dataUrlImage.js';

const router = Router();

// An RSBSA number is 15 digits: region (2) + province (2) + municipality (2) +
// barangay (3) + individual/record (6), e.g. 10-43-19-002-000034. Mirrors
// RSBSA_TOTAL_DIGITS in mobile/src/data/rsbsa.js.
const RSBSA_TOTAL_DIGITS = 15;

const OTP_MESSAGES = {
  mobile_required: 'Mobile number is required',
  mobile_invalid: 'Please enter a valid Philippine mobile number (09XXXXXXXXX)',
  otp_missing: 'Please request a verification code first',
  otp_already_used: 'This code was already used. Please request a new one',
  otp_superseded: 'This code is no longer valid. Please request a new one',
  otp_expired: 'This code has expired. Please request a new one',
  otp_locked: 'Too many incorrect attempts. Please request a new code',
  otp_invalid: 'Incorrect verification code',
};

function toSafeUser(row) {
  return {
    id: row.id,
    email: row.email,
    mobile_number: row.mobile_number || null,
    first_name: row.first_name || null,
    middle_name: row.middle_name || null,
    last_name: row.last_name || null,
    role: row.role,
    is_active: row.is_active == null ? 1 : Number(row.is_active),
    profile_pic: row.profile_pic || null,
    created_at: row.created_at || null,
    last_active_at: row.last_active_at || null,
    preferences: {
      push_notifications: row.push_notifications == null ? 1 : Number(row.push_notifications),
      sms_notifications: row.sms_notifications == null ? 1 : Number(row.sms_notifications),
      language: row.language || 'en',
    },
  };
}

async function findBeneficiaryByUserId(userId) {
  const [rows] = await pool.query(
    'SELECT id, first_name, middle_name, suffix, last_name, gender, birthday, ' +
    'contact_number, province, barangay, purok, beneficiary_type, rsbsa_number, fishr_number, ' +
    'category, status, profile_pic ' +
    'FROM beneficiaries WHERE user_id = ? LIMIT 1',
    [userId]
  );
  return rows[0] || null;
}

// POST /api/auth/login  - accepts an email address or a mobile number.
// loginDelay only *throttles* (it never rejects); loginLimiter is the hard stop
// for a sustained run of failures. Both are per mobile+IP so one person typing
// their own password wrong cannot lock out neighbours on the same network.
router.post('/login', loginLimiter, loginDelay, wrap(async (req, res) => {
  const { email, password, mobile } = req.body || {};
  const identifier = (mobile || email || '').trim();
  if (!identifier || !password) throw new HttpError(400, 'Please enter your account and password');

  const normalized = normalizeMobile(identifier);
  const looksLikeMobile = /^0?9\d{9}$/.test(normalized);
  const [rows] = await pool.query(
    'SELECT * FROM users WHERE ' + (looksLikeMobile ? 'mobile_number = ?' : 'email = ?') + ' LIMIT 1',
    [looksLikeMobile ? normalized : identifier.toLowerCase()]
  );
  const user = rows[0];
  if (!user || !(await bcrypt.compare(password, user.password_hash))) {
    // Count the miss so the same key's NEXT attempt is delayed.
    recordLoginFailure(req);
    throw new HttpError(401, 'Invalid account or password');
  }

  // Deactivation has to be refused here as well, not only in the auth middleware.
  // Without this a switched-off account could still mint a fresh 7-day token:
  // every `auth` route would then reject it, but the sign-in itself would have
  // succeeded and dropped the user into the portal to fail on every page.
  if (ADMIN_ROLES.includes(user.role) && !user.is_active) {
    throw new HttpError(403, 'This account has been deactivated. Please contact a Super Admin.');
  }

  const token = sign({ id: user.id, email: user.email, role: user.role, tv: user.token_version });
  const payload = { ...toSafeUser(user) };
  if (user.role === 'beneficiary') {
    payload.beneficiary = await findBeneficiaryByUserId(user.id);
    if (payload.beneficiary && payload.beneficiary.status !== 'verified') {
      throw new HttpError(403, 'Your account is pending verification by the Municipal Agriculture Office. Please wait for approval before signing in.');
    }
  }
  // Stamp activity only once the sign-in is genuinely good: the password matched,
  // the account is active, and a beneficiary cleared verification. A rejected
  // attempt must not make a dormant account look recently used. Set after the
  // checks rather than before so a throw skips it.
  await pool.query('UPDATE users SET last_active_at = NOW() WHERE id = ?', [user.id]);

  res.json({ token, user: payload });
}));

// POST /api/auth/otp/send  - issue (or resend) a 5-digit code for a +63 number.
// Three limiters stack (per-phone-minute, per-phone-hour, per-IP-hour) plus an
// optional Turnstile challenge when TURNSTILE_ENFORCE_OTP=true. The turnstile
// middleware is a no-op unless configured, so the mobile app (which cannot show
// the widget) is unaffected by default.
const otpCaptcha = rateLimits.turnstile.enforceOtp ? requireTurnstile() : [];
router.post('/otp/send', otpSendLimiters, otpCaptcha, wrap(async (req, res) => {
  const { mobile } = req.body || {};
  const check = validateMobile(mobile);
  if (check.error) throw new HttpError(400, OTP_MESSAGES[check.error]);

  // Catch an already-registered number here, on the mobile step, rather than
  // letting the registrant fill in their password only to be rejected at the
  // very end. The check is repeated in /register, which is the one that has to
  // be authoritative.
  const [existing] = await pool.query('SELECT id FROM users WHERE mobile_number = ? LIMIT 1', [check.mobile]);
  if (existing.length) {
    const message = "This mobile number is already registered. Please log in, or use Forgot password if you don't remember it.";
    throw new HttpError(409, message, { field: 'mobile', errors: [{ field: 'mobile', message }] });
  }

  const wait = await resendWaitSeconds(check.mobile);
  if (wait > 0) {
    throw new HttpError(429, `Please wait ${wait} seconds before requesting a new code`, { retryAfter: wait });
  }

  // Whole-platform daily SMS ceiling, then the provider credit floor. Both are
  // consulted only at the moment a code would actually go out, so attempts that
  // die earlier never consume the budget. getSmsCredits() returns null in LOG
  // mode (no gateway configured), which skips the floor check.
  const daily = consumeDailyBudget('otp-sms', rateLimits.otp.dailySmsCap);
  if (!daily.allowed) {
    throw new HttpError(429, 'We have reached today\'s messaging limit. Please try again tomorrow.', { retryAfter: 3600 });
  }
  const credits = await getSmsCredits();
  if (credits !== null && credits < rateLimits.otp.minSmsCredits) {
    throw new HttpError(429, 'Messaging is temporarily unavailable. Please try again later.', { retryAfter: 3600 });
  }

  const issued = await issueOtp(check.mobile);
  res.json({
    message: 'Verification code sent',
    // Only echoed when OTP_DEV_ECHO is explicitly enabled, so a demo build can
    // read the code without ever leaking it in production.
    devCode: process.env.OTP_DEV_ECHO === 'true' ? issued.code : undefined,
    expiresInMinutes: issued.ttlMinutes,
    resendAfter: issued.cooldown,
  });
}));

// POST /api/auth/otp/verify  - check the code the user typed in.
router.post('/otp/verify', wrap(async (req, res) => {
  const { mobile, code } = req.body || {};
  const check = validateMobile(mobile);
  if (check.error) throw new HttpError(400, OTP_MESSAGES[check.error]);
  if (!code || String(code).trim().length !== 5) throw new HttpError(400, 'Please enter the 5-digit code');

  const result = await verifyOtp(check.mobile, String(code).trim());
  if (!result.ok) {
    throw new HttpError(400, result.attemptsLeft != null
      ? `${OTP_MESSAGES[result.error]} (${result.attemptsLeft} attempts left)`
      : OTP_MESSAGES[result.error]);
  }
  res.json({ verified: true, mobile: check.mobile });
}));

// The password-reset flow reuses the same OTP machinery as registration but
// under its own purpose so a code issued for one flow can never verify the
// other. The OTP service keys columns on purpose, so the two flows share the
// otp_codes table without colliding.
const FORGOT_PURPOSE = 'forgot_password';

// A reset token lives 10 minutes and only the reset endpoint can spend it.
// Anything longer widens the window in which a stolen token works; anything
// shorter makes the last two steps feel like a race.
const RESET_TOKEN_TTL_MINUTES = 10;

// The endpoint must not reveal whether a mobile number has an account, so every
// request - registered or not, rate-limited or not - gets the same body back.
const GENERIC_FORGOT_MESSAGE =
  'If a matching account is found, a verification code will be sent to that mobile number.';

// Whether it may send a code for this number right now. Cooldown + per-number
// hourly budget both live inside the "registered" branch: an unregistered number
// never issues, and the generic body must not leak which one it was.
async function forgotBudgetAllows(mobile) {
  const [rows] = await pool.query(
    'SELECT COUNT(*) AS c FROM otp_codes WHERE mobile_number = ? AND purpose = ? AND created_at >= (NOW() - INTERVAL 1 HOUR)',
    [mobile, FORGOT_PURPOSE]
  );
  const hourCount = Number(rows[0].c);
  if (hourCount >= rateLimits.forgot.numberPerHour) return false;
  return (await resendWaitSeconds(mobile, FORGOT_PURPOSE)) <= 0;
}

// POST /api/auth/forgot-password/request  { mobile }
// Sends a 5-digit code to a mobile number that already has an account. Same code
// machinery as registration, different purpose, and always the same response so
// the endpoint cannot be used to probe which numbers have accounts.
// forgotRequestLimiter counts every request per IP (registered or not); the
// registered branch below adds the per-number hourly budget and the platform SMS
// ceiling, without changing what the response looks like.
router.post('/forgot-password/request', forgotRequestLimiter, wrap(async (req, res) => {
  const { mobile } = req.body || {};
  const check = validateMobile(mobile);
  if (check.error) throw new HttpError(400, OTP_MESSAGES[check.error]);

  const [existing] = await pool.query('SELECT id FROM users WHERE mobile_number = ? LIMIT 1', [check.mobile]);
  // Only send to a real account, and only when the 60s resend cooldown has
  // lapsed. Every outcome still returns the same generic body below.
  if (existing.length && (await forgotBudgetAllows(check.mobile))) {
    const daily = consumeDailyBudget('otp-sms', rateLimits.otp.dailySmsCap);
    if (daily.allowed) {
      const credits = await getSmsCredits();
      if (credits === null || credits >= rateLimits.otp.minSmsCredits) {
        // A failed send must not change the response: a 5xx here would reveal
        // that this number has an account. issueOtp already logs the reason, and
        // because it only records the code on success, no cooldown is started.
        try {
          await issueOtp(check.mobile, FORGOT_PURPOSE);
        } catch {
          // Swallowed on purpose; the generic body below is the whole answer.
        }
      }
    }
  }

  res.json({ message: GENERIC_FORGOT_MESSAGE, expiresInMinutes: 5, resendAfter: 60 });
}));

// POST /api/auth/forgot-password/verify  { mobile, code }
// Checks the code and, when right, returns a short-lived single-use reset token.
// The code is checked here (not just windowed) so the token cannot ride on a
// code that was verified ages ago inside another flow.
router.post('/forgot-password/verify', wrap(async (req, res) => {
  const { mobile, code } = req.body || {};
  const check = validateMobile(mobile);
  if (check.error) throw new HttpError(400, OTP_MESSAGES[check.error]);
  if (!code || String(code).trim().length !== 5) throw new HttpError(400, 'Please enter the 5-digit code');

  const result = await verifyOtp(check.mobile, String(code).trim(), FORGOT_PURPOSE);
  if (!result.ok) {
    throw new HttpError(400, result.attemptsLeft != null
      ? `${OTP_MESSAGES[result.error]} (${result.attemptsLeft} attempts left)`
      : OTP_MESSAGES[result.error]);
  }

  const [existing] = await pool.query('SELECT id FROM users WHERE mobile_number = ? LIMIT 1', [check.mobile]);
  if (!existing.length) throw new HttpError(404, 'No account found for this mobile number');

  const resetToken = sign(
    { sub: existing[0].id, purpose: 'forgot_password_reset' },
    { expiresIn: `${RESET_TOKEN_TTL_MINUTES}m`, jwtid: crypto.randomUUID() }
  );
  res.json({ token: resetToken, expiresInMinutes: RESET_TOKEN_TTL_MINUTES });
}));

// POST /api/auth/forgot-password/reset  { resetToken, newPassword }
// Sets a new password for the account named by a verify token. Single-use: the
// token is only accepted while that mobile still has a verified, live
// forgot-password code, and resetting consumes it. Bumping users.token_version
// invalidates every previously issued sign-in token for that account.
router.post('/forgot-password/reset', wrap(async (req, res) => {
  const { resetToken, newPassword } = req.body || {};
  if (!resetToken) throw new HttpError(400, 'Your session expired. Please start again.');

  let claims;
  try {
    claims = verify(resetToken);
  } catch {
    throw new HttpError(400, 'Your session expired. Please start again.');
  }
  if (claims.purpose !== 'forgot_password_reset') {
    throw new HttpError(400, 'Your session expired. Please start again.');
  }

  const password = String(newPassword || '');
  const passwordError = passwordProblem(password);
  if (passwordError) {
    throw new HttpError(400, passwordError, { field: 'password' });
  }

  const [users] = await pool.query('SELECT * FROM users WHERE id = ? LIMIT 1', [claims.sub]);
  const user = users[0];
  if (!user) throw new HttpError(404, 'No account found');

  // The verify token alone is not enough: it must ride on a verified, live code
  // for that number, which is what makes the reset single-use.
  if (!user.mobile_number || !(await hasVerifiedOtp(user.mobile_number, FORGOT_PURPOSE))) {
    throw new HttpError(400, 'Your session expired. Please start again.');
  }

  // Rejecting a reset that just re-uses the current password closes the "reset
  // with the same password to refresh the token_version" loophole: bumping
  // token_version (below) is only a security benefit when the password actually
  // changed.
  if (user.password_hash) {
    const same = await bcrypt.compare(password, user.password_hash);
    if (same) {
      throw new HttpError(400, 'New password must be different from your current password', { field: 'password' });
    }
  }

  const hash = await bcrypt.hash(password, 10);
  await pool.query('UPDATE users SET password_hash = ?, token_version = token_version + 1 WHERE id = ?', [hash, user.id]);
  // Consume the code so the same token can never reset the password twice.
  await pool.query(
    'UPDATE otp_codes SET superseded = 1 WHERE mobile_number = ? AND purpose = ? AND superseded = 0',
    [user.mobile_number, FORGOT_PURPOSE]
  );

  res.json({ message: 'Password updated. You can now sign in with your new password.' });
}));

// GET /api/auth/check-registration
// The mobile wizard's first step calls this before it lets the registrant move
// on, so a name or RSBSA number that already has a record is reported while the
// field is still on screen, rather than at the very end of the flow. The
// response uses the same { errors: [{ field, message }] } shape as the admin
// forms so the client can mark the exact input. Names go through the shared
// normalizer and the RSBSA number is compared as digits, the same rules the
// authoritative POST /register applies.
router.get('/check-registration', wrap(async (req, res) => {
  const first = String(req.query.first_name || '').trim();
  const last = String(req.query.last_name || '').trim();
  const middle = String(req.query.middle_name || '').trim() || null;
  const suffix = String(req.query.suffix || '').trim() || null;
  const rsbsaDigits = String(req.query.rsbsa_number || '').replace(/\D/g, '');

  if (!first || !last || !rsbsaDigits) return res.json({ errors: [] });

  const errors = await checkBeneficiaryDuplicateFields(
    { first_name: first, middle_name: middle, last_name: last, suffix, rsbsa_number: rsbsaDigits },
    { context: 'admin' }
  );
  res.json({ errors });
}));

// POST /api/auth/register  (beneficiary self-registration from the 5-step wizard)
router.post('/register', wrap(async (req, res) => {
  const {
    mobile, password, password_confirmation: passwordConfirmation,
    beneficiary_type: beneficiaryType, rsbsa_number: rsbsaNumber,
    first_name: firstName, middle_name: middleName, suffix, last_name: lastName,
    gender, birthday, province, barangay, purok,
    category, farm_location: farmLocation, area_hectares: areaHectares,
    livelihood, email, id_document: idDocument,
  } = req.body || {};

  const check = validateMobile(mobile);
  if (check.error) throw new HttpError(400, OTP_MESSAGES[check.error]);
  if (passwordConfirmation != null && password !== passwordConfirmation) {
    throw new HttpError(400, 'Passwords do not match');
  }
  // --- Names -----------------------------------------------------------------
  // The app validates these before submitting, but the API normalizes them so a
  // record saved through any client is stored capitalized. This is the deployed
  // mobile app's endpoint, so it stays lenient: disallowed characters are
  // stripped rather than rejected, and the only hard failures are an empty name
  // or one too long for the column.
  const NAME_MAX_LENGTH = 50;

  function cleanName(value, label, { required = true } = {}) {
    const sanitized = sanitizeName(value);
    if (!sanitized) {
      if (required) throw new HttpError(400, `${label} is required`);
      return null;
    }
    if (sanitized.length > NAME_MAX_LENGTH) {
      throw new HttpError(400, `Please enter a valid ${label.toLowerCase()}`);
    }
    return formatName(sanitized);
  }

  const firstNameValue = cleanName(firstName, 'First name');
  const lastNameValue = cleanName(lastName, 'Last name');
  // The middle name is optional here; the app only requires it when the
  // beneficiary has not ticked "I have no middle name".
  const middleNameValue = cleanName(middleName, 'Middle name', { required: false });

  if (!rsbsaNumber || !String(rsbsaNumber).trim()) throw new HttpError(400, 'RSBSA number is required');

  // Password rules shared with the app and the portal: at least 8 characters,
  // with a letter and a number, and a matching confirmation.
  const passwordError = passwordProblem(password);
  if (passwordError) {
    throw new HttpError(422, passwordError, {
      field: 'password',
      errors: [{ field: 'password', message: passwordError }],
    });
  }
  if (passwordMatchReason(password, passwordConfirmation) !== null) {
    const message = 'Passwords do not match.';
    throw new HttpError(422, message, {
      field: 'password_confirmation',
      errors: [{ field: 'password_confirmation', message }],
    });
  }

  // --- Step 1 profile fields (validated when supplied) -------------
  const cleanText = (v) => (v == null ? null : String(v).trim() || null);

  let genderValue = null;
  if (gender != null && String(gender).trim() !== '') {
    genderValue = String(gender).trim().toLowerCase();
    if (!['male', 'female'].includes(genderValue)) {
      throw new HttpError(400, 'Gender must be either male or female');
    }
  }

  let birthdayValue = null;
  if (birthday != null && String(birthday).trim() !== '') {
    const raw = String(birthday).trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) throw new HttpError(400, 'Birthday must be in YYYY-MM-DD format');
    const parsed = new Date(`${raw}T00:00:00Z`);
    if (Number.isNaN(parsed.getTime())) throw new HttpError(400, 'Birthday is not a valid date');
    if (parsed.getTime() > Date.now()) throw new HttpError(400, 'Birthday cannot be in the future');
    birthdayValue = raw;
  }

  const provinceValue = cleanText(province);
  const barangayValue = cleanText(barangay);
  const purokValue = cleanText(purok);

  if (barangayValue && !provinceValue) {
    throw new HttpError(400, 'Please select a province for the chosen barangay');
  }

  // --- RSBSA -----------------------------------------------------------------
  // The whole number is required: 15 digits, shown to the farmer grouped
  // 10-43-19-002-000034, which is how it appears on the RSBSA stub / DA
  // Interventions Monitoring Card. It is the "system-generated" code DA assigns
  // at RSBSA enrolment and it is never generated here. Making the registrant
  // enter every digit is deliberate friction that stops someone with no RSBSA
  // registration from filling the form for fun.
  //
  // Only this shape is checked. There is deliberately no comparison of the
  // geographic portion against the selected province/barangay and no lookup
  // against any RSBSA registry: rejecting a mismatch would block farmers whose
  // number is valid but whose location we cannot confirm, and probing a registry
  // would disclose whether a number belongs to another farmer. The MAO verifies
  // the number during verification.
  //
  // The dashes are a display aid, so they are stripped and the digits are what
  // gets stored, which also keeps the match against existing MAO records
  // consistent for a farmer who typed them with or without separators.
  const rsbsaDigits = String(rsbsaNumber).replace(/\D/g, '');
  if (!rsbsaDigits) throw new HttpError(400, 'RSBSA number is required');
  if (rsbsaDigits.length !== RSBSA_TOTAL_DIGITS) {
    throw new HttpError(400, 'Enter all 15 digits of your RSBSA number, like 10-43-19-002-000034');
  }

  // The mobile number must have been proven by a recent verified code.
  //
  // This gate sits above the RSBSA checks on purpose. A caller who has not
  // proved they own the number learns nothing about whether a given RSBSA number
  // is already claimed, so the endpoint cannot be used to probe for one.
  if (!(await hasVerifiedOtp(check.mobile))) {
    throw new HttpError(400, 'Please verify your mobile number before creating an account');
  }

  const [dupeMobile] = await pool.query('SELECT id FROM users WHERE mobile_number = ? LIMIT 1', [check.mobile]);
  if (dupeMobile.length) {
    const message = "This mobile number is already registered. Please log in, or use Forgot password if you don't remember it.";
    throw new HttpError(409, message, { field: 'mobile', errors: [{ field: 'mobile', message }] });
  }

  let normalizedEmail = null;
  if (email && String(email).trim()) {
    normalizedEmail = String(email).trim().toLowerCase();
    const [dupeEmail] = await pool.query('SELECT id FROM users WHERE email = ? LIMIT 1', [normalizedEmail]);
    if (dupeEmail.length) throw new HttpError(409, 'An account with this email already exists');
  }

  // Link to an existing MAO record when the RSBSA number matches. Compared as
  // digits, since that is how the number is stored.
  //
  // An RSBSA number identifies exactly one beneficiary, so it may only be
  // claimed once. A record that already belongs to a user (user_id is set) has
  // been claimed, and registering against it would let one number end up on two
  // accounts and silently merge two people's records. Those requests are
  // refused here.
  //
  // The refusal is deliberately the same generic message as a malformed or
  // unknown number. Saying "this number is already registered" would confirm
  // that a particular RSBSA number belongs to a real, existing farmer, which is
  // exactly the disclosure the no-lookup design exists to prevent.
  const [claimed] = await pool.query(
    'SELECT id FROM beneficiaries WHERE rsbsa_number = ? AND user_id IS NOT NULL LIMIT 1',
    [rsbsaDigits]
  );
  if (claimed.length) throw new HttpError(409, 'Please enter a valid RSBSA number.', { field: 'rsbsa_number' });

  let rsbsaMatchId = null;
  const [matches] = await pool.query(
    "SELECT id FROM beneficiaries WHERE rsbsa_number = ? AND user_id IS NULL ORDER BY id LIMIT 1",
    [rsbsaDigits]
  );
  if (matches[0]) rsbsaMatchId = matches[0].id;

  // Name and mobile duplicates. Every duplicate is a hard block now: the same
  // full normalized name (First + Middle + Last + Suffix) always refuses,
  // regardless of birthday, and a different middle name is not a duplicate at
  // all.
  //
  // The record this person is linking to is the very same beneficiary, so it is
  // excluded from the comparison - otherwise the matching name, birthday and
  // mobile would look like duplicates of the farmer themselves.
  const dup = await checkBeneficiaryDuplicates(
    {
      first_name: firstNameValue, middle_name: middleNameValue, last_name: lastNameValue,
      suffix: suffix || null, birthday: birthdayValue, mobile: check.mobile,
      barangay: barangayValue,
    },
    { context: 'register', excludeRsbsaMatchId: rsbsaMatchId }
  );
  if (dup) throw duplicateConflict(dup);

// The registrant's RSBSA ID. Required: the MAO reviews it before verifying the
// account, so a registration without one cannot be acted on. The image is saved
// to disk and only its path is stored, like the profile photo. Checked after the
// duplicate guards so a rejected registration never leaves an orphan upload.
if (!idDocument || typeof idDocument !== 'string') {
    const message = 'Please attach a photo of your RSBSA ID.';
    throw new HttpError(400, message, { field: 'id_document', errors: [{ field: 'id_document', message }] });
  }
  const idDocumentPath = saveDataUrlImage(idDocument, { prefix: 'id' });

  const hash = await bcrypt.hash(password, 10);
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [u] = await conn.query(
      "INSERT INTO users (email, mobile_number, password_hash, role) VALUES (?, ?, ?, 'beneficiary')",
      [normalizedEmail, check.mobile, hash]
    );
    const [b] = await conn.query(
      `INSERT INTO beneficiaries
        (user_id, beneficiary_type, rsbsa_number, rsbsa_match_id, first_name, middle_name, last_name,
         gender, birthday, suffix, contact_number, province, barangay, purok,
         category, farm_location, area_hectares, livelihood, id_document, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')`,
      [u.insertId,
        beneficiaryType || null, rsbsaDigits, rsbsaMatchId,
        firstNameValue, middleNameValue,
        lastNameValue, genderValue, birthdayValue, suffix || null,
       check.mobile, provinceValue, barangayValue, purokValue,
       category || 'farmer',
       farmLocation || null, areaHectares || null, livelihood || null,
       idDocumentPath]
    );
    await conn.commit();
    res.status(201).json({
      message: 'Registration submitted. Your account is pending verification by the MAO.',
      beneficiaryId: b.insertId,
      linkedToExistingRecord: Boolean(rsbsaMatchId),
    });
  } catch (err) {
    await conn.rollback();
    // Two requests for the same RSBSA number can both pass the check above if
    // they arrive together; the unique index is what actually settles it. Report
    // that as the ordinary conflict it is instead of a 500.
    if (err && err.code === 'ER_DUP_ENTRY') {
      throw new HttpError(409, 'Please enter a valid RSBSA number.', { field: 'rsbsa_number' });
    }
    throw err;
  } finally {
    conn.release();
  }
}));

// GET /api/auth/me
router.get('/me', auth, wrap(async (req, res) => {
  const [rows] = await pool.query(
    'SELECT id, email, mobile_number, first_name, middle_name, last_name, role, ' +
    'is_active, profile_pic, created_at, last_active_at, ' +
    'push_notifications, sms_notifications, language FROM users WHERE id = ? LIMIT 1',
    [req.user.id]
  );
  if (!rows[0]) throw new HttpError(404, 'Account not found');
  const payload = { ...toSafeUser(rows[0]) };
  if (rows[0].role === 'beneficiary') {
    payload.beneficiary = await findBeneficiaryByUserId(rows[0].id);
  }
  res.json(payload);
}));

export default router;