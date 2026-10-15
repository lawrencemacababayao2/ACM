-- ============================================================
-- Migration 028 - per-type publish tracking
--
-- Publishing an advisory / program / training used to record only a single
-- `notified` flag, so re-publishing it to an added beneficiary type (e.g. from
-- Farmers to Farmers + Fisherfolk) skipped the app-notification + push because
-- `notified` was already 1. `notified_types` stores the target types that have
-- actually been announced, so a republish only notifies the newly added types.
--
-- Existing published rows are backfilled with their full target list, which is
-- correct: before this column, a publish fanned out to everyone targeted.
--
-- Safe to run more than once (idempotent).
-- Run:  node run-migration.mjs migrations/028_notified_target_types.sql
-- ============================================================

USE acm;

-- announcements.notified_types
SET @col := (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = 'acm' AND TABLE_NAME = 'announcements' AND COLUMN_NAME = 'notified_types');
SET @sql := IF(@col = 0,
  'ALTER TABLE announcements ADD COLUMN notified_types JSON NULL AFTER notified',
  'DO 0');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- programs.notified_types
SET @col := (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = 'acm' AND TABLE_NAME = 'programs' AND COLUMN_NAME = 'notified_types');
SET @sql := IF(@col = 0,
  'ALTER TABLE programs ADD COLUMN notified_types JSON NULL AFTER notified',
  'DO 0');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- trainings.notified_types
SET @col := (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = 'acm' AND TABLE_NAME = 'trainings' AND COLUMN_NAME = 'notified_types');
SET @sql := IF(@col = 0,
  'ALTER TABLE trainings ADD COLUMN notified_types JSON NULL AFTER notified',
  'DO 0');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Backfill: anything already announced has announced to all of its targets.
UPDATE announcements SET notified_types = target_beneficiary_types
  WHERE notified = 1 AND notified_types IS NULL;
UPDATE programs SET notified_types = target_beneficiary_types
  WHERE notified = 1 AND notified_types IS NULL;
UPDATE trainings SET notified_types = target_beneficiary_types
  WHERE notified = 1 AND notified_types IS NULL;

SELECT 'announcements' AS tbl, COUNT(*) AS with_notified_types FROM announcements WHERE notified_types IS NOT NULL
UNION ALL
SELECT 'programs', COUNT(*) FROM programs WHERE notified_types IS NOT NULL
UNION ALL
SELECT 'trainings', COUNT(*) FROM trainings WHERE notified_types IS NOT NULL;
