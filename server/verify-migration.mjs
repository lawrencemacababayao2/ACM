// Post-migration verification: column shape, backfilled values, and that the
// derived legacy column agrees with the JSON list.
import mysql from 'mysql2/promise';

const conn = await mysql.createConnection({
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'acm',
});

const [cols] = await conn.query(
  `SELECT TABLE_NAME, COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE
   FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = 'acm'
     AND TABLE_NAME IN ('announcements','programs','trainings')
     AND COLUMN_NAME IN ('target_type','target_beneficiary_types')
   ORDER BY TABLE_NAME, ORDINAL_POSITION`
);
console.log('-- columns --');
console.table(cols);

for (const table of ['announcements', 'programs', 'trainings']) {
  const [rows] = await conn.query(
    `SELECT id, target_type, target_beneficiary_types FROM ${table} ORDER BY id`
  );
  console.log(`-- ${table} --`);
  console.table(rows);
}

// The JSON_CONTAINS filter the GET routes rely on.
const [f] = await conn.query(
  `SELECT id, title, target_type, target_beneficiary_types FROM announcements
   WHERE JSON_CONTAINS(target_beneficiary_types, JSON_QUOTE('farmer'))`
);
console.log('-- filter ?target=farmer --');
console.table(f);

const [g] = await conn.query(
  `SELECT id, title FROM announcements
   WHERE JSON_CONTAINS(target_beneficiary_types, JSON_QUOTE('fisherfolk'))`
);
console.log('-- filter ?target=fisherfolk --');
console.table(g);

// The fan-out query shape used by sms.js/push.js.
const [hits] = await conn.query(
  `SELECT id, beneficiary_type, category FROM beneficiaries
   WHERE status = 'verified'
     AND (beneficiary_type IN (?, ?) OR category IN (?, ?))`,
  ['farmer', 'fisherfolk', 'farmer', 'fisherfolk']
);
console.log('-- fan-out for [farmer, fisherfolk] --');
console.table(hits);

const [allHits] = await conn.query(`SELECT COUNT(*) AS c FROM beneficiaries WHERE status = 'verified'`);
console.log('-- verified total (what "all" reaches) --', allHits[0].c);

await conn.end();