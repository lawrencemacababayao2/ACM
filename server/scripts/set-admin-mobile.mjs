// Backfills the seed Super Admin's mobile number so it can sign in by mobile
// right after the mobile-login migration, as requested. The value comes from the
// ADMIN_MOBILE env var (or the first CLI argument), because it is account data,
// not code.
//
// Usage:
//   $env:ADMIN_MOBILE='09262879243'; node scripts/set-admin-mobile.mjs
//   node scripts/set-admin-mobile.mjs 09262879243
//
// Shows the before/after roster of admin accounts. Idempotent: running it again
// with the same number is a no-op that just prints the roster.
import 'dotenv/config';
import mysql from 'mysql2/promise';

const MOBILE_RE = /^09\d{9}$/;

function db() {
  return mysql.createConnection({
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'acm',
  });
}

const mobile = (process.argv[2] || process.env.ADMIN_MOBILE || '').trim();
if (!mobile) {
  console.error('usage: node scripts/set-admin-mobile.mjs <09262879243>  (or set ADMIN_MOBILE)');
  process.exit(1);
}
if (!MOBILE_RE.test(mobile)) {
  console.error('invalid mobile; expected a Philippine number in 09XXXXXXXXX form');
  process.exit(1);
}

const conn = await db();
try {
  const list = () => conn.query(
    `SELECT id, first_name, last_name, email, mobile_number, role, is_active
     FROM users WHERE role IN ('admin', 'super_admin')
     ORDER BY FIELD(role, 'super_admin', 'admin'), id`
  ).then(([r]) => r);

  console.log('BEFORE:');
  console.table((await list()).map((r) => ({ ...r, mobile_number: r.mobile_number || '' })));

  // The account that owns this number. The seed Super Admin is the well-known
  // admin@mao.gov.ph account; anything else picks the first Super Admin.
  const [seed] = await conn.query(
    `SELECT id FROM users
     WHERE role = 'super_admin'
     ORDER BY (email = 'admin@mao.gov.ph') DESC, id LIMIT 1`
  );
  if (!seed) {
    console.error('no Super Admin account found; nothing to do');
    process.exit(1);
  }

  // mobile_number is UNIQUE across users, so another account holding the same
  // digits has to release it first. It keeps its email login; the mobile login
  // belongs to the Super Admin now.
  await conn.query(
    'UPDATE users SET mobile_number = NULL WHERE id <> ? AND mobile_number = ?',
    [seed.id, mobile]
  );

  await conn.query('UPDATE users SET mobile_number = ? WHERE id = ?', [mobile, seed.id]);

  console.log('AFTER:');
  console.table((await list()).map((r) => ({ ...r, mobile_number: r.mobile_number || '' })));
  console.log('Super Admin can now sign in by mobile:', mobile);
} finally {
  await conn.end();
}