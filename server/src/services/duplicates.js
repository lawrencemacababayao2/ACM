// Duplicate detection shared by the admin beneficiary forms, the User
// Management roster and the mobile registration wizard.
//
// Every duplicate is a hard block. A record is a duplicate when it shares an
// RSBSA number, a mobile number, or a normalized full name
// (First + Middle + Last + Suffix) with an existing record; there is no
// birthday exception and no soft-warning tier any more. The route turns every
// match into a 409 DUPLICATE_BLOCK.
//
// The candidate set is the whole table: the normalized columns added by
// migration 016 are stored for reporting and indexing, but the match rules are
// re-computed here against the raw columns, so a record written before the
// migration is judged by the same rules as one written after it. The tables in
// this project are small, which keeps a full scan cheap enough for the live,
// debounced inline checks.
import { pool } from '../config/db.js';
import { HttpError } from '../lib/utils.js';
import { normalizeName, nameKey, normalizeRsbsa, normalizeEmail, normalizeMobile } from '../lib/normalize.js';

const nameOf = (row) => `${row.first_name || ''} ${row.last_name || ''}`.trim();

// A portal-account name match needs first and last; a missing middle name is
// matched as empty so "Juan Dela Cruz" collides with another "Juan Dela Cruz"
// regardless of whether one of them filled in a middle name.
function readPortalName(values) {
  const first_name = String(values?.first_name ?? '').trim().toLowerCase();
  const middle_name = String(values?.middle_name ?? '').trim().toLowerCase();
  const last_name = String(values?.last_name ?? '').trim().toLowerCase();
  if (!first_name || !last_name) return null;
  return { first_name, middle_name, last_name };
}

function portalNameMatches(row, name) {
  return (
    String(row.first_name || '').trim().toLowerCase() === name.first_name &&
    String(row.last_name || '').trim().toLowerCase() === name.last_name &&
    String(row.middle_name || '').trim().toLowerCase() === name.middle_name
  );
}

function existingPayload(row) {
  return {
    id: row.id,
    name: nameOf(row),
    barangay: row.barangay || null,
    status: row.status || null,
  };
}

// The two callers use different wording: the admin forms can name the column the
// duplicate sits on, while the registration wizard talks to a farmer and must
// never disclose that a specific RSBSA number is claimed.
const MESSAGES = {
  admin: {
    rsbsa: {
      field: 'rsbsa_number',
      message: 'This RSBSA No. is already registered.',
    },
    mobile: {
      field: 'mobile_number',
      message: 'This mobile number is already registered.',
    },
    name_block: {
      field: 'name',
      message: 'This beneficiary is already registered.',
    },
  },
  register: {
    mobile: {
      field: 'mobile',
      message: "This mobile number is already registered. Please log in, or use Forgot password if you don't remember it.",
    },
    name_block: {
      field: 'name',
      message: 'A beneficiary record with this name already has an account',
    },
  },
};

// Returns one { field, message } per column that matched - RSBSA, mobile, name -
// so a form can show every conflict at once instead of only the first. The rules
// are identical to verifyBeneficiary below; this only collects instead of
// returning early. The other person's identity is never included.
function matchBeneficiaryFields(values, rows, context) {
  const msg = MESSAGES[context] || MESSAGES.admin;
  const errors = [];
  const add = (field, message) => {
    if (!errors.some((e) => e.field === field)) errors.push({ field, message });
  };
  const key = nameKey(values);
  const rsbsa = values.rsbsa_number ? normalizeRsbsa(values.rsbsa_number) : null;
  const mobile = values.mobile_number ? normalizeMobile(values.mobile_number) : null;

  for (const row of rows) {
    if (context !== 'register' && rsbsa && normalizeRsbsa(row.rsbsa_number) === rsbsa) {
      add(msg.rsbsa.field, msg.rsbsa.message);
    }
    if (mobile) {
      const rowMobile = row.account_mobile || row.contact_number;
      if (rowMobile && normalizeMobile(rowMobile) === mobile) {
        add(msg.mobile.field, msg.mobile.message);
      }
    }
    if (key && nameKey(row) === key) {
      add(msg.name_block.field, msg.name_block.message);
    }
  }
  return errors;
}

function verifyBeneficiary(values, rows, context) {
  const msg = MESSAGES[context] || MESSAGES.admin;
  const key = nameKey(values);
  const rsbsa = values.rsbsa_number ? normalizeRsbsa(values.rsbsa_number) : null;
  const mobile = values.mobile_number ? normalizeMobile(values.mobile_number) : null;

  for (const row of rows) {
    // "Same RSBSA" only blocks on the admin side; registration refuses a claimed
    // number earlier with a deliberately generic message so existence cannot be
    // probed, and the unclaimed record the wizard is linking to is excluded.
    if (context !== 'register' && rsbsa && normalizeRsbsa(row.rsbsa_number) === rsbsa) {
      return { kind: 'block', ...msg.rsbsa, existing: existingPayload(row) };
    }
    if (mobile) {
      const rowMobile = row.account_mobile || row.contact_number;
      if (rowMobile && normalizeMobile(rowMobile) === mobile) {
        return { kind: 'block', ...msg.mobile, existing: existingPayload(row) };
      }
    }
    // The full normalized name (First + Middle + Last + Suffix) is the identity
    // that blocks, regardless of birthday. Because the key is built with `|`
    // separators, an empty middle name only matches another empty middle name.
    if (key && nameKey(row) === key) {
      return { kind: 'block', ...msg.name_block, existing: existingPayload(row) };
    }
  }
  return null;
}

// Checks the beneficiaries table (plus the linked users rows for mobile numbers,
// since an account's number is the canonical one). Returns null or
// { kind: 'block', field, message, existing }.
//
// excludeId            - the record being edited, ignored so a save does not
//                        match against itself.
// excludeRsbsaMatchId  - an unclaimed record being linked during registration;
//                        it is the very same person, so it is expected to match
//                        on every field and is excluded.
// context              - 'admin' (beneficiary forms) or 'register' (wizard).
export async function checkBeneficiaryDuplicates(values, { excludeId = 0, excludeRsbsaMatchId = null, context = 'admin' } = {}) {
  excludeId = Number(excludeId) || 0;
  excludeRsbsaMatchId = Number(excludeRsbsaMatchId) || null;

  const params = [];
  let where = '1 = 1';
  if (excludeId) { where += ' AND b.id <> ?'; params.push(excludeId); }
  if (excludeRsbsaMatchId) { where += ' AND b.id <> ?'; params.push(excludeRsbsaMatchId); }

  const [rows] = await pool.query(
    `SELECT b.id, b.first_name, b.middle_name, b.last_name, b.suffix, b.barangay, b.status,
            b.birthday, b.rsbsa_number, b.contact_number, u.mobile_number AS account_mobile
     FROM beneficiaries b
     LEFT JOIN users u ON u.id = b.user_id
     WHERE ${where}
     ORDER BY b.id`,
    params
  );

  return verifyBeneficiary(values, rows, context);
}

// Same rules as checkBeneficiaryDuplicates but returns every matching field as
// { field, message }, so the admin forms can light up each conflicting input
// instead of a single banner. Each field appears at most once.
export async function checkBeneficiaryDuplicateFields(values, { excludeId = 0, excludeRsbsaMatchId = null, context = 'admin' } = {}) {
  excludeId = Number(excludeId) || 0;
  excludeRsbsaMatchId = Number(excludeRsbsaMatchId) || null;

  const params = [];
  let where = '1 = 1';
  if (excludeId) { where += ' AND b.id <> ?'; params.push(excludeId); }
  if (excludeRsbsaMatchId) { where += ' AND b.id <> ?'; params.push(excludeRsbsaMatchId); }

  const [rows] = await pool.query(
    `SELECT b.id, b.first_name, b.middle_name, b.last_name, b.suffix, b.barangay, b.status,
            b.birthday, b.rsbsa_number, b.contact_number, u.mobile_number AS account_mobile
     FROM beneficiaries b
     LEFT JOIN users u ON u.id = b.user_id
     WHERE ${where}
     ORDER BY b.id`,
    params
  );

  return matchBeneficiaryFields(values, rows, context);
}

// Checks the users table (all roles, since mobile numbers and emails are unique
// across the whole roster). Returns null or { kind: 'block', field, message,
// existing }.
export async function checkUserDuplicates(values, { excludeId = 0 } = {}) {
  excludeId = Number(excludeId) || 0;
  const email = values.email ? normalizeEmail(values.email) : null;
  const mobile = values.mobile_number ? normalizeMobile(values.mobile_number) : null;
  const name = readPortalName(values);
  if (!email && !mobile && !name) return null;

  // Each rule is its own OR branch; the name branch carries its match columns
  // inside the branch so an email hit on a beneficiary row is not filtered out
  // by name conditions that were never meant for it.
  const clauses = [];
  const params = [];
  if (email) clauses.push("email IS NOT NULL AND email <> ''");
  if (mobile) clauses.push("mobile_number IS NOT NULL AND mobile_number <> ''");
  if (name) {
    clauses.push("role IN ('admin', 'super_admin') AND LOWER(TRIM(first_name)) = ? AND LOWER(TRIM(last_name)) = ? AND LOWER(TRIM(COALESCE(middle_name, ''))) = ?");
    params.push(name.first_name, name.last_name, name.middle_name);
  }

  let sql =
    `SELECT id, first_name, middle_name, last_name, email, mobile_number, is_active FROM users
     WHERE (${clauses.join(' OR ')})`;
  if (excludeId) { sql += ' AND id <> ?'; params.push(excludeId); }

  const [rows] = await pool.query(sql, params);
  for (const row of rows) {
    let dup = null;
    if (email && row.email && normalizeEmail(row.email) === email) {
      dup = { field: 'email', message: 'This email is already in use.' };
    } else if (mobile && row.mobile_number && normalizeMobile(row.mobile_number) === mobile) {
      dup = { field: 'mobile_number', message: 'This mobile number is already in use.' };
    } else if (name && portalNameMatches(row, name)) {
      dup = { field: 'first_name', message: 'An account with this name already exists.' };
    }
    if (dup) {
      return {
        kind: 'block',
        ...dup,
        existing: {
          id: row.id,
          name: nameOf(row),
          barangay: null,
          status: row.is_active ? 'active' : 'inactive',
        },
      };
    }
  }
  return null;
}

// Same rules as checkUserDuplicates but returns every field that matched
// (email and/or mobile), so the account form can mark each field at once.
export async function checkUserDuplicateFields(values, { excludeId = 0 } = {}) {
  excludeId = Number(excludeId) || 0;
  const email = values.email ? normalizeEmail(values.email) : null;
  const mobile = values.mobile_number ? normalizeMobile(values.mobile_number) : null;
  const name = readPortalName(values);
  if (!email && !mobile && !name) return [];

  // Same OR-branch shape as checkUserDuplicates: the name rule carries its own
  // match columns so it never filters out email or mobile hits.
  const clauses = [];
  const params = [];
  if (email) clauses.push("email IS NOT NULL AND email <> ''");
  if (mobile) clauses.push("mobile_number IS NOT NULL AND mobile_number <> ''");
  if (name) {
    clauses.push("role IN ('admin', 'super_admin') AND LOWER(TRIM(first_name)) = ? AND LOWER(TRIM(last_name)) = ? AND LOWER(TRIM(COALESCE(middle_name, ''))) = ?");
    params.push(name.first_name, name.last_name, name.middle_name);
  }

  let sql =
    `SELECT id, first_name, middle_name, last_name, email, mobile_number, is_active FROM users
     WHERE (${clauses.join(' OR ')})`;
  if (excludeId) { sql += ' AND id <> ?'; params.push(excludeId); }

  const [rows] = await pool.query(sql, params);
  const errors = [];
  const add = (field, message) => {
    if (!errors.some((e) => e.field === field)) errors.push({ field, message });
  };
  for (const row of rows) {
    if (email && row.email && normalizeEmail(row.email) === email) {
      add('email', 'This email is already in use.');
    }
    if (mobile && row.mobile_number && normalizeMobile(row.mobile_number) === mobile) {
      add('mobile_number', 'This mobile number is already in use.');
    }
    if (name && portalNameMatches(row, name)) {
      add('first_name', 'An account with this name already exists.');
    }
  }
  return errors;
}

// Wraps the collected field errors into the 409 the forms expect. The first
// message also lands in `error` so any client that only reads that still shows
// something meaningful.
export function duplicateErrors(errors) {
  return new HttpError(409, errors[0].message, { code: 'DUPLICATE_BLOCK', errors });
}

export function duplicateConflict(dup) {
  // Every duplicate is a hard block now; there is no warning tier left.
  return new HttpError(409, dup.message, {
    code: 'DUPLICATE_BLOCK',
    field: dup.field,
    existing: dup.existing,
  });
}

// Duplicates can never be bypassed; the "Save anyway" checkbox is gone.
export function assertNoDuplicate(dup) {
  if (dup) throw duplicateConflict(dup);
}