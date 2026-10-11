-- ============================================================
-- Migration 016 - Normalized duplicate columns
--
-- Adds mirror columns that hold a canonical copy of each searchable PII field,
-- so duplicate records can be found, reported and indexed without fuzzy string
-- matching at query time:
--
--   beneficiaries  name_key, mobile_normalized, rsbsa_normalized
--   users          email_normalized, mobile_normalized
--
-- The backfill here is a best-effort approximation (lowercasing + hitting
-- punctuation/non-digits). The authoritative pass that also applies the exact
-- JS normalization used by the app (accent stripping, name punctuation, +63
-- handling) is server/backup-duplicates.mjs, which runs right after this file
-- and:
--   1. recomputes every column with the real app rules and fixes drift,
--   2. writes a duplicate report to backups/duplicates_<stamp>.* ,
--   3. adds the conditional UNIQUE indexes (skipping and marking TODO when a
--      duplicate group already exists).
--
-- No unique indexes are created here on purpose: the indexes must sit on the
-- exact same values the app compares, or a record the app treats as a duplicate
-- could still slide past one index while another index refuses an UPDATE the app
-- allows. run-migration.mjs feeds this file SQL-only, so the JS exactness has to
-- live next door in the Node script.
--
-- Safe to run more than once (idempotent).
-- Run:  node run-migration.mjs server/migrations/016_duplicate_normalization.sql
-- then: node server/backup-duplicates.mjs
-- ============================================================

USE acm;

-- beneficiaries.name_key (lower-cased, whitespace collapsed to a pipe layout)
SET @col := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = 'acm' AND TABLE_NAME = 'beneficiaries'
    AND COLUMN_NAME = 'name_key'
);
SET @sql := IF(@col = 0,
  'ALTER TABLE beneficiaries ADD COLUMN name_key VARCHAR(340) NULL AFTER suffix',
  'DO 0');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- beneficiaries.mobile_normalized (digits only, mirrors the app comparison)
SET @col := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = 'acm' AND TABLE_NAME = 'beneficiaries'
    AND COLUMN_NAME = 'mobile_normalized'
);
SET @sql := IF(@col = 0,
  'ALTER TABLE beneficiaries ADD COLUMN mobile_normalized VARCHAR(20) NULL AFTER contact_number',
  'DO 0');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- beneficiaries.rsbsa_normalized (digits only)
SET @col := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = 'acm' AND TABLE_NAME = 'beneficiaries'
    AND COLUMN_NAME = 'rsbsa_normalized'
);
SET @sql := IF(@col = 0,
  'ALTER TABLE beneficiaries ADD COLUMN rsbsa_normalized VARCHAR(60) NULL AFTER rsbsa_number',
  'DO 0');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- users.email_normalized
SET @col := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = 'acm' AND TABLE_NAME = 'users'
    AND COLUMN_NAME = 'email_normalized'
);
SET @sql := IF(@col = 0,
  'ALTER TABLE users ADD COLUMN email_normalized VARCHAR(255) NULL AFTER email',
  'DO 0');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- users.mobile_normalized
SET @col := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = 'acm' AND TABLE_NAME = 'users'
    AND COLUMN_NAME = 'mobile_normalized'
);
SET @sql := IF(@col = 0,
  'ALTER TABLE users ADD COLUMN mobile_normalized VARCHAR(20) NULL AFTER mobile_number',
  'DO 0');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Approximate backfill. Idempotent: recomputing is harmless. The exact app-rules
-- pass in server/backup-duplicates.mjs overwrites these immediately after.
UPDATE beneficiaries b
LEFT JOIN users u ON u.id = b.user_id
SET b.name_key = CONCAT(
      LOWER(TRIM(IFNULL(b.first_name, ''))), '|',
      LOWER(TRIM(IFNULL(b.middle_name, ''))), '|',
      LOWER(TRIM(IFNULL(b.last_name, ''))), '|',
      LOWER(TRIM(IFNULL(b.suffix, '')))),
    b.mobile_normalized = REGEXP_REPLACE(TRIM(COALESCE(u.mobile_number, b.contact_number, '')), '[^0-9]', ''),
    b.rsbsa_normalized = REGEXP_REPLACE(TRIM(IFNULL(b.rsbsa_number, '')), '[^0-9]', '');

UPDATE users
SET email_normalized = LOWER(TRIM(IFNULL(email, ''))),
    mobile_normalized = REGEXP_REPLACE(TRIM(IFNULL(mobile_number, '')), '[^0-9]', '');

-- Post-condition report so an empty backfill cannot be missed.
SELECT 'beneficiaries' AS tbl, COUNT(*) AS rows_total,
       SUM(name_key IS NULL OR name_key = '') AS missing_name_key,
       SUM(mobile_normalized IS NULL OR mobile_normalized = '') AS missing_mobile,
       SUM(rsbsa_normalized IS NULL OR rsbsa_normalized = '') AS missing_rsbsa
FROM beneficiaries;

SELECT 'users' AS tbl, COUNT(*) AS rows_total,
       SUM(email_normalized IS NULL OR email_normalized = '') AS missing_email,
       SUM(mobile_normalized IS NULL OR mobile_normalized = '') AS missing_mobile
FROM users;