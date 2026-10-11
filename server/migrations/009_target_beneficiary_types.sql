-- ============================================================
-- Migration 009 - one post can target several beneficiary types
--
-- Adds `target_beneficiary_types` (a JSON array) to announcements, programs and
-- trainings, and gives trainings a `target_type` column, which it never had.
--
-- Why: the target was a single ENUM value, so "a seed distribution for both
-- farmers and fisherfolk" could not be expressed at all -- an admin had to
-- publish two copies of the same announcement and keep them in sync by hand.
-- The audience is a set, so it is stored as a set.
--
-- `target_type` is deliberately KEPT, not dropped:
--   * mobile/src/components/ItemDetail.jsx reads it off announcements and
--     programs,
--   * server/src/routes/calendar.js selects it for the mobile calendar feed,
--   * server/src/services/chatbot.js reads it for program answers.
-- None of those have a notion of a list, and rewriting three consumers plus an
-- app that is not in this repo is a much larger change than the bug warrants. It
-- is now a DERIVED column, written by the API as: the single targeted type when
-- exactly one is chosen, 'all' when more than one (or none) is. The list column
-- is the source of truth; nothing new should read target_type.
--
-- 'all' is stored as ["all"] rather than expanded into the three concrete types,
-- so the stored value round-trips exactly as the admin picked it and the form can
-- show one "All" chip back. Notification fan-out treats 'all' as "everyone".
--
-- 'all' is added to programs.target_type as well: without it a multi-type program
-- had nowhere to point the legacy readers, and forcing one arbitrary type on them
-- would have told fisherfolk a program aimed at farmers was for them.
--
-- Backfill reads the old column, so every existing row keeps the audience it had.
-- Trainings get ["all"], which is what they already were in practice: nothing
-- about a training ever restricted who could see it.
--
-- Safe to run more than once (idempotent).
-- Run:  mysql -u root -p acm < migrations/009_target_beneficiary_types.sql
-- ============================================================

USE acm;

-- ---------- announcements ----------

SET @col := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = 'acm' AND TABLE_NAME = 'announcements'
    AND COLUMN_NAME = 'target_beneficiary_types'
);
SET @sql := IF(@col = 0,
  'ALTER TABLE announcements ADD COLUMN target_beneficiary_types JSON NULL DEFAULT NULL AFTER target_type',
  'DO 0');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

UPDATE announcements
SET target_beneficiary_types = JSON_ARRAY(target_type)
WHERE target_beneficiary_types IS NULL;

-- ---------- programs ----------

-- 'all' has to exist before a multi-type program can be recorded, because
-- target_type is the value the legacy readers see.
SET @col := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = 'acm' AND TABLE_NAME = 'programs' AND COLUMN_NAME = 'target_type'
);
SET @sql := IF(@col = 1,
  'ALTER TABLE programs MODIFY COLUMN target_type ENUM(''all'',''farmer'',''fisherfolk'',''livestock_owner'') NOT NULL DEFAULT ''farmer''',
  'DO 0');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = 'acm' AND TABLE_NAME = 'programs'
    AND COLUMN_NAME = 'target_beneficiary_types'
);
SET @sql := IF(@col = 0,
  'ALTER TABLE programs ADD COLUMN target_beneficiary_types JSON NULL DEFAULT NULL AFTER target_type',
  'DO 0');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

UPDATE programs
SET target_beneficiary_types = JSON_ARRAY(target_type)
WHERE target_beneficiary_types IS NULL;

-- ---------- trainings ----------
-- Trainings had no audience column at all, so both columns are new here.

SET @col := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = 'acm' AND TABLE_NAME = 'trainings' AND COLUMN_NAME = 'target_type'
);
SET @sql := IF(@col = 0,
  'ALTER TABLE trainings ADD COLUMN target_type ENUM(''all'',''farmer'',''fisherfolk'',''livestock_owner'') NOT NULL DEFAULT ''all'' AFTER description',
  'DO 0');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = 'acm' AND TABLE_NAME = 'trainings'
    AND COLUMN_NAME = 'target_beneficiary_types'
);
SET @sql := IF(@col = 0,
  'ALTER TABLE trainings ADD COLUMN target_beneficiary_types JSON NULL DEFAULT NULL AFTER target_type',
  'DO 0');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

UPDATE trainings
SET target_beneficiary_types = JSON_ARRAY(target_type)
WHERE target_beneficiary_types IS NULL;

-- Now that every row is backfilled, the list column is mandatory: an unset
-- audience is a bug, and NOT NULL turns it into a write-time error instead of a
-- row that silently reaches nobody.
SET @sql := 'ALTER TABLE announcements MODIFY COLUMN target_beneficiary_types JSON NOT NULL';
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @sql := 'ALTER TABLE programs MODIFY COLUMN target_beneficiary_types JSON NOT NULL';
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @sql := 'ALTER TABLE trainings MODIFY COLUMN target_beneficiary_types JSON NOT NULL';
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Post-conditions, reported rather than assumed so a partial run is obvious.
SELECT TABLE_NAME, COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = 'acm'
  AND TABLE_NAME IN ('announcements', 'programs', 'trainings')
  AND COLUMN_NAME IN ('target_type', 'target_beneficiary_types')
ORDER BY TABLE_NAME, ORDINAL_POSITION;

-- Any row where the derived single value disagrees with the list means the API
-- wrote them inconsistently. The invariant is:
--     target_type = the one type when the list holds exactly one, else 'all'
-- An empty list is never valid. Expected: no rows from all three checks.
SELECT 'announcements' AS src, id, title, target_type, target_beneficiary_types
FROM announcements
WHERE JSON_LENGTH(target_beneficiary_types) < 1
   OR target_type <> CASE
        WHEN JSON_LENGTH(target_beneficiary_types) = 1
          THEN JSON_UNQUOTE(JSON_EXTRACT(target_beneficiary_types, '$[0]'))
        ELSE 'all' END
UNION ALL
SELECT 'programs', id, title, target_type, target_beneficiary_types
FROM programs
WHERE JSON_LENGTH(target_beneficiary_types) < 1
   OR target_type <> CASE
        WHEN JSON_LENGTH(target_beneficiary_types) = 1
          THEN JSON_UNQUOTE(JSON_EXTRACT(target_beneficiary_types, '$[0]'))
        ELSE 'all' END
UNION ALL
SELECT 'trainings', id, title, target_type, target_beneficiary_types
FROM trainings
WHERE JSON_LENGTH(target_beneficiary_types) < 1
   OR target_type <> CASE
        WHEN JSON_LENGTH(target_beneficiary_types) = 1
          THEN JSON_UNQUOTE(JSON_EXTRACT(target_beneficiary_types, '$[0]'))
        ELSE 'all' END;