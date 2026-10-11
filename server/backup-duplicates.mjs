// server/backup-duplicates.mjs
//
// Authoritative pass for migration 016. The SQL file can only lower-case and
// strip digits; this script recomputes the normalized duplicate columns with the
// real app rules (accents stripped, name punctuation removed, +63 phones
// collapsed) so the store and the app can never disagree, then:
//
//   1. fixes any drift in the normalized columns,
//   2. writes a duplicate report to backups/duplicates_<stamp>.{sql,csv},
//   3. adds the conditional UNIQUE indexes, skipping each one whose values still
//      contain duplicate groups and leaving a TODO marker in the report.
//
// Idempotent: safe to re-run after de-duplicating records. Read-write, unlike
// the read-only dump scripts.
//
// Run:  node server/backup-duplicates.mjs
// (after: node run-migration.mjs server/migrations/016_duplicate_normalization.sql)
import fs from 'node:fs/promises';
import path from 'node:path';
import mysql from 'mysql2/promise';
// Import the exact production rules so this script's output is definitionally in
// sync with what the API compares. otp.js is safe to import here: nothing sends
// anything at import time.
import { normalizeName, nameKey, normalizeRsbsa, normalizeEmail } from './src/lib/normalize.js';
import { normalizeMobile } from './src/services/otp.js';

const ROOT = path.resolve(import.meta.dirname, '..');
const BACKUP_DIR = path.join(ROOT, 'backups');
const STAMP = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '');

const c = await mysql.createConnection({
  host: '127.0.0.1', user: 'root', password: '', database: 'acm', dateStrings: true,
});
await fs.mkdir(BACKUP_DIR, { recursive: true });

function sqlLiteral(value) {
  if (value === null || value === undefined) return 'NULL';
  if (value instanceof Date) return `'${value.toISOString().slice(0, 19).replace('T', ' ')}'`;
  if (typeof value === 'number') return String(value);
  if (typeof value === 'boolean') return value ? '1' : '0';
  if (Buffer.isBuffer(value)) return `X'${value.toString('hex')}'`;
  return `'${String(value).replace(/\\/g, '\\\\').replace(/'/g, "''")}'`;
}

function csvCell(value) {
  if (value === null || value === undefined) return '';
  const text = Buffer.isBuffer(value) ? value.toString('hex') : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

async function columnExists(table, column) {
  const [rows] = await c.query(
    `SELECT COUNT(*) AS n FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [table, column]
  );
  return Number(rows[0].n) > 0;
}

async function ensureColumn(table, column, ddl) {
  if (await columnExists(table, column)) return false;
  await c.query(`ALTER TABLE \`${table}\` ADD COLUMN \`${column}\` ${ddl}`);
  return true;
}

console.log('step 1/3: ensure normalized columns');
const added = [];
if (await ensureColumn('beneficiaries', 'name_key', 'VARCHAR(340) NULL')) added.push('beneficiaries.name_key');
if (await ensureColumn('beneficiaries', 'mobile_normalized', 'VARCHAR(20) NULL')) added.push('beneficiaries.mobile_normalized');
if (await ensureColumn('beneficiaries', 'rsbsa_normalized', 'VARCHAR(60) NULL')) added.push('beneficiaries.rsbsa_normalized');
if (await ensureColumn('users', 'email_normalized', 'VARCHAR(255) NULL')) added.push('users.email_normalized');
if (await ensureColumn('users', 'mobile_normalized', 'VARCHAR(20) NULL')) added.push('users.mobile_normalized');
console.log(added.length ? `  added: ${added.join(', ')}` : '  all present');

console.log('step 2/3: exact backfill (app rules)');
let fixed = 0;

const [beneficiaries] = await c.query(
  `SELECT b.id, b.first_name, b.middle_name, b.last_name, b.suffix,
          b.name_key, b.rsbsa_normalized, b.mobile_normalized,
          b.rsbsa_number, b.contact_number, u.mobile_number AS account_mobile
   FROM beneficiaries b
   LEFT JOIN users u ON u.id = b.user_id`
);
for (const r of beneficiaries) {
  const name_key = nameKey(r);
  const rsbsa_normalized = r.rsbsa_number ? normalizeRsbsa(r.rsbsa_number) : null;
  const rawMobile = r.account_mobile || r.contact_number;
  const mobile_normalized = rawMobile ? normalizeMobile(rawMobile) : null;
  if (
    r.name_key !== name_key
    || (r.rsbsa_normalized ?? null) !== rsbsa_normalized
    || (r.mobile_normalized ?? null) !== mobile_normalized
  ) {
    await c.query(
      'UPDATE beneficiaries SET name_key = ?, rsbsa_normalized = ?, mobile_normalized = ? WHERE id = ?',
      [name_key, rsbsa_normalized, mobile_normalized, r.id]
    );
    fixed += 1;
  }
}

const [users] = await c.query(
  'SELECT id, email, mobile_number, email_normalized, mobile_normalized FROM users'
);
for (const r of users) {
  const email_normalized = r.email ? normalizeEmail(r.email) : null;
  const mobile_normalized = r.mobile_number ? normalizeMobile(r.mobile_number) : null;
  if (
    (r.email_normalized ?? null) !== email_normalized
    || (r.mobile_normalized ?? null) !== mobile_normalized
  ) {
    await c.query(
      'UPDATE users SET email_normalized = ?, mobile_normalized = ? WHERE id = ?',
      [email_normalized, mobile_normalized, r.id]
    );
    fixed += 1;
  }
}
console.log(`  fixed ${fixed} row(s)`);

// ---------------------------------------------------------------- report + indexes
const INDEXES = [
  {
    table: 'beneficiaries', name: 'uq_beneficiaries_rsbsa_normalized', columns: ['rsbsa_normalized'],
    whereExclude: "rsbsa_normalized IS NOT NULL AND rsbsa_normalized <> ''",
  },
  {
    table: 'beneficiaries', name: 'uq_beneficiaries_mobile_normalized', columns: ['mobile_normalized'],
    whereExclude: "mobile_normalized IS NOT NULL AND mobile_normalized <> ''",
  },
  {
    table: 'beneficiaries', name: 'uq_beneficiaries_name_birthday', columns: ['name_key', 'birthday'],
    whereExclude: "name_key IS NOT NULL AND name_key <> '' AND birthday IS NOT NULL",
  },
  {
    table: 'users', name: 'uq_users_email_normalized', columns: ['email_normalized'],
    whereExclude: "email_normalized IS NOT NULL AND email_normalized <> ''",
  },
  {
    table: 'users', name: 'uq_users_mobile_normalized', columns: ['mobile_normalized'],
    whereExclude: "mobile_normalized IS NOT NULL AND mobile_normalized <> ''",
  },
];

async function indexExists(table, name) {
  const [rows] = await c.query(
    `SELECT COUNT(*) AS n FROM information_schema.STATISTICS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = ?`,
    [table, name]
  );
  return Number(rows[0].n) > 0;
}

console.log('step 3/3: duplicate report + conditional unique indexes');
const report = [];
const csvRows = [
  ['index', 'table', 'duplicate_key', 'group_size', 'ids', 'action'],
];
const todo = [];

for (const ix of INDEXES) {
  const cols = ix.columns.map((x) => `\`${x}\``).join(', ');
  const [groups] = await c.query(
    `SELECT ${cols}, COUNT(*) AS n, GROUP_CONCAT(id ORDER BY id) AS ids
       FROM \`${ix.table}\`
      WHERE ${ix.whereExclude}
      GROUP BY ${cols}
      HAVING COUNT(*) > 1`,
    []
  );
  const nGroups = groups.length;
  const exists = await indexExists(ix.table, ix.name);

  let action;
  if (exists) {
    action = 'index already present';
  } else if (nGroups > 0) {
    action = `skipped: ${nGroups} duplicate group(s) to resolve`;
    todo.push(ix);
  } else {
    await c.query(`ALTER TABLE \`${ix.table}\` ADD UNIQUE INDEX \`${ix.name}\` (${cols})`);
    action = 'index created';
  }

  report.push(`-- [${ix.name}] ${action}`);
  for (const g of groups) {
    const key = ix.columns.map((col) => g[col]).join(' | ') || '(empty)';
    report.push(`--   duplicate key ${key} (${g.n} rows, ids ${g.ids})`);
    csvRows.push([
      ix.name, ix.table, key, String(g.n), String(g.ids), action,
    ]);
  }
  console.log(`  ${ix.name}: ${action}`);
}

for (const ix of todo) {
  const cols = ix.columns.map((x) => `\`${x}\``).join(', ');
  report.push(
    `-- TODO: resolve the ${ix.name} duplicates above, then add the index with:`,
    `--   ALTER TABLE \`${ix.table}\` ADD UNIQUE INDEX \`${ix.name}\` (${cols});`
  );
}

if (todo.length) {
  console.error(`\nNOTE: ${todo.length} index(es) left off. Resolve the duplicate groups listed in the report, then re-run this script.`);
}

// ------------------------------------------------------------------ written files
const sqlBody = [
  '-- Duplicate normalization report',
  `-- Database: acm`,
  `-- Taken: ${new Date().toISOString()}`,
  `-- Columns backfilled: ${fixed} row(s)`,
  '--',
  '-- Each block lists the duplicate groups found per prospective unique index.',
  '-- Indexes without duplicate groups were created by this script; the rest were',
  '-- skipped and carry a TODO marker. Resolving the groups and re-running this',
  '-- script adds the remaining indexes.',
  '',
  ...report,
  '',
].join('\n');
const sqlFile = path.join(BACKUP_DIR, `duplicates_${STAMP}.sql`);
await fs.writeFile(sqlFile, sqlBody, 'utf8');

const csv = csvRows.map((r) => r.map(csvCell).join(',')).join('\n') + '\n';
const csvFile = path.join(BACKUP_DIR, `duplicates_${STAMP}.csv`);
await fs.writeFile(csvFile, csv, 'utf8');

await c.end();

// Re-read the artefacts so truncation is caught here rather than later.
console.log('\nverification:');
for (const file of [sqlFile, csvFile]) {
  const stat = await fs.stat(file);
  const body = await fs.readFile(file, 'utf8');
  if (stat.size === 0) throw new Error(`report file is empty: ${file}`);
  console.log(`  ${path.relative(ROOT, file)}  ${stat.size} bytes  ${body.split('\n').length} lines`);
}
console.log(added.length ? `\nadded columns: ${added.join(', ')}` : '\nno columns added');
console.log(`backfilled: ${fixed} row(s)`);
console.log('backup-duplicates complete');