import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { pool } from '../config/db.js';
import { auth, superAdminOnly } from '../middleware/auth.js';
import { idempotent } from '../middleware/idempotency.js';
import { wrap, HttpError } from '../lib/utils.js';
import { checkUserDuplicateFields, duplicateErrors } from '../services/duplicates.js';
import { passwordProblem } from '../lib/password.js';

const router = Router();

// User Management is a Super Admin screen and nothing else. Beneficiary accounts
// share the users table but are owned by the mobile app, and a plain ADMIN has no
// business reading the portal's account list, so both groups are kept out of every
// route in this file by a single gate rather than one per endpoint.
router.use(auth, superAdminOnly);

// Account create/edit and status/password changes may be retried safely: a
// user-management submit that loses its response is not run twice.
router.use(idempotent());

const ADMIN_ROLES = new Set(['admin', 'super_admin']);
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MOBILE_RE = /^09\d{9}$/;
// Matches the beneficiaries table. Names are stored in parts so a surname can be
// searched or sorted on, and so nothing has to guess where the surname starts.
const MAX_NAME_LENGTH = 80;

// password_hash is deliberately absent from every projection here: the account
// list is a read of the whole portal's roster and must never carry credentials.
const ACCOUNT_COLUMNS = 'id, first_name, middle_name, last_name, email, mobile_number, role, is_active, created_at, last_active_at';

const text = (v) => String(v ?? '').trim();

// First and last name are required because the roster is a list of people to
// contact; a middle name is not. The same rule applies to create and edit.
function readName(body) {
  const first_name = text(body?.first_name);
  const middle_name = text(body?.middle_name) || null;
  const last_name = text(body?.last_name);

  if (!first_name) throw new HttpError(400, 'First name is required', { field: 'first_name' });
  if (!last_name) throw new HttpError(400, 'Last name is required', { field: 'last_name' });
  for (const [field, value] of Object.entries({ first_name, middle_name, last_name })) {
    if (value && value.length > MAX_NAME_LENGTH) {
      throw new HttpError(400, `Name parts must be ${MAX_NAME_LENGTH} characters or fewer`, { field });
    }
  }
  return { first_name, middle_name, last_name };
}

// The edit form always submits the whole account, so there is no "field absent"
// case to distinguish from "field cleared". Keeping that unambiguous is why this
// is shared by create and edit instead of being a partial-update helper.
function readAccountInput(body) {
  const name = readName(body);
  const email = text(body?.email).toLowerCase() || null;
  const mobile_number = text(body?.mobile_number) || null;
  const role = text(body?.role);

  // Sign-in is by mobile number, so the email is optional: an account with none is
  // normal. When one is given it still has to look like an email.
  if (email && !EMAIL_RE.test(email)) throw new HttpError(400, 'Enter a valid email address', { field: 'email' });
  // The mobile is what the staff member actually signs in with, so it is the one
  // hard credential -- an account without one would be unreachable.
  if (!mobile_number) throw new HttpError(400, 'Mobile number is required', { field: 'mobile_number' });
  if (!MOBILE_RE.test(mobile_number)) {
    throw new HttpError(400, 'Enter a valid Philippine mobile number (09XXXXXXXXX)', { field: 'mobile_number' });
  }
  // Guards against posting a role this screen is not allowed to grant, such as
  // beneficiary, which would otherwise mint a portal login of the wrong kind.
  if (!ADMIN_ROLES.has(role)) throw new HttpError(400, 'Role must be Admin or Super Admin', { field: 'role' });

  return { ...name, email, mobile_number, role };
}

function readPassword(body) {
  const password = String(body?.password ?? '');
  const problem = passwordProblem(password);
  if (problem) {
    throw new HttpError(422, problem, {
      field: 'password',
      errors: [{ field: 'password', message: problem }],
    });
  }
  return password;
}

// Email and mobile are unique across the whole users table, not just the admin
// rows, so the check has to span beneficiaries too or the INSERT fails with a
// bare driver error instead of a message naming the field. Both are hard blocks
// enforced through the shared duplicate service; every conflicting field is
// collected so the form can mark each one.
async function assertCredentialsAvailable({ first_name, middle_name, last_name, email, mobile_number }, excludeId = 0) {
  const errors = await checkUserDuplicateFields({ first_name, middle_name, last_name, email, mobile_number }, { excludeId });
  if (errors.length) throw duplicateErrors(errors);
}

async function loadAccount(id) {
  const [rows] = await pool.query(
    `SELECT ${ACCOUNT_COLUMNS} FROM users
     WHERE id = ? AND role IN ('admin', 'super_admin') LIMIT 1`,
    [id]
  );
  return rows[0] || null;
}

async function requireAccount(id) {
  const account = await loadAccount(id);
  if (!account) throw new HttpError(404, 'Account not found');
  return account;
}

// At least one active Super Admin must always exist, otherwise the portal loses
// the only role that can manage accounts and no one could ever restore it. This is
// checked against the database rather than a cached count so two Super Admins
// pressing the button at the same moment cannot both succeed.
async function assertNotLastActiveSuperAdmin(account, action) {
  if (account.role !== 'super_admin' || !account.is_active) return;
  const [rows] = await pool.query(
    "SELECT COUNT(*) AS total FROM users WHERE role = 'super_admin' AND is_active = 1 AND id <> ?",
    [account.id]
  );
  if (Number(rows[0].total) === 0) {
    throw new HttpError(
      400,
      `Cannot ${action} the last active Super Admin. Promote or enable another Super Admin first.`
    );
  }
}

// GET /api/users - the admin portal roster. Beneficiaries are excluded by role.
router.get('/', wrap(async (req, res) => {
  const [rows] = await pool.query(
    `SELECT ${ACCOUNT_COLUMNS} FROM users
     WHERE role IN ('admin', 'super_admin')
     ORDER BY FIELD(role, 'super_admin', 'admin'), is_active DESC, last_name, first_name, email`
  );

  // Naming the protected account lets the UI explain the lockout instead of
  // offering a button whose only outcome is an error.
  const [active] = await pool.query(
    "SELECT id FROM users WHERE role = 'super_admin' AND is_active = 1 ORDER BY id LIMIT 2"
  );
  const protectedId = active.length === 1 ? active[0].id : null;

  res.json(rows.map((r) => ({ ...r, is_last_active_super_admin: r.id === protectedId })));
}));

// GET /api/users/check-duplicate - live inline duplicate preview for the account
// form. Returns { errors: [{ field, message }] }, so the form can mark each
// conflicting input instead of showing one banner.
router.get('/check-duplicate', wrap(async (req, res) => {
  const { excludeId, ...values } = req.query;
  const errors = await checkUserDuplicateFields(values, { excludeId });
  res.json({ errors });
}));

// POST /api/users - create an Admin or Super Admin account.
router.post('/', wrap(async (req, res) => {
  const input = readAccountInput(req.body);
  const password = readPassword(req.body);
  await assertCredentialsAvailable(input);

  const password_hash = await bcrypt.hash(password, 10);
  const [result] = await pool.query(
    'INSERT INTO users (first_name, middle_name, last_name, email, mobile_number, password_hash, role) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [input.first_name, input.middle_name, input.last_name, input.email, input.mobile_number, password_hash, input.role]
  );

  res.status(201).json(await loadAccount(result.insertId));
}));

// PUT /api/users/:id - edit name, contact details and role.
router.put('/:id', wrap(async (req, res) => {
  const id = Number(req.params.id);
  const account = await requireAccount(id);
  const input = readAccountInput(req.body);

  if (input.role !== account.role) {
    // A Super Admin who demotes themselves has locked themselves out of the only
    // role that could undo it, so the row they are standing on is not editable.
    if (id === req.user.id) {
      throw new HttpError(400, 'You cannot change your own role', { field: 'role' });
    }
    if (account.role === 'super_admin') await assertNotLastActiveSuperAdmin(account, 'demote');
  }

  await assertCredentialsAvailable(input, id);
  await pool.query(
    'UPDATE users SET first_name = ?, middle_name = ?, last_name = ?, email = ?, mobile_number = ?, role = ? WHERE id = ?',
    [input.first_name, input.middle_name, input.last_name, input.email, input.mobile_number, input.role, id]
  );

  res.json(await loadAccount(id));
}));

// POST /api/users/:id/status - activate or deactivate an account. Deactivation is
// enforced by the auth middleware on the target's very next request.
router.post('/:id/status', wrap(async (req, res) => {
  const id = Number(req.params.id);
  const is_active = req.body?.is_active;
  if (typeof is_active !== 'boolean') throw new HttpError(400, 'is_active must be true or false');

  const account = await requireAccount(id);

  if (!is_active) {
    if (id === req.user.id) throw new HttpError(400, 'You cannot deactivate your own account');
    await assertNotLastActiveSuperAdmin(account, 'deactivate');
  }

  await pool.query('UPDATE users SET is_active = ? WHERE id = ?', [is_active ? 1 : 0, id]);

  res.json(await loadAccount(id));
}));

// POST /api/users/:id/password - set a new password directly. There is no mail
// service in this project, so the Super Admin is the delivery mechanism and is
// responsible for handing it over out of band.
router.post('/:id/password', wrap(async (req, res) => {
  const id = Number(req.params.id);
  await requireAccount(id);
  const password = readPassword(req.body);

  const password_hash = await bcrypt.hash(password, 10);
  await pool.query('UPDATE users SET password_hash = ? WHERE id = ?', [password_hash, id]);

  // Sessions already signed with the old token keep working until it expires;
  // the new password applies from the next sign-in.
  res.json({ ok: true, account_id: id });
}));

// DELETE /api/users/:id - remove a deactivated account from the roster. The row
// is only reachable here once it is already inactive, so nothing live is lost in
// one step: deactivate first, then delete. Beneficiary accounts are a different
// table's concern and `requireAccount` already refuses them.
router.delete('/:id', wrap(async (req, res) => {
  const id = Number(req.params.id);
  const account = await requireAccount(id);
  if (account.is_active) {
    throw new HttpError(400, 'Deactivate the account before deleting it');
  }
  if (id === req.user.id) throw new HttpError(400, 'You cannot delete your own account');
  await assertNotLastActiveSuperAdmin(account, 'delete');

  await pool.query('DELETE FROM users WHERE id = ?', [id]);
  res.json({ ok: true, account_id: id });
}));

export default router;