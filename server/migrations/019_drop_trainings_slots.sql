-- ============================================================
-- Migration 019 - drop trainings.slots
--
-- The sessions table kept a vestigial capacity column (`slots`)
-- that nothing reads, in either the admin UI or the public site.
-- Removing it keeps slots/ capacity out of the schema everywhere
-- except the backup dumps.
--
-- Idempotent: safe to run more than once.
-- Run:  node run-migration.mjs migrations/019_drop_trainings_slots.sql
-- ============================================================

USE acm;

SET @col := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = 'acm' AND TABLE_NAME = 'trainings' AND COLUMN_NAME = 'slots'
);
SET @sql := IF(@col > 0, 'ALTER TABLE trainings DROP COLUMN slots', 'DO 0');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Post-condition: slots must be gone, and the surviving columns must read as
-- expected. Reported rather than assumed so a partial run is obvious.
SELECT COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE, COLUMN_DEFAULT
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = 'acm' AND TABLE_NAME = 'trainings'
ORDER BY ORDINAL_POSITION;