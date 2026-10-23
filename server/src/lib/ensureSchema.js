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
  await ensureColumn('users', 'profile_pic', 'profile_pic MEDIUMTEXT NULL');
  // Rows published before the column existed were announced to their whole
  // audience, so backfill them the way the migration does.
  await pool.query('UPDATE announcements SET notified_types = target_beneficiary_types WHERE notified = 1 AND notified_types IS NULL');
  await pool.query('UPDATE programs SET notified_types = target_beneficiary_types WHERE notified = 1 AND notified_types IS NULL');
  await pool.query('UPDATE trainings SET notified_types = target_beneficiary_types WHERE notified = 1 AND notified_types IS NULL');

  // Migration 030 - beneficiary registration requirements in the FAQ knowledge
  // base. Seeded only when no requirement row exists, so an admin's later edits
  // or deletions are never overwritten on restart.
  await ensureRegistrationFaqs();
}

const REGISTRATION_FAQS = [
  {
    question: 'What are the requirements for Farmer (RSBSA) registration?',
    answer: 'For Farmer (RSBSA) registration, prepare the following:\n\n1. Valid ID \u2014 photocopy with three (3) specimen signatures.\n2. One (1) 2x2 ID picture.',
    keywords: 'acm-req:farmer requirements registration farmer farmers rsbsa documents valid id photocopy specimen signatures 2x2 picture mag-uuma magsasaka rehistro kinahanglan dokumento',
  },
  {
    question: 'What are the requirements for Livestock Owner (RSBSA) registration?',
    answer: 'For Livestock Owner (RSBSA) registration, prepare the following:\n\n1. Valid ID \u2014 photocopy with three (3) specimen signatures.\n2. One (1) 2x2 ID picture.',
    keywords: 'acm-req:livestock requirements registration livestock owner animal animals hayop kahayupan mananap baboy baka kanding manok rsbsa documents valid id photocopy specimen signatures 2x2 picture rehistro kinahanglan dokumento',
  },
  {
    question: 'What are the requirements for Fisherfolk (RSBSA) registration?',
    answer: 'For Fisherfolk (RSBSA) registration, prepare the following:\n\n1. Valid ID \u2014 photocopy with three (3) specimen signatures.\n2. One (1) 2x2 ID picture.',
    keywords: 'acm-req:fisherfolk requirements registration fisherfolk fisher fisherman mangingisda pangisda isda rsbsa documents valid id photocopy specimen signatures 2x2 picture rehistro kinahanglan dokumento',
  },
  {
    question: 'What are the requirements for Coconut Farmer (RSBSA) registration?',
    answer: 'For Coconut Farmer (RSBSA) registration, prepare the following:\n\n1. Tax declaration or deed of sale.\n2. Valid ID with three (3) specimen signatures.',
    keywords: 'acm-req:coconut requirements registration coconut farmer niyog lubi copra tax declaration deed of sale rsbsa documents valid id specimen signatures rehistro kinahanglan dokumento',
  },
];

async function ensureRegistrationFaqs() {
  const [rows] = await pool.query(
    "SELECT COUNT(*) AS n FROM faqs WHERE keywords LIKE '%acm-req:%'"
  );
  if (rows[0].n > 0) return;
  const values = REGISTRATION_FAQS.flatMap((f) => [f.question, f.answer, f.keywords]);
  await pool.query(
    `INSERT INTO faqs (question, answer, keywords) VALUES ${REGISTRATION_FAQS.map(() => '(?, ?, ?)').join(', ')}`,
    values
  );
  console.log('[schema] seeded beneficiary registration FAQs');
}
