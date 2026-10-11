import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { pool } from '../config/db.js';
import { auth, adminOnly } from '../middleware/auth.js';
import { idempotent } from '../middleware/idempotency.js';
import { wrap, HttpError } from '../lib/utils.js';
import { getLocationOptions } from '../data/locations.js';
import { validateMobile } from '../services/otp.js';
import { checkBeneficiaryDuplicateFields, checkUserDuplicates, duplicateErrors } from '../services/duplicates.js';
import { passwordProblem, passwordMatchReason } from '../lib/password.js';

// Mirrors the messages used by POST /api/auth/register for the same two failures,
// so a bad number reads identically whichever way it was submitted.
const MOBILE_ERRORS = {
  mobile_required: 'Mobile number is required',
  mobile_invalid: 'Please enter a valid Philippine mobile number (09XXXXXXXXX)',
};

const router = Router();

// A date filter only accepts a plain YYYY-MM-DD. Anything else is ignored rather
// than passed through, so a malformed value cannot widen the result set.
const isIsoDate = (value) => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);

// `mobile_number` comes from the account the beneficiary registered with, which
// is the value the MAO verified by OTP. `b.contact_number` holds the same number
// and stays selected as a fallback because MAO-created records have no account
// row yet.
const SELECT = `
  SELECT b.*,
         u.email AS email,
         u.role AS role,
         COALESCE(u.mobile_number, b.contact_number) AS mobile_number
  FROM beneficiaries b
  LEFT JOIN users u ON u.id = b.user_id`;

// GET /api/beneficiaries?status=&q=&category=&beneficiary_type=&barangay=&gender=
router.get('/', auth, adminOnly, wrap(async (req, res) => {
  const {
    status, category, q, beneficiary_type: beneficiaryType, barangay, gender, from, to,
  } = req.query;
  const where = [];
  const params = [];
  if (status) { where.push('b.status = ?'); params.push(status); }
  if (category) { where.push('b.category = ?'); params.push(category); }
  // Records created before `beneficiary_type` existed only carry the legacy
  // `category` column, so a type filter has to match either one.
  if (beneficiaryType) {
    where.push('(b.beneficiary_type = ? OR b.category = ?)');
    params.push(beneficiaryType, beneficiaryType);
  }
  if (barangay) { where.push('b.barangay = ?'); params.push(barangay); }
  if (gender) { where.push('b.gender = ?'); params.push(gender); }
  // Registered-date range. `created_at` is a DATETIME, so the upper bound is
  // widened to the end of the chosen day; without that, `to` would silently drop
  // every record registered after midnight on that date.
  if (isIsoDate(from)) { where.push('b.created_at >= ?'); params.push(`${from} 00:00:00`); }
  if (isIsoDate(to)) { where.push('b.created_at <= ?'); params.push(`${to} 23:59:59`); }
  if (q) {
    // Strip non-digits for RSBSA search so "10-43-19" matches "104319..."
    const qDigits = q.replace(/\D/g, '');
    const like = `%${q}%`;
    const likeDigits = qDigits ? `%${qDigits}%` : like;
    // Barangay is deliberately absent: it has a dedicated filter, so searching it
    // here would only ever duplicate that control. A purely numeric query is
    // treated as a beneficiary ID lookup instead of being matched against names.
    where.push(`(b.first_name LIKE ? OR b.middle_name LIKE ? OR b.last_name LIKE ?
      OR b.contact_number LIKE ? OR COALESCE(u.mobile_number, b.contact_number) LIKE ?
      OR b.rsbsa_number LIKE ?${/^\d+$/.test(q) ? ' OR b.id = ?' : ''})`);
    params.push(like, like, like, like, like, likeDigits);
    if (/^\d+$/.test(q)) params.push(Number(q));
  }
  const sql = `${SELECT} ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY b.created_at DESC, b.id DESC`;
  const [rows] = await pool.query(sql, params);
  res.json(rows);
}));

// GET /api/beneficiaries/location-data - province/barangay/purok options for the
// admin forms, mirroring the registration wizard's dependency chain.
// Must be defined BEFORE the /:id route to avoid being caught by the parameterized route.
router.get('/location-data', auth, adminOnly, wrap(async (req, res) => {
  res.json(getLocationOptions());
}));

// GET /api/beneficiaries/stats  - per-status totals for the tab bar.
// Counted in SQL so the tab counts stay right without pulling every record into
// the browser, and it honours the same non-status filters the table applies.
router.get('/stats', auth, adminOnly, wrap(async (req, res) => {
  const {
    category, beneficiary_type: beneficiaryType, barangay, gender, q, from, to,
  } = req.query;
  const where = [];
  const params = [];

  if (category) { where.push('b.category = ?'); params.push(category); }
  if (beneficiaryType) {
    where.push('(b.beneficiary_type = ? OR b.category = ?)');
    params.push(beneficiaryType, beneficiaryType);
  }
  if (barangay) { where.push('b.barangay = ?'); params.push(barangay); }
  if (gender) { where.push('b.gender = ?'); params.push(gender); }
  if (isIsoDate(from)) { where.push('b.created_at >= ?'); params.push(`${from} 00:00:00`); }
  if (isIsoDate(to)) { where.push('b.created_at <= ?'); params.push(`${to} 23:59:59`); }
  if (q) {
    const qDigits = q.replace(/\D/g, '');
    const like = `%${q}%`;
    const likeDigits = qDigits ? `%${qDigits}%` : like;
    where.push(`(b.first_name LIKE ? OR b.middle_name LIKE ? OR b.last_name LIKE ?
      OR b.contact_number LIKE ? OR COALESCE(u.mobile_number, b.contact_number) LIKE ?
      OR b.rsbsa_number LIKE ?${/^\d+$/.test(q) ? ' OR b.id = ?' : ''})`);
    params.push(like, like, like, like, like, likeDigits);
    if (/^\d+$/.test(q)) params.push(Number(q));
  }

  const sql = `SELECT b.status, COUNT(*) AS total
    FROM beneficiaries b
    LEFT JOIN users u ON u.id = b.user_id
    ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
    GROUP BY b.status`;

  const [rows] = await pool.query(sql, params);
  const counts = { all: 0, pending: 0, verified: 0, rejected: 0 };
  for (const row of rows) {
    const key = row.status in counts ? row.status : 'pending';
    counts[key] = Number(row.total);
    counts.all += Number(row.total);
  }
  res.json(counts);
}));

// GET /api/beneficiaries/check-duplicate - live inline duplicate preview for the
// admin forms. Performs the same checks the create/edit handlers enforce and
// returns { errors: [{ field, message }] }, so the form can mark each conflicting
// input instead of showing one banner.
router.get('/check-duplicate', auth, adminOnly, wrap(async (req, res) => {
  const { excludeId, ...values } = req.query;
  const errors = await checkBeneficiaryDuplicateFields(values, { excludeId });
  res.json({ errors });
}));

// GET /api/beneficiaries/:id
router.get('/:id', auth, adminOnly, wrap(async (req, res) => {
  const [rows] = await pool.query(`${SELECT} WHERE b.id = ?`, [req.params.id]);
  if (!rows[0]) throw new HttpError(404, 'Beneficiary not found');
  res.json(rows[0]);
}));

// PUT /api/beneficiaries/profile-pic  — beneficiary sets/updates their own profile picture
router.put('/profile-pic', auth, wrap(async (req, res) => {
  const { dataUrl } = req.body || {};
  if (!dataUrl || typeof dataUrl !== 'string') throw new HttpError(400, 'Image data is required');
  const m = dataUrl.match(/^data:image\/(png|jpe?g|webp);base64,(.+)$/i);
  if (!m) throw new HttpError(400, 'Invalid image data (PNG/JPG/WebP only)');
  const buf = Buffer.from(m[2], 'base64');
  if (buf.length === 0) throw new HttpError(400, 'Empty image');
  if (buf.length > 4 * 1024 * 1024) throw new HttpError(400, 'Image too large (max 4 MB)');

  const [ben] = await pool.query('SELECT id FROM beneficiaries WHERE user_id = ? LIMIT 1', [req.user.id]);
  if (!ben[0]) throw new HttpError(404, 'Beneficiary profile not found');
  await pool.query('UPDATE beneficiaries SET profile_pic = ? WHERE id = ?', [dataUrl, ben[0].id]);
  res.json({ ok: true });
}));

// POST /api/beneficiaries  (MAO manually adds a record)
//
// This applies the same rules as PUT below, so a record added here cannot differ
// from one that was edited. It creates no account by default: beneficiaries sign
// in with the mobile number they register with, and an MAO-entered record simply
// has none until they do. When a `password` is supplied it pre-creates the
// account (role beneficiary, mobile = contact number) so the farmer can sign in
// to the mobile app straight away.
router.post('/', auth, adminOnly, idempotent(), wrap(async (req, res) => {
  const {
    beneficiary_type: beneficiaryType, rsbsa_number: rsbsaNumber,
    first_name: firstName, middle_name: middleName, suffix, last_name: lastName,
    gender, birthday,
    province, barangay, purok,
    contact_number: contactNumber,
    category, farm_location: farmLocation, area_hectares: areaHectares,
    livelihood, status, password, password_confirmation: passwordConfirmation,
  } = req.body || {};

  if (!firstName || !lastName || !contactNumber || !barangay) {
    throw new HttpError(400, 'Please fill in all required fields');
  }
  if (!beneficiaryType) {
    throw new HttpError(400, 'Please select a beneficiary type', { field: 'beneficiary_type' });
  }

  // Validate names
  const NAME_MIN_LENGTH = 2;
  const NAME_ALLOWED = /^[\p{L}\p{M}'.\- ]+$/u;
  const HAS_LETTER = /\p{L}/u;

  function cleanName(value, label) {
    const v = String(value ?? '').trim().replace(/\s+/g, ' ');
    if (!v) throw new HttpError(400, `${label} is required`);
    if (v.length < NAME_MIN_LENGTH || !NAME_ALLOWED.test(v) || !HAS_LETTER.test(v)) {
      throw new HttpError(400, `Please enter a valid ${label.toLowerCase()}`);
    }
    return v;
  }

  const firstNameValue = cleanName(firstName, 'First name', 'first_name');
  const lastNameValue = cleanName(lastName, 'Last name', 'last_name');
  const middleNameValue = middleName && String(middleName).trim()
    ? cleanName(middleName, 'Middle name', 'middle_name')
    : null;

  // Validate suffix
  const SUFFIXES = ['', 'Jr.', 'Sr.', 'I', 'II', 'III', 'IV'];
  const suffixValue = suffix && String(suffix).trim()
    ? (SUFFIXES.includes(String(suffix).trim()) ? String(suffix).trim() : (() => { throw new HttpError(400, 'Please select a valid suffix'); })())
    : '';

  // Validate gender
  let genderValue = null;
  if (gender && String(gender).trim()) {
    genderValue = String(gender).trim().toLowerCase();
    if (!['male', 'female'].includes(genderValue)) {
      throw new HttpError(400, 'Gender must be either male or female');
    }
  }

  // Validate birthday - the registration form requires one, so a new record
  // must have one too.
  const birthdayValue = cleanBirthday(birthday);
  if (!birthdayValue) {
    throw new HttpError(400, 'Please enter a valid birthday', { field: 'birthday' });
  }

  // Validate location hierarchy
  const provinceValue = province ? String(province).trim() : null;
  const barangayValue = barangay ? String(barangay).trim() : null;
  const purokValue = purok ? String(purok).trim() : null;

  // Same location check as PUT, so Add and Edit refuse the same pairings.
  checkLocation(provinceValue, barangayValue, purokValue, ['province', 'barangay', 'purok']);

  // Validate RSBSA - digits only, 15 digits. Uniqueness is enforced by the
  // shared duplicate check below, which covers records with and without an
  // account.
  let rsbsaDigits = null;
  if (rsbsaNumber && String(rsbsaNumber).trim()) {
    rsbsaDigits = String(rsbsaNumber).replace(/\D/g, '');
    if (rsbsaDigits.length !== 15) {
      throw new HttpError(400, 'RSBSA number must be exactly 15 digits', { field: 'rsbsa_number' });
    }
  }

  // Shared duplicate rules (RSBSA, mobile, full normalized name). Every
  // duplicate is a hard block and always refuses the save. Every conflicting
  // field is collected so the form can mark each one.
  const duplicateMatches = await checkBeneficiaryDuplicateFields(
    {
      first_name: firstNameValue, middle_name: middleNameValue, last_name: lastNameValue,
      suffix: suffixValue, birthday: birthdayValue, rsbsa_number: rsbsaDigits,
      mobile_number: contactNumber, barangay: barangayValue,
    },
    { context: 'admin' }
  );
  if (duplicateMatches.length) throw duplicateErrors(duplicateMatches);

  // A password is required here: the MAO creates the farmer's app account in the
  // same step, so every record made in the portal can sign in immediately. The
  // rules mirror mobile/src/validation.js and web/src/lib/password.js.
  const passwordRaw = password == null ? '' : String(password);
  const passwordError = passwordProblem(passwordRaw);
  if (passwordError) {
    throw new HttpError(422, passwordError, {
      field: 'password',
      errors: [{ field: 'password', message: passwordError }],
    });
  }
  if (passwordMatchReason(passwordRaw, passwordConfirmation) !== null) {
    const message = 'Passwords do not match.';
    throw new HttpError(422, message, {
      field: 'password_confirmation',
      errors: [{ field: 'password_confirmation', message }],
    });
  }

  // The mobile number is the account's login name, so it must be a valid
  // Philippine number and no other account may own it.
  const num = validateMobile(contactNumber);
  if (num.error) throw new HttpError(400, MOBILE_ERRORS[num.error], { field: 'mobile_number' });
  const [taken] = await pool.query('SELECT id FROM users WHERE mobile_number = ? LIMIT 1', [num.mobile]);
  if (taken.length) {
    const message = 'This mobile number is already in use.';
    throw new HttpError(409, message, {
      field: 'mobile_number',
      errors: [{ field: 'mobile_number', message }],
    });
  }
  const passwordHash = await bcrypt.hash(passwordRaw, 10);

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [b] = await conn.query(
      `INSERT INTO beneficiaries
        (user_id, beneficiary_type, rsbsa_number, first_name, middle_name, suffix, last_name,
         gender, birthday, contact_number, province, barangay, purok,
         category, farm_location, area_hectares, livelihood, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [null, beneficiaryType, rsbsaDigits,
       firstNameValue, middleNameValue, suffixValue, lastNameValue,
       genderValue, birthdayValue, contactNumber.trim(),
       provinceValue, barangayValue, purokValue,
       category || beneficiaryType, farmLocation || null, areaHectares || null, livelihood || null, status || 'pending']
    );
    // The account is created in the same transaction as the record, so a farmer
    // can sign in to the app straight away. is_active is set explicitly so an
    // office-created account is never left waiting for mobile verification.
    const mobile = validateMobile(contactNumber).mobile;
    const [u] = await conn.query(
      "INSERT INTO users (email, mobile_number, password_hash, role, is_active) VALUES (NULL, ?, ?, 'beneficiary', 1)",
      [mobile, passwordHash]
    );
    const accountId = u.insertId;
    await conn.query('UPDATE beneficiaries SET user_id = ? WHERE id = ?', [accountId, b.insertId]);
    await conn.commit();
    res.status(201).json({ id: b.insertId, accountId });
  } catch (err) {
    await conn.rollback();
    // Two requests for the same mobile can both pass the check above; the unique
    // index is what actually settles it, so report it as the conflict it is.
    if (err && err.code === 'ER_DUP_ENTRY') {
      const message = 'This mobile number is already in use.';
      throw new HttpError(409, message, {
        field: 'mobile_number',
        errors: [{ field: 'mobile_number', message }],
      });
    }
    throw err;
  } finally {
    conn.release();
  }
}));

// PUT /api/beneficiaries/:id  (edit profile and/or change verification status)
// Partial update: only fields present in the request body are changed.
//
// `mobile_number` is the canonical contact field and is written to both
// `beneficiaries.contact_number` (still read by requests.js and notifications.js
// for SMS) and, when the record belongs to an account, `users.mobile_number`.
// It is deliberately not part of FIELDS so the two columns can never be given
// different values.
const FIELDS = {
  beneficiary_type: 'text',
  rsbsa_number: 'rsbsa',
  first_name: 'name', last_name: 'name', middle_name: 'name_middle',
  suffix: 'suffix',
  gender: 'gender',
  birthday: 'birthday',
  province: 'text', barangay: 'text', purok: 'text',
  category: 'text',
  farm_location: 'nullable', area_hectares: 'nullable', livelihood: 'nullable', status: 'text',
};

const SUFFIXES = ['', 'Jr.', 'Sr.', 'I', 'II', 'III', 'IV'];
const NAME_MIN_LENGTH = 2;
const NAME_ALLOWED = /^[\p{L}\p{M}'.\- ]+$/u;
const HAS_LETTER = /\p{L}/u;
const BENEFICIARY_TYPES = ['farmer', 'fisherfolk', 'livestock_owner'];

function cleanName(value, label, field) {
  const v = String(value ?? '').trim().replace(/\s+/g, ' ');
  if (!v) throw new HttpError(400, `${label} is required`, { field });
  if (v.length < NAME_MIN_LENGTH || !NAME_ALLOWED.test(v) || !HAS_LETTER.test(v)) {
    throw new HttpError(400, `Please enter a valid ${label.toLowerCase()}`, { field });
  }
  return v;
}

// A birthday must be a real calendar date, not one from the future, and not one
// that makes the beneficiary under 18. There is no upper age limit.
//
// The round-trip through Date is what catches impossible dates: `new Date` on
// "2024-02-31" silently becomes 2 March, so the parsed month/day have to be
// compared back against the input or a typo like that would be accepted.
function cleanBirthday(value) {
  if (value == null || String(value).trim() === '') return null;

  const raw = String(value).trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    throw new HttpError(400, 'Birthday must be in YYYY-MM-DD format', { field: 'birthday' });
  }

  const [year, month, day] = raw.split('-').map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (
    Number.isNaN(parsed.getTime())
    || parsed.getUTCFullYear() !== year
    || parsed.getUTCMonth() !== month - 1
    || parsed.getUTCDate() !== day
  ) {
    throw new HttpError(400, 'Please enter a valid birthday', { field: 'birthday' });
  }

  const today = new Date();
  const todayUtc = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  if (parsed.getTime() > todayUtc) {
    throw new HttpError(400, 'Birthday cannot be in the future', { field: 'birthday' });
  }

  // "18 and up" is applied to the birth year, matching the admin form: 2009 or
  // later is under 18 whatever the month and day, and 2008 or earlier is in
  // scope. Measuring age to the day instead would reject a 2008 birthday for most
  // of the year, which is not what the rule means. There is no upper age cap.
  const maxBirthYear = new Date().getFullYear() - 18;
  if (year > maxBirthYear) {
    throw new HttpError(400, `Birthday must be ${maxBirthYear} or earlier (beneficiaries are 18 and up)`, { field: 'birthday' });
  }

  return raw;
}

// Checks the three location fields together against the same option tree the
// form was populated from, so a mismatched pair cannot be saved by posting
// directly and a stale child value cannot survive a parent change.
function checkLocation(province, barangay, purok, changed) {
  const { barangaysByProvince, puroksByBarangay } = getLocationOptions();
  // Blame the location field this request actually set; when the bad pairing was
  // already stored, nothing here is wrong and the message stands on its own.
  const field = (name) => (changed.includes(name) ? name : undefined);

  const prov = province ?? null;
  const brgy = barangay ?? null;
  const purk = purok ?? null;

  if (brgy && !prov) throw new HttpError(400, 'Please select a province for the chosen barangay', { field: field('province') });
  if (purk && !brgy) throw new HttpError(400, 'Please select a barangay for the chosen purok', { field: field('barangay') });

  if (prov && !barangaysByProvince[prov]) {
    throw new HttpError(400, 'Please select a valid province', { field: field('province') });
  }
  if (brgy && prov && !(barangaysByProvince[prov] || []).some((b) => b.value === brgy)) {
    throw new HttpError(400, 'That barangay does not belong to the selected province', { field: field('barangay') });
  }
  if (purk && brgy && !(puroksByBarangay[brgy] || []).some((p) => p.value === purk)) {
    throw new HttpError(400, 'That purok does not belong to the selected barangay', { field: field('purok') });
  }
}

router.put('/:id', auth, adminOnly, idempotent(), wrap(async (req, res) => {
  const body = req.body || {};
  const { mobile_number: mobileNumber } = body;
  // The identity columns are loaded too so the duplicate check below can judge
  // the record as it will be after this save (body values over existing ones).
  const [existing] = await pool.query(
    'SELECT id, user_id, first_name, middle_name, last_name, suffix, birthday, rsbsa_number, ' +
    'contact_number, province, barangay, purok FROM beneficiaries WHERE id = ?',
    [req.params.id]
  );
  if (!existing[0]) throw new HttpError(404, 'Beneficiary not found');

  const changes = {};
  const changedKeys = [];

  for (const [key, kind] of Object.entries(FIELDS)) {
    if (!(key in body)) continue;

    const val = body[key];
    let processed = null;

    if (kind === 'name') {
      processed = cleanName(val, key === 'first_name' ? 'First name' : 'Last name', key);
    } else if (kind === 'name_middle') {
      processed = val && String(val).trim() ? cleanName(val, 'Middle name', 'middle_name') : null;
    } else if (kind === 'suffix') {
      processed = val && String(val).trim()
        ? (SUFFIXES.includes(String(val).trim()) ? String(val).trim() : (() => { throw new HttpError(400, 'Please select a valid suffix', { field: 'suffix' }); })())
        : '';
    } else if (kind === 'gender') {
      if (val && String(val).trim()) {
        const g = String(val).trim().toLowerCase();
        if (!['male', 'female'].includes(g)) throw new HttpError(400, 'Gender must be either male or female', { field: 'gender' });
        processed = g;
      }
    } else if (kind === 'birthday') {
      processed = cleanBirthday(val);
    } else if (kind === 'rsbsa') {
      if (val && String(val).trim()) {
        const digits = String(val).replace(/\D/g, '');
        if (digits.length !== 15) throw new HttpError(400, 'RSBSA number must be exactly 15 digits', { field: 'rsbsa_number' });
        processed = digits;
      }
    } else if (kind === 'nullable') {
      processed = val || null;
    } else if (key === 'beneficiary_type') {
      if (val && String(val).trim()) {
        const t = String(val).trim().toLowerCase();
        if (!BENEFICIARY_TYPES.includes(t)) throw new HttpError(400, 'Please select a valid beneficiary type', { field: 'beneficiary_type' });
        processed = t;
      }
    } else if (key === 'status') {
      const s = val == null ? '' : String(val);
      if (!['pending', 'verified', 'rejected'].includes(s)) throw new HttpError(400, 'Please select a valid status', { field: 'status' });
      processed = s;
    } else {
      processed = val == null ? '' : String(val);
    }

    changes[key] = processed;
    changedKeys.push(key);
  }

  // The three location fields are validated together, against the values the
  // record will end up with, so changing a province cannot leave a barangay
  // from the old province behind.
  const touchedLocation = ['province', 'barangay', 'purok'].some((k) => changedKeys.includes(k));
  if (touchedLocation) {
    checkLocation(
      'province' in changes ? changes.province : existing[0].province,
      'barangay' in changes ? changes.barangay : existing[0].barangay,
      'purok' in changes ? changes.purok : existing[0].purok,
      changedKeys,
    );
  }

  // The mobile number is validated and written to both columns together so the
  // account and the beneficiary record can never drift apart. Sharing the number
  // with another record is refused by the shared duplicate check below.
  let mobileValue = null;
  if ('mobile_number' in body) {
    const check = validateMobile(mobileNumber);
    if (check.error) throw new HttpError(400, MOBILE_ERRORS[check.error], { field: 'mobile_number' });
    mobileValue = check.mobile;
    changes.contact_number = mobileValue;
  }

  // Shared duplicate rules for everything this save could change. The record
  // being edited is excluded; every duplicate is a hard block. Every conflicting
  // field is collected so the form can mark each one.
  const duplicateMatches = await checkBeneficiaryDuplicateFields(
    {
      first_name: 'first_name' in changes ? changes.first_name : existing[0].first_name,
      middle_name: 'middle_name' in changes ? changes.middle_name : existing[0].middle_name,
      last_name: 'last_name' in changes ? changes.last_name : existing[0].last_name,
      suffix: 'suffix' in changes ? changes.suffix : existing[0].suffix,
      birthday: 'birthday' in changes ? changes.birthday : existing[0].birthday,
      rsbsa_number: 'rsbsa_number' in changes ? changes.rsbsa_number : existing[0].rsbsa_number,
      mobile_number: 'mobile_number' in body ? mobileValue : null,
      barangay: 'barangay' in changes ? changes.barangay : existing[0].barangay,
    },
    { excludeId: req.params.id, context: 'admin' }
  );
  if (duplicateMatches.length) throw duplicateErrors(duplicateMatches);

  if (Object.keys(changes).length) {
    const sets = Object.keys(changes).map((k) => `${k} = ?`);
    await pool.query(`UPDATE beneficiaries SET ${sets.join(', ')} WHERE id = ?`, [
      ...Object.values(changes),
      req.params.id,
    ]);
  }

  if (mobileValue && existing[0].user_id) {
    // The beneficiaries duplicate check above cannot see an account whose
    // beneficiary row was removed, so a stale users row would surface here as
    // an ER_DUP_ENTRY (HTTP 500). Check the users table too and return a clean
    // 409 instead, excluding this record's own account.
    const userDup = await checkUserDuplicates(
      { mobile_number: mobileValue },
      { excludeId: existing[0].user_id }
    );
    if (userDup) throw new HttpError(409, userDup.message, { field: userDup.field });
    await pool.query('UPDATE users SET mobile_number = ? WHERE id = ?', [mobileValue, existing[0].user_id]);
  }
  res.json({ ok: true });
}));

// POST /api/beneficiaries/:id/password - reset the linked app account's
// password. Used by the edit form when the farmer cannot sign in. The password
// follows the shared rules and is stored only as a hash; bumping token_version
// signs out any session still holding the old token.
router.post('/:id/password', auth, adminOnly, wrap(async (req, res) => {
  const [rows] = await pool.query('SELECT id, user_id FROM beneficiaries WHERE id = ?', [req.params.id]);
  if (!rows[0]) throw new HttpError(404, 'Beneficiary not found');
  if (!rows[0].user_id) {
    throw new HttpError(400, 'This beneficiary has no app account yet, so there is no password to reset.');
  }

  const password = String(req.body?.password ?? '');
  const problem = passwordProblem(password);
  if (problem) {
    throw new HttpError(422, problem, {
      field: 'password',
      errors: [{ field: 'password', message: problem }],
    });
  }
  if (passwordMatchReason(password, req.body?.password_confirmation) !== null) {
    const message = 'Passwords do not match.';
    throw new HttpError(422, message, {
      field: 'password_confirmation',
      errors: [{ field: 'password_confirmation', message }],
    });
  }

  const hash = await bcrypt.hash(password, 10);
  // Bumping token_version signs out every device already holding a token, so a
  // reset cannot be undone by a session created before it.
  await pool.query(
    'UPDATE users SET password_hash = ?, token_version = token_version + 1 WHERE id = ?',
    [hash, rows[0].user_id]
  );
  res.json({ ok: true });
}));

// DELETE /api/beneficiaries/:id
// Deleting a beneficiary is the "release" action: it frees the mobile number so
// it can be reused. The users row is kept for the audit trail but its unique
// mobile_number is nulled and the account deactivated, otherwise the orphaned
// row would keep claiming the number forever and block re-registration.
router.delete('/:id', auth, adminOnly, wrap(async (req, res) => {
  const [rows] = await pool.query('SELECT id, user_id FROM beneficiaries WHERE id = ?', [req.params.id]);
  if (!rows[0]) throw new HttpError(404, 'Beneficiary not found');
  const userId = rows[0].user_id;
  await pool.query('DELETE FROM beneficiaries WHERE id = ?', [req.params.id]);
  if (userId) {
    await pool.query(
      "UPDATE users SET mobile_number = NULL, email = NULL, is_active = 0 WHERE id = ? AND role = 'beneficiary'",
      [userId]
    );
  }
  res.json({ ok: true });
}));

export default router;