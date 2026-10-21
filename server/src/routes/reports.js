// Generic report API driven entirely by server/src/data/reportTypes.js.
//
// Every route here works off a type's config: which table to read, how to filter
// it, which columns to return, how to validate a write, and what the CSV header
// says. Nothing in this file mentions Animal Health, so a second report type is
// added by writing a config entry and creating its table -- not by editing the
// router.
//
//   GET    /api/reports/types                  the registry, for the page shell
//   GET    /api/reports/:type                  list, filtered and paginated
//   GET    /api/reports/:type/summary          card figures for the active filters
//   GET    /api/reports/:type/export.csv       the filtered set as CSV
//   POST   /api/reports/:type                  create
//   PUT    /api/reports/:type/:id              update
//   DELETE /api/reports/:type/:id              delete

import { Router } from 'express';
import { pool } from '../config/db.js';
import { auth, roles } from '../middleware/auth.js';
import { idempotent } from '../middleware/idempotency.js';
import { wrap, HttpError } from '../lib/utils.js';
import { capitalizeFirst } from '../lib/text.js';
import { parseJsonList } from '../lib/jsonList.js';
import {
  REPORT_TYPES, getReportType, resolveOptions, serialiseReportTypes,
} from '../data/reportTypes.js';

const router = Router();

// Technicians may add and correct records but only their own, and may not delete
// at all. Admins and super admins are unrestricted. `own` is resolved per route
// against the row's owner column so a new type inherits the rule unchanged.
const WRITE_ROLES = ['admin', 'super_admin', 'technician'];
const ADMIN_ROLES = ['admin', 'super_admin'];

const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 200;

function positiveInt(value, fallback, max) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  return Math.min(parsed, max);
}

function cleanText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

// The option lists the office maintains (see `managedOptions` in the config), read
// out of report_option_values.
//
// This is what makes "add a new species" a permanent act rather than a per-record one:
// an admin's entry is part of the list the registry serves, so it is offered in the
// dropdown, selectable in the filter, and accepted from any role. Storing the list
// separately is also what keeps an entry alive when the record it was added for is
// deleted -- deriving it from the records could not do that, because the last record
// holding a value would take the value with it.
//
// A list with nothing stored falls back to the array in the config module, so a
// database seeded by hand rather than by migration 012 still has a usable list.
const OPTION_TABLE = 'report_option_values';

async function managedOptions(type) {
  const lists = {};
  const names = type.managedOptions || [];
  if (!names.length) return lists;

  const [rows] = await pool.query(
    `SELECT list_name, value FROM ${OPTION_TABLE}
      WHERE list_name IN (?) ORDER BY list_name, sort_order, value`,
    [names]
  );
  for (const name of names) lists[name] = [];
  for (const row of rows) lists[row.list_name]?.push(row.value);
  return lists;
}

// A field backed by one of the managed lists, named by its list rather than by its
// column, so a save can check a value against what the list holds right now.
function managedListName(type, field) {
  return field.managed ? field.options : null;
}

// Resolves each declared filter into SQL. Only filters the config declares are
// honoured, and every value is bound as a parameter, so no request can inject a
// column name or reach a table the type does not use.
function buildFilter(type, query) {
  const clauses = [];
  const params = [];

  for (const filter of type.filters) {
    const raw = query[filter.key];
    // A repeated param (?activity=a&activity=b) arrives as an array, which is how a
    // multi-select filter says "any of these". Everything else is single-valued and
    // reads the first, so a hand-crafted repeat cannot widen a result set.
    const raws = (Array.isArray(raw) ? raw : [raw]).map(cleanText).filter(Boolean);
    if (!raws.length) continue;
    const value = raws[0];

    if (filter.type === 'date') {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
        throw new HttpError(400, `${filter.label} must be a valid date`);
      }
      clauses.push(`${type.dateColumn} ${filter.apply === 'gte' ? '>=' : '<='} ?`);
      params.push(value);
      continue;
    }

    if (filter.type === 'multi') {
      // "Activity" is a JSON array, so an exact match would miss a record that
      // also had Deworming. JSON_CONTAINS matches any single member, and OR-ing the
      // ticked values keeps the meaning "has at least one of these".
      clauses.push(`(${raws.map(() => `JSON_CONTAINS(${filter.column}, JSON_QUOTE(?))`).join(' OR ')})`);
      params.push(...raws);
      continue;
    }

    clauses.push(`${filter.column} = ?`);
    params.push(value);
  }

  return { where: clauses, params };
}

// Free-text search across the columns the config marks searchable.
//
// The flag was already on the registry but nothing read it, so the search box had
// no server half and returned everything. Only columns that declare `searchable`
// are matched: that keeps a date filter (which has its own from/to controls) and a
// derived column (no SQL expression to compare against) out of the text match.
//
// Values are bound, so a search term cannot inject SQL. The LIKE wildcards the term
// might contain are escaped as well: bound or not, an unescaped "%" would widen the
// pattern into a match-anything, which is how a search for "50%" ends up returning
// the whole table. The escape character is "!" rather than a backslash because MariaDB
// reads a backslash as an escape inside a string literal, so ESCAPE '\' would close
// the quote early and the statement would not parse at all.
const LIKE_ESCAPE = '!';

function likePattern(term) {
  const escaped = term.replace(/[!%_]/g, (char) => LIKE_ESCAPE + char);
  return `%${escaped}%`;
}

function buildSearch(type, query) {
  const term = cleanText(query.q);
  if (!term) return { where: [], params: [] };

  const columns = type.columns.filter((column) => column.searchable && column.source);
  if (!columns.length) return { where: [], params: [] };

  const clauses = columns.map((column) => {
    // Activity is a JSON array; CAST lets LIKE see inside it, which is what makes
    // "deworm" match a record whose activities are ["Deworming","Vitamins"].
    const expr = column.kind === 'multi' ? `CAST(${column.source} AS CHAR)` : column.source;
    return `${expr} LIKE ? ESCAPE '${LIKE_ESCAPE}'`;
  });

  // One bound parameter per placeholder, in the same order as the clauses.
  return { where: [`(${clauses.join(' OR ')})`], params: columns.map(() => likePattern(term)) };
}

// Filters and the search term combined, so the list, the summary cards and the CSV
// all describe the same rows. A search that narrowed the table but not the cards
// would report totals the table contradicts.
function buildWhere(type, query) {
  const filter = buildFilter(type, query);
  const search = buildSearch(type, query);
  return {
    where: [...filter.where, ...search.where],
    params: [...filter.params, ...search.params],
  };
}

function shapeRow(type, row, user) {
  const shaped = { ...row };
  for (const column of type.columns) {
    if (column.kind === 'multi') {
      shaped[column.key] = parseJsonList(shaped[column.key]);
      continue;
    }
    if (column.derived === 'age') {
      // Age is stored as a number plus a unit so it sorts numerically; every
      // surface shows the pair as one value.
      const value = Number(row.age_value);
      const unit = row.age_unit || '';
      shaped.age_display = value > 0 ? `${value} ${unit}` : '';
      continue;
    }
    if (column.key === 'no_of_heads') shaped[column.key] = Number(row[column.key]) || 0;
    if (column.key === 'age_value') shaped[column.key] = Number(row[column.key]) || 0;
  }

  // Derived from the signed-in user's role and whether they created the row, so
  // the client only renders controls the server would actually allow.
  const isAdmin = ADMIN_ROLES.includes(user?.role);
  const isOwner = Number(row._is_owner) === 1;
  shaped.can_edit = isAdmin || isOwner;
  shaped.can_delete = isAdmin;
  delete shaped._is_owner;
  return shaped;
}

// Marks whether the signed-in user created the row, which is what the technician
// edit rule keys on. Ownership lives in `created_by`, kept separate from
// `treated_by` so correcting who did the work does not transfer ownership.
function ownerSql(type) {
  return `, (r.${type.ownerColumn} = ?) AS _is_owner`;
}

function selectSql(type, extra = '') {
  // `id` is always selected even though no column in the config mentions it: the
  // table's React key, the edit/delete target and the CSV row identity all need
  // it, and requiring every type to declare it would be noise.
  const columnSql = type.columns
    .filter((column) => !column.derived && column.kind !== 'actions')
    // `nameExpression` is emitted verbatim because it is a computed string; every
    // other column is a plain `table.column` reference taken from the config.
    .map((column) => `${column.source === 'nameExpression' ? type.nameExpression : column.source} AS \`${column.key}\``)
    .join(', ');
  return `SELECT r.id AS \`id\`, ${columnSql}${extra} FROM ${type.table} r ${type.joins || ''}`;
}

// ---------------- validation ----------------

// The rules a maintained entry has to satisfy, shared by the add endpoint and the
// record save so the two cannot disagree about what may be called a species. Returns
// a message to reject with, or null when the value is acceptable.
//
// `maxLength` defaults to the 80 the option table allows, but a field may narrow it to
// match the record column it will be written to: a species name longer than 64
// characters would be refused by the column itself, so refusing it here reports it on
// the field the user typed it into.
function optionRejection(field, value) {
  const limit = Number(field.maxLength) > 0 ? Number(field.maxLength) : 80;
  if (value.length > limit) {
    return `${field.label} must be ${limit} characters or fewer`;
  }
  const reserved = field.reserved || [];
  const clash = reserved.find((name) => name.toLowerCase() === value.toLowerCase());
  if (clash) {
    return `${field.label} "${clash}" is not a choice`;
  }
  return null;
}

// `stored` carries the type's managed option lists as they stand right now. A role is
// not read here any more: an entry joins a maintained list through the add endpoint,
// which checks the role itself, so a save has nothing role-dependent left to decide.
function validateRecord(type, body, { partial = false, stored = {} } = {}) {
  const errors = {};
  const values = {};

  for (const field of type.fields) {
    const present = body[field.key] !== undefined;
    if (partial && !present) continue;

    let value = body[field.key];

    if (field.kind === 'activity') {
      const list = parseJsonList(value).map((item) => cleanText(item)).filter(Boolean);
      if (!field.required && !list.length) {
        values[field.key] = null;
        continue;
      }
      if (!list.length) {
        errors[field.key] = 'Select at least one activity';
        continue;
      }

      const allowed = resolveOptions(field.options);
      const chosen = list.filter((item) => allowed.includes(item) && item !== 'Other');
      // Anything that is not a known option is the custom text typed for "Other",
      // sent by the form as one extra entry alongside the tick.
      const custom = list.filter((item) => !allowed.includes(item));
      const keptOther = list.includes('Other');

      for (const text of custom) {
        if (text.length > 80) errors[field.key] = 'Activity text is too long';
      }

      const result = [...chosen, ...custom].slice(0, 12);
      // "Other" on its own carries no information, so the typed name is required.
      // With any real entry present the literal is dropped, because a finished
      // report should read "Local herbal mix" and not "Other, Local herbal mix".
      if (keptOther && !custom.length) {
        errors[field.key] = 'Enter the activity name, or choose a listed activity';
      } else {
        values[field.key] = result;
      }
      if (!errors[field.key] && !result.length) errors[field.key] = 'Select at least one activity';
      continue;
    }

    if (field.kind === 'number') {
      if (value === '' || value === null || value === undefined) {
        if (field.required) errors[field.key] = `${field.label} is required`;
        else values[field.key] = null;
        continue;
      }
      const num = Number(value);
      if (!Number.isFinite(num) || !Number.isInteger(num) || num < (field.min ?? 1)) {
        errors[field.key] = `${field.label} must be a whole number of at least ${field.min ?? 1}`;
        continue;
      }
      if (num > 100000) errors[field.key] = `${field.label} is unrealistically large`;
      values[field.key] = num;
      continue;
    }

    // A reference to a row in another table, keyed by its id. Handled separately
    // from `number` because it is optional: an unlinked record is a normal outcome,
    // not a validation failure. It also cannot fall through to the text branch
    // below -- cleanText only accepts strings, so a numeric id would be read as
    // empty and the link silently dropped on every save.
    if (field.kind === 'beneficiary') {
      if (value === '' || value === null || value === undefined) {
        values[field.key] = null;
        continue;
      }
      const num = Number(value);
      if (!Number.isFinite(num) || !Number.isInteger(num) || num < 1) {
        errors[field.key] = `${field.label} must be a valid selection`;
        continue;
      }
      if (num > 1000000000) errors[field.key] = `${field.label} is unrealistically large`;
      values[field.key] = num;
      continue;
    }

    if (field.kind === 'select') {
      const text = cleanText(value);
      if (!text) {
        if (field.required) errors[field.key] = `${field.label} is required`;
        else values[field.key] = null;
        continue;
      }
      // What this list will accept right now. A maintained list is read from storage,
      // so an admin's addition is accepted by every role the moment it is made; a list
      // the config alone defines needs no read.
      const listName = managedListName(type, field);
      const allowed = listName
        ? (stored[listName]?.length ? stored[listName] : resolveOptions(listName))
        : resolveOptions(field.options);
      // An empty list means the type declares options it never resolved, so there is
      // nothing to check against and the value is taken as given rather than refused.
      if (allowed.length && !allowed.includes(text)) {
        // Not on the list, for every role including an admin's. There is deliberately
        // no escape hatch here: an entry joins a maintained list through the add
        // endpoint, so the set of species is something the office changes on purpose
        // rather than a side effect of one form. An admin adds it, then records it.
        errors[field.key] = `${field.label} is not a valid choice`;
        continue;
      }
      // Shape rules apply to the value that is about to be written to the record,
      // whether or not it is on the list. They are checked here as well as in the add
      // endpoint because a list entry and the record's own column are separate limits:
      // a name the 80-character option table accepts can still be too long for a
      // 64-character species column.
      const rejected = optionRejection(field, text);
      if (rejected) {
        errors[field.key] = rejected;
        continue;
      }
      values[field.key] = text;
      continue;
    }

    if (field.kind === 'date') {
      const text = cleanText(value);
      if (!text) {
        if (field.required) errors[field.key] = `${field.label} is required`;
        else values[field.key] = null;
        continue;
      }
      if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) {
        errors[field.key] = `${field.label} must be a valid date`;
        continue;
      }
      values[field.key] = text;
      continue;
    }

    const text = cleanText(value);
    if (!text) {
      if (field.required) errors[field.key] = `${field.label} is required`;
      else values[field.key] = null;
      continue;
    }
    if (text.length > 160) errors[field.key] = `${field.label} is too long`;
    // A multi-line text field is free description/notes, so its first letter is
    // capitalized; single-line text stays as typed (names, medicine tags).
    values[field.key] = field.kind === 'textarea' ? capitalizeFirst(text) : text;
  }

  return { values, errors };
}

// validateRecord, given the type's managed option lists as they stand right now, so a
// value an admin has added to a list is saved by any role without a second lookup.
async function validateRecordWithLists(type, body, options) {
  const stored = await managedOptions(type);
  return validateRecord(type, body, { ...options, stored });
}

async function assertReferences(type, values) {
  if (values.beneficiary_id) {
    const [rows] = await pool.query('SELECT id FROM beneficiaries WHERE id = ?', [values.beneficiary_id]);
    if (!rows[0]) throw new HttpError(400, 'That beneficiary does not exist', { field: 'beneficiary_id' });
  }
  // Only the beneficiary link is a reference now. `treated_by` is a name from a
  // managed list rather than a user id, so it has nothing to point at: the office
  // records who did the work whether or not that person has an account.
}

// ---------------- routes ----------------

router.get('/types', auth, wrap(async (req, res) => {
  // Served with every type's managed lists already read, so the dropdowns and the
  // filters offer exactly the choices the API would accept on a save, and so an entry
  // an admin added is there on the next request rather than at the next restart.
  const stored = await Promise.all(
    Object.values(REPORT_TYPES).map(async (type) => [type.key, await managedOptions(type)])
  );
  res.json(serialiseReportTypes(Object.fromEntries(stored)));
}));

router.get('/:type/summary', auth, roles(...WRITE_ROLES), wrap(async (req, res) => {
  const type = getReportType(req.params.type);
  const { where, params } = buildWhere(type, req.query);

  const cards = [];
  for (const card of type.summary) {
    if (card.kind === 'count' && card.jsonEntries) {
      // JSON_LENGTH counts the array of one row; SUM adds them up, so a visit
      // tagged Deworming + Vaccination contributes two treatments.
      const [rows] = await pool.query(
        `SELECT COALESCE(SUM(JSON_LENGTH(${card.column})), 0) AS total
           FROM ${type.table} r ${type.joins || ''}
          ${where.length ? `WHERE ${where.join(' AND ')}` : ''}`,
        params
      );
      cards.push({ key: card.key, label: card.label, note: card.note, value: Number(rows[0].total) || 0 });
      continue;
    }
    if (card.kind === 'count') {
      const [rows] = await pool.query(
        `SELECT COUNT(*) AS total FROM ${type.table} r ${where.length ? `WHERE ${where.join(' AND ')}` : ''}`,
        params
      );
      cards.push({ key: card.key, label: card.label, note: card.note, value: Number(rows[0].total) || 0 });
      continue;
    }
    if (card.kind === 'distinct') {
      const [rows] = await pool.query(
        `SELECT COUNT(DISTINCT ${card.column}) AS total
           FROM ${type.table} r ${where.length ? `WHERE ${where.join(' AND ')}` : ''}`,
        params
      );
      cards.push({ key: card.key, label: card.label, note: card.note, value: Number(rows[0].total) || 0 });
      continue;
    }
    const [rows] = await pool.query(
      `SELECT COALESCE(SUM(${card.column}), 0) AS total
         FROM ${type.table} r ${where.length ? `WHERE ${where.join(' AND ')}` : ''}`,
      params
    );
    cards.push({ key: card.key, label: card.label, note: card.note, value: Number(rows[0].total) || 0 });
  }

  res.json(cards);
}));

router.get('/:type/export.csv', auth, roles(...WRITE_ROLES), wrap(async (req, res) => {
  const type = getReportType(req.params.type);
  const { where, params } = buildWhere(type, req.query);

  const columns = type.columns.filter((column) => column.export !== false);
  const [rows] = await pool.query(
    `${selectSql(type)} ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY ${type.defaultOrder}`,
    params
  );

  // A leading comma or quote in a cell would otherwise turn into a new column.
  const escape = (value) => {
    if (value === null || value === undefined) return '';
    const text = Array.isArray(value) ? value.join(', ') : String(value);
    return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };

  const lines = [columns.map((column) => escape(column.label)).join(',')];
  for (const row of rows.map((raw) => shapeRow(type, raw, req.user))) {
    lines.push(columns.map((column) => escape(row[column.key])).join(','));
  }

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="${type.exportFilename}.csv"`
  );
  // The BOM keeps Excel from reading UTF-8 barangay and farmer names as Latin-1.
  res.send('\uFEFF' + lines.join('\r\n'));
}));

// Typeahead for the optional beneficiary link.
//
// This mirrors GET /api/beneficiaries rather than reusing it, for two reasons: that
// route is adminOnly, which would leave a technician unable to link anyone at all,
// and it returns whole rows when all the form needs is an id and a name. Matching is
// on the name parts only -- a contact number or RSBSA number is not what someone is
// looking for while typing a farmer's name into a treatment form.
router.get('/:type/options/beneficiaries', auth, roles(...WRITE_ROLES), wrap(async (req, res) => {
  const type = getReportType(req.params.type);
  // Only a type that actually declares a reference field needs this, so a second
  // report type without one gets an empty list rather than an unused query.
  if (!type.fields.some((field) => field.kind === 'beneficiary')) return res.json([]);

  const q = cleanText(req.query.q);
  if (q.length < 2) return res.json([]);

  // The cap is applied in SQL so a broad query cannot pull the whole table back to
  // be discarded in the browser.
  const [rows] = await pool.query(
    `SELECT id, trim(concat_ws(' ', first_name, middle_name, last_name)) AS name
       FROM beneficiaries
      WHERE first_name LIKE ? OR last_name LIKE ? OR concat_ws(' ', first_name, last_name) LIKE ?
      ORDER BY last_name, first_name
      LIMIT 8`,
    [`%${q}%`, `%${q}%`, `%${q}%`]
  );

  res.json(rows.map((row) => ({
    value: row.id,
    label: row.name || `Beneficiary #${row.id}`,
  })));
}));

router.get('/:type', auth, roles(...WRITE_ROLES), wrap(async (req, res) => {
  const type = getReportType(req.params.type);
  const { where, params } = buildWhere(type, req.query);

  const page = positiveInt(req.query.page, 1, 100000);
  const pageSize = positiveInt(req.query.pageSize, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);
  const offset = (page - 1) * pageSize;

  const [[{ total }]] = await pool.query(
    `SELECT COUNT(*) AS total FROM ${type.table} r ${where.length ? `WHERE ${where.join(' AND ')}` : ''}`,
    params
  );

  // The owner check needs the signed-in id bound once more, ahead of the filter
  // parameters, because the ownership expression comes first in the SELECT list.
  const [rows] = await pool.query(
    `${selectSql(type, ownerSql(type))}
      ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
      ORDER BY ${type.defaultOrder}
      LIMIT ? OFFSET ?`,
    [req.user.id, ...params, pageSize, offset]
  );

  res.json({
    data: rows.map((row) => shapeRow(type, row, req.user)),
    page,
    pageSize,
    total: Number(total) || 0,
    pageCount: Math.max(1, Math.ceil((Number(total) || 0) / pageSize)),
  });
}));

// Managing a maintained option list: adding an entry and removing one.
//
// Admin only, and separate from saving a record. Keeping the two apart is what makes
// the list something the office curates: a value recorded by hand on one form does
// not silently become part of the vocabulary, and an entry leaves only because
// somebody removed it.
//
// Only a list the config marks `managed` can be touched, and only the roles that may
// add an entry to the matching field may change it. The role is read from the session
// rather than taken from the request.
router.post('/:type/options', auth, roles(...ADMIN_ROLES), wrap(async (req, res) => {
  const type = getReportType(req.params.type);
  const list = cleanText(req.body?.list);
  const value = cleanText(req.body?.value);
  const field = type.fields.find((candidate) => managedListName(type, candidate) === list);

  if (!field) throw new HttpError(400, 'That list is not maintained here');
  if (!(field.customRoles || []).includes(req.user.role)) {
    throw new HttpError(403, 'You cannot add to that list');
  }
  if (!value) throw new HttpError(400, 'Enter a name');
  const rejection = optionRejection(field, value);
  if (rejection) throw new HttpError(400, rejection);

  // Appended rather than slotted in: the list is read in stored order and an entry
  // belongs at the end until somebody decides otherwise. A duplicate is not an error,
  // so a retry of the same add does not fail.
  //
  // The next sort_order is read rather than computed in the INSERT. A statement cannot
  // read the table it is writing into, and the alternative -- a subquery over the
  // target -- is rejected outright.
  const [[{ next: nextOrder }]] = await pool.query(
    `SELECT COALESCE(MAX(sort_order), 0) + 10 AS next FROM ${OPTION_TABLE} WHERE list_name = ?`,
    [list]
  );
  await pool.query(
    `INSERT IGNORE INTO ${OPTION_TABLE} (list_name, value, sort_order) VALUES (?, ?, ?)`,
    [list, value, Number(nextOrder) || 10]
  );

  res.status(201).json({ ok: true, list, value });
}));

// How many records would be left holding a value that is no longer on the list. Read
// before the delete so the warning can say what it costs rather than just that it
// warns: the records keep the value, but it can no longer be picked in the form or
// selected in the filter.
router.get('/:type/options/usage', auth, roles(...WRITE_ROLES), wrap(async (req, res) => {
  const type = getReportType(req.params.type);
  const list = cleanText(req.query.list);
  const value = cleanText(req.query.value);
  const field = type.fields.find((candidate) => managedListName(type, candidate) === list);
  if (!field) return res.json({ inUse: 0 });

  const column = type.columns.find((column) => column.key === field.key)?.source;
  if (!column) return res.json({ inUse: 0 });

  const [[{ total }]] = await pool.query(
    `SELECT COUNT(*) AS total FROM ${type.table} r WHERE ${column} = ?`,
    [value]
  );
  res.json({ inUse: Number(total) || 0 });
}));

router.delete('/:type/options', auth, roles(...ADMIN_ROLES), wrap(async (req, res) => {
  const type = getReportType(req.params.type);
  const list = cleanText(req.query.list);
  const value = cleanText(req.query.value);
  const field = type.fields.find((candidate) => managedListName(type, candidate) === list);

  if (!field) throw new HttpError(400, 'That list is not maintained here');
  if (!(field.customRoles || []).includes(req.user.role)) {
    throw new HttpError(403, 'You cannot remove from that list');
  }

  // Removing the entry does not touch the records that carry it. They keep saying what
  // they said; the value simply stops being offered, and the count is returned so the
  // caller can say how many rows are affected rather than implying the data changed.
  const [result] = await pool.query(
    `DELETE FROM ${OPTION_TABLE} WHERE list_name = ? AND value = ?`,
    [list, value]
  );
  res.json({ ok: true, removed: result.affectedRows, list, value });
}));

router.post('/:type', auth, roles(...WRITE_ROLES), idempotent(), wrap(async (req, res) => {
  const type = getReportType(req.params.type);
  const { values, errors } = await validateRecordWithLists(type, req.body || {});

  if (Object.keys(errors).length) throw new HttpError(400, 'Please correct the highlighted fields', errors);
  await assertReferences(type, values);

  const keys = Object.keys(values).filter((key) => values[key] !== undefined);
  // created_by is set from the session, never the body, so ownership cannot be
  // forged by a technician posting someone else's id.
  keys.unshift('created_by');
  values.created_by = req.user.id;
  const [result] = await pool.query(
    `INSERT INTO ${type.table} (${keys.map((k) => `\`${k}\``).join(', ')})
     VALUES (${keys.map(() => '?').join(', ')})`,
    keys.map((key) => (key === 'activity' ? JSON.stringify(values[key]) : values[key]))
  );

  res.status(201).json({ id: result.insertId });
}));

router.put('/:type/:id', auth, roles(...WRITE_ROLES), idempotent(), wrap(async (req, res) => {
  const type = getReportType(req.params.type);
  const id = Number.parseInt(req.params.id, 10);
  if (!Number.isInteger(id) || id < 1) throw new HttpError(400, 'Invalid record id');

  const [existing] = await pool.query(
    `SELECT id FROM ${type.table} r WHERE r.id = ?`,
    [id]
  );
  if (!existing[0]) throw new HttpError(404, 'Record not found');

  const { values, errors } = await validateRecordWithLists(type, req.body || {}, { partial: true });

  if (req.user.role === 'technician') {
    // Confirm ownership before anything else, and never let the body move the
    // record to another technician.
    const [owned] = await pool.query(
      `SELECT 1 FROM ${type.table} r WHERE r.id = ? AND r.${type.ownerColumn} = ?`,
      [id, req.user.id]
    );
    if (!owned[0]) throw new HttpError(403, 'You can only edit records you created');
  }

  if (Object.keys(errors).length) throw new HttpError(400, 'Please correct the highlighted fields', errors);
  await assertReferences(type, values);

  const keys = Object.keys(values).filter((key) => values[key] !== undefined);
  if (keys.length) {
    await pool.query(
      `UPDATE ${type.table} SET ${keys.map((k) => `\`${k}\` = ?`).join(', ')} WHERE id = ?`,
      keys.map((key) => (key === 'activity' ? JSON.stringify(values[key]) : values[key])).concat(id)
    );
  }

  res.json({ ok: true, id });
}));

router.delete('/:type/:id', auth, roles(...ADMIN_ROLES), wrap(async (req, res) => {
  const type = getReportType(req.params.type);
  const id = Number.parseInt(req.params.id, 10);
  if (!Number.isInteger(id) || id < 1) throw new HttpError(400, 'Invalid record id');

  const [result] = await pool.query(`DELETE FROM ${type.table} WHERE id = ?`, [id]);
  if (!result.affectedRows) throw new HttpError(404, 'Record not found');
  res.json({ ok: true });
}));

export default router;