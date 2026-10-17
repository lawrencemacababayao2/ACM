import { pool } from '../config/db.js';

// Migrations live in server/migrations/*.sql and are applied by hand, but a
// deploy does not run them. A server pointed at a database that predates a
// column then only finds out when an admin publishes and the write blows up.
// These checks make the columns the running code depends on self-heal on
// startup. Each one is idempotent and mirrors the matching migration file.

async function columnExists(table, column) {
  const [rows] = await pool.query(
    `SELECT COUNT(*) AS n FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [table, column]
  );
  return rows[0].n > 0;
}

async function ensureColumn(table, column, definition) {
  if (await columnExists(table, column)) return false;
  await pool.query(`ALTER TABLE \`${table}\` ADD COLUMN ${definition}`);
  console.log(`[schema] added ${table}.${column}`);
  return true;
}

export async function ensureSchema() {
  // Migration 028 - per-type publish tracking (notified_types).
  await ensureColumn('announcements', 'notified_types', 'notified_types JSON NULL AFTER notified');
  await ensureColumn('programs', 'notified_types', 'notified_types JSON NULL AFTER notified');
  await ensureColumn('trainings', 'notified_types', 'notified_types JSON NULL AFTER notified');
  // Rows published before the column existed were announced to their whole
  // audience, so backfill them the way the migration does.
  await pool.query('UPDATE announcements SET notified_types = target_beneficiary_types WHERE notified = 1 AND notified_types IS NULL');
  await pool.query('UPDATE programs SET notified_types = target_beneficiary_types WHERE notified = 1 AND notified_types IS NULL');
  await pool.query('UPDATE trainings SET notified_types = target_beneficiary_types WHERE notified = 1 AND notified_types IS NULL');
}
