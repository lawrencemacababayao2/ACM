// Restores the acm database from schema.sql, which is the canonical source for
// both the tables and the seed data.
//
// This DROPS and recreates every table in `acm`, so it is destructive by design
// and only safe to run when the database is empty or disposable. It prints a
// confirmation of what it is about to do and refuses unless --yes is passed.
import fs from 'node:fs';
import mysql from 'mysql2/promise';

const DB = process.env.DB_NAME || 'acm';
if (!process.argv.includes('--yes')) {
  console.error(`refusing to run: this drops and recreates every table in "${DB}".`);
  console.error('re-run with --yes once you are sure that database is disposable.');
  process.exit(1);
}

const conn = await mysql.createConnection({
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  multipleStatements: true,
});

const [before] = await conn.query(
  `SELECT COUNT(*) AS tables_n FROM information_schema.TABLES WHERE TABLE_SCHEMA = ?`,
  [DB]
);
const [rowsBefore] = await conn.query(
  `SELECT COALESCE(SUM(TABLE_ROWS), 0) AS approx_rows FROM information_schema.TABLES WHERE TABLE_SCHEMA = ?`,
  [DB]
);
console.log(`about to rebuild "${DB}" (${before[0].tables_n} tables, ~${rowsBefore[0].approx_rows} rows will be lost)`);

const sql = fs.readFileSync('./schema.sql', 'utf8');
await conn.query(sql);
console.log('schema + seed imported');

// Show what came back.
for (const t of ['users', 'beneficiaries', 'announcements', 'programs', 'trainings', 'faqs']) {
  const [r] = await conn.query(`SELECT COUNT(*) AS n FROM \`${t}\``);
  console.log(`  ${t.padEnd(16)} ${r[0].n}`);
}

const [targets] = await conn.query(
  `SELECT 'announcements' AS t, id, target_type, target_beneficiary_types FROM announcements
   UNION ALL SELECT 'programs', id, target_type, target_beneficiary_types FROM programs
   UNION ALL SELECT 'trainings', id, target_type, target_beneficiary_types FROM trainings
   ORDER BY t, id`
);
console.log('\n  target columns after restore:');
for (const r of targets) {
  console.log(`    ${r.t.padEnd(14)} id=${r.id} target_type=${r.target_type} types=${r.target_beneficiary_types}`);
}

await conn.end();