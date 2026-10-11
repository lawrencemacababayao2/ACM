// Dumps the legacy report_records table to /backups as both a re-runnable SQL
// script and a CSV, so the rows can be restored even after the table is dropped.
// Read-only: it never mutates the database.
import fs from 'node:fs/promises';
import path from 'node:path';
import mysql from 'mysql2/promise';

const ROOT = path.resolve(import.meta.dirname, '..');
const BACKUP_DIR = path.join(ROOT, 'backups');
const STAMP = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '');

const TABLES = ['report_records'];

const c = await mysql.createConnection({
  host: '127.0.0.1', user: 'root', password: '', database: 'acm', dateStrings: true,
});

await fs.mkdir(BACKUP_DIR, { recursive: true });

function pad(value, size = 2) {
  return String(value).padStart(size, '0');
}

// The dump connection sets `dateStrings: true` so DATE / DATETIME / TIMESTAMP
// arrive as the exact SQL text MySQL stores. Without it mysql2 builds JS Date
// objects and applies the connection timezone, and String(date) produces
// "Fri Oct 04 2026 ...", which MySQL truncates to a zero date or NULL. The
// local-timezone hop is the reason an earlier dump silently lost report_date
// and created_at, so the conversion is disabled at the driver rather than
// reimplemented here.
function sqlLiteral(value) {
  if (value === null || value === undefined) return 'NULL';
  if (value instanceof Date) {
    throw new Error('unexpected Date value; run the dump with dateStrings enabled');
  }
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

const written = [];
const counts = {};

for (const table of TABLES) {
  const [exists] = await c.query(
    `SELECT COUNT(*) AS n FROM information_schema.tables
      WHERE table_schema = DATABASE() AND table_name = ?`,
    [table]
  );
  if (!exists[0].n) {
    console.log(`skip ${table}: table not present`);
    continue;
  }

  const [rows] = await c.query(`SELECT * FROM \`${table}\` ORDER BY 1`);
  const columns = rows.length ? Object.keys(rows[0]) : [];
  counts[table] = rows.length;

  const sqlFile = path.join(BACKUP_DIR, `${table}_${STAMP}.sql`);

  // Reuse the live table's own DDL so the dump can be restored standalone: a
  // hand-written skeleton would not match the column list used below.
  const [ddlRows] = await c.query(`SHOW CREATE TABLE \`${table}\``);
  const createSql = ddlRows[0]['Create Table'];

  const header = `-- Legacy backup of \`${table}\`\n`
    + `-- Database: acm\n`
    + `-- Taken: ${new Date().toISOString()}\n`
    + `-- Rows: ${rows.length}\n`
    + '-- Restore with:\n'
    + '--   CREATE DATABASE acm_report_backup_restore;\n'
    + `--   mysql acm_report_backup_restore < ${path.basename(sqlFile)}\n`
    + '-- Restoring re-creates the table and re-inserts every row.\n\n'
    + `DROP TABLE IF EXISTS \`${table}\`;\n\n`
    + `${createSql};\n\n`
    + 'INSERT INTO `' + table + '` (' + columns.map((col) => `\`${col}\``).join(', ') + ') VALUES\n'
    + rows
      .map((row) => '  (' + columns.map((col) => sqlLiteral(row[col])).join(', ') + ')')
      .join(',\n')
    + (rows.length ? ';' : '')
    + '\n';

  await fs.writeFile(sqlFile, header, 'utf8');
  written.push(sqlFile);

  const csv = [columns.join(',')]
    .concat(rows.map((row) => columns.map((col) => csvCell(row[col])).join(',')))
    .join('\n') + '\n';
  const csvFile = path.join(BACKUP_DIR, `${table}_${STAMP}.csv`);
  await fs.writeFile(csvFile, csv, 'utf8');
  written.push(csvFile);

  console.log(`${table}: ${rows.length} row(s)`);
  for (const row of rows) console.log('   ', JSON.stringify(row));
}

await c.end();

// Re-read every artefact so a truncated or empty file is caught here rather
// than discovered after the table has been dropped.
console.log('\nverification:');
for (const file of written) {
  const stat = await fs.stat(file);
  const body = await fs.readFile(file, 'utf8');
  console.log(
    `  ${path.relative(ROOT, file)}  ${stat.size} bytes  ` +
    `${body.split('\n').length} lines`
  );
  if (stat.size === 0) throw new Error(`backup file is empty: ${file}`);
}
console.log('\ntotals:', JSON.stringify(counts));
console.log('backup complete');