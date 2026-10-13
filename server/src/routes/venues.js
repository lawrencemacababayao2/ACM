// Maintained Venue list shared by the Program and Training forms.
//
// The values live in report_option_values under the list name 'venues', the same
// table the report option lists use, so the two features share one storage and one
// meaning: an entry is curated by an admin, offered to everyone, and removing one
// never edits the records that carry it. The array seeded by migration 026 is the
// starting point; the list is storage, not config, from then on.
//
//   GET    /api/venues            the list, for the form dropdowns
//   POST   /api/venues            add an entry   { value }
//   DELETE /api/venues?value=...  remove an entry
//
// Reading is open to any signed-in user (the forms need it); adding and removing
// are admin-only, matching who may create or edit a program or a training.

import { Router } from 'express';
import { pool } from '../config/db.js';
import { auth, roles } from '../middleware/auth.js';
import { wrap, HttpError } from '../lib/utils.js';

const router = Router();

const LIST = 'venues';
const OPTION_TABLE = 'report_option_values';
const ADMIN_ROLES = ['admin', 'super_admin'];
// The option table stores values in a VARCHAR(80) column, so a venue cannot be
// longer than that without widening the column. Caught here so the message is
// about the venue rather than about a truncated database value.
const MAX_LENGTH = 80;

function cleanText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

router.get('/', auth, wrap(async (req, res) => {
  const [rows] = await pool.query(
    `SELECT value FROM ${OPTION_TABLE} WHERE list_name = ? ORDER BY sort_order, value`,
    [LIST]
  );
  res.json(rows.map((row) => row.value));
}));

router.post('/', auth, roles(...ADMIN_ROLES), wrap(async (req, res) => {
  const value = cleanText(req.body?.value);
  if (!value) throw new HttpError(400, 'Enter a venue');
  if (value.length > MAX_LENGTH) throw new HttpError(400, `Keep it to ${MAX_LENGTH} characters or fewer`);

  // Appended rather than slotted in, and a duplicate is not an error, so a retry
  // of the same add does not fail. The next sort_order is read rather than computed
  // in the INSERT: a statement cannot read the table it is writing into.
  const [[{ next: nextOrder }]] = await pool.query(
    `SELECT COALESCE(MAX(sort_order), 0) + 10 AS next FROM ${OPTION_TABLE} WHERE list_name = ?`,
    [LIST]
  );
  await pool.query(
    `INSERT IGNORE INTO ${OPTION_TABLE} (list_name, value, sort_order) VALUES (?, ?, ?)`,
    [LIST, value, Number(nextOrder) || 10]
  );

  res.status(201).json({ ok: true, value });
}));

router.delete('/', auth, roles(...ADMIN_ROLES), wrap(async (req, res) => {
  const value = cleanText(req.query.value);
  if (!value) throw new HttpError(400, 'Missing venue');

  // Removing the entry does not touch the records that carry it. They keep saying
  // what they said; the value simply stops being offered.
  const [result] = await pool.query(
    `DELETE FROM ${OPTION_TABLE} WHERE list_name = ? AND value = ?`,
    [LIST, value]
  );
  res.json({ ok: true, removed: result.affectedRows, value });
}));

export default router;
