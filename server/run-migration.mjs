// Applies a migration file over the project's own mysql2 driver, for machines
// with no `mysql` client on PATH. Equivalent to:
//   mysql -u root -p acm < server/migrations/009_target_beneficiary_types.sql
// Usage: node run-migration.mjs <path-to-sql>
import fs from 'node:fs';
import path from 'node:path';
import mysql from 'mysql2/promise';

const file = process.argv[2];
if (!file) {
  console.error('usage: node run-migration.mjs <sql-file>');
  process.exit(1);
}

// db.js builds its pool without multipleStatements, and the migration files need
// them (multiple statements plus the PREPARE/EXECUTE pairs), so this opens its
// own connection rather than borrowing that one.
const conn = await mysql.createConnection({
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'acm',
  multipleStatements: true,
});

try {
  const sql = fs.readFileSync(file, 'utf8');
  const results = await conn.query(sql);
  // The trailing SELECTs are the file's own post-condition report.
  for (const r of results) {
    if (Array.isArray(r) && r.length) console.table(r);
  }
  console.log('migration applied:', path.basename(file));
} catch (err) {
  console.error('migration FAILED:', err.message);
  process.exitCode = 1;
} finally {
  await conn.end();
}