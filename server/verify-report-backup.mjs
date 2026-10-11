// Proves the backup is genuinely restorable: replays the generated SQL dump into
// a scratch database and diffs every row against the live table. Operates only on
// `acm_backup_verify`, never on the real `acm` database.
import fs from 'node:fs/promises';
import path from 'node:path';
import mysql from 'mysql2/promise';

const ROOT = path.resolve(import.meta.dirname, '..');
const BACKUP_DIR = path.join(ROOT, 'backups');
const SCRATCH = 'acm_backup_verify';
const TABLE = 'report_records';

if (process.argv.includes('--acm')) {
  throw new Error('refusing to run: this verifier only touches ' + SCRATCH);
}

const files = (await fs.readdir(BACKUP_DIR))
  .filter((name) => name.startsWith(`${TABLE}_`) && name.endsWith('.sql'))
  .sort();
if (!files.length) throw new Error('no backup dump found in ' + BACKUP_DIR);

const dumpFile = path.join(BACKUP_DIR, files.at(-1));
const dump = await fs.readFile(dumpFile, 'utf8');
console.log('replaying', path.relative(ROOT, dumpFile), `(${dump.length} bytes)`);

// dateStrings keeps both sides as raw SQL text so the diff compares what
// MySQL actually stores rather than two driver-side timezone conversions.
const c = await mysql.createConnection({
  host: '127.0.0.1', user: 'root', password: '', dateStrings: true,
});

const [live] = await c.query(`SELECT * FROM \`acm\`.\`${TABLE}\` ORDER BY id`);

await c.query(`DROP DATABASE IF EXISTS \`${SCRATCH}\``);
await c.query(`CREATE DATABASE \`${SCRATCH}\``);
await c.query(`USE \`${SCRATCH}\``);

// Comment lines are documentation for a human reading the dump, not statements,
// so they are stripped before the dump is replayed statement by statement.
const statements = dump
  .split('\n')
  .filter((line) => !line.trimStart().startsWith('--'))
  .join('\n')
  .split(/;\s*\r?\n/)
  .map((s) => s.trim())
  .filter(Boolean);

for (const statement of statements) {
  await c.query(statement.replace(/;$/, ''));
}

const [restored] = await c.query(`SELECT * FROM \`${SCRATCH}\`.\`${TABLE}\` ORDER BY id`);

const liveJson = JSON.stringify(live);
const restoredJson = JSON.stringify(restored);
console.log(`live rows:    ${live.length}`);
console.log(`restored rows: ${restored.length}`);

if (liveJson !== restoredJson) {
  console.error('MISMATCH');
  console.error('live:    ', liveJson);
  console.error('restored:', restoredJson);
  process.exitCode = 1;
} else {
  console.log('RESULT: restore is byte-identical to the live table');
}

const [csvFiles] = await fs.readdir(BACKUP_DIR).then((names) => [names]);
const csvName = csvFiles.filter((n) => n.startsWith(`${TABLE}_`) && n.endsWith('.csv')).sort().at(-1);
const csv = await fs.readFile(path.join(BACKUP_DIR, csvName), 'utf8');
const csvLines = csv.trim().split('\n');
console.log(`CSV: ${path.relative(ROOT, path.join(BACKUP_DIR, csvName))} -> ${csvLines.length - 1} data row(s)`);
if (csvLines.length - 1 !== live.length) {
  console.error('CSV row count does not match');
  process.exitCode = 1;
}

await c.query(`DROP DATABASE IF EXISTS \`${SCRATCH}\``);
console.log('scratch database dropped');
if (!process.exitCode) console.log('backup verified');