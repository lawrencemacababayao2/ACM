// Imports server/schema.sql into a throwaway database, to prove a fresh install
// still works. Usage: node verify-schema-install.mjs
//
// schema.sql begins with `CREATE DATABASE IF NOT EXISTS acm` and `USE acm`, so it
// would otherwise drop and recreate the *real* database. Those lines are stripped
// and replaced with a USE of the scratch name before the file is run -- the
// in-file DROP TABLE statements are exactly what makes this check worth doing,
// so they have to stay aimed somewhere disposable.
import fs from 'node:fs';
import mysql from 'mysql2/promise';

const SCRATCH = 'acm_schema_check';
const DB_NAME = 'acm';

const base = {
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
};

const root = await mysql.createConnection({ ...base, multipleStatements: true });
await root.query(`DROP DATABASE IF EXISTS ${SCRATCH}`);
await root.query(`CREATE DATABASE ${SCRATCH} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
await root.end();

const conn = await mysql.createConnection({ ...base, database: SCRATCH, multipleStatements: true });

const raw = fs.readFileSync('./schema.sql', 'utf8');
const rewritten = raw
  .replace(/CREATE\s+DATABASE[^;]*;/gi, '-- [neutralised] database-creation statement')
  .replace(/^\s*USE\s+\w+\s*;.*$/gim, `USE ${SCRATCH};`);

// Guard on executable statements only, so a comment mentioning the name is fine.
// The name test needs a word boundary: a plain substring check would flag the
// scratch name "acm_schema_check" because it starts with "acm".
const executable = rewritten
  .split('\n')
  .filter((l) => !l.trim().startsWith('--'))
  .join('\n');

const stillTargetsReal =
  new RegExp(`\\bUSE\\s+\`?${DB_NAME}\`?\\s*;`, 'i').test(executable)
  || /\bCREATE\s+DATABASE/i.test(executable);

if (stillTargetsReal) {
  console.error('refusing to run: schema.sql still targets the real database');
  await conn.query(`DROP DATABASE IF EXISTS ${SCRATCH}`);
  await conn.end();
  process.exit(1);
}
console.log(`importing schema.sql into scratch database "${SCRATCH}" (real "${DB_NAME}" untouched)`);

let failed = false;
try {
  await conn.query(rewritten);
  console.log('schema.sql imported cleanly into a fresh database');
} catch (err) {
  failed = true;
  console.log(`schema.sql FAILED on a fresh import:\n  ${err.sqlMessage || err.message}`);
}

if (!failed) {
  for (const t of ['announcements', 'programs', 'trainings']) {
    const [rows] = await conn.query(
      `SELECT id, target_type, target_beneficiary_types FROM ${t} ORDER BY id`
    );
    console.log(`\n  ${t}`);
    for (const r of rows) {
      console.log(`    id=${r.id} target_type=${r.target_type} types=${r.target_beneficiary_types}`);
    }
  }
  const [c] = await conn.query('SELECT COUNT(*) AS n FROM beneficiaries');
  const [u] = await conn.query('SELECT COUNT(*) AS n FROM users');
  console.log(`\n  beneficiaries seeded: ${c[0].n}`);
  console.log(`  users seeded: ${u[0].n}`);
}

await conn.query(`DROP DATABASE IF EXISTS ${SCRATCH}`);
await conn.end();
process.exitCode = failed ? 1 : 0;