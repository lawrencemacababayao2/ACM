-- ============================================================
-- Migration 008 - split users.full_name into first/middle/last
--
-- Replaces users.full_name with first_name, middle_name and last_name, matching
-- the shape the beneficiaries table already uses.
--
-- Why: "full_name" is one free-text column, so a person's name could not be
-- searched, sorted or filtered by surname, and any screen that needed to
-- address someone formally had to guess where the surname began. The beneficiaries
-- table has had first_name / middle_name / last_name all along, so this also
-- removes the mismatch between two tables that describe the same kind of person.
--
-- full_name was also UNIQUE. That is wrong for names: two different people can
-- share one, and the constraint only got in the way. The new columns carry no
-- uniqueness, so dropping the column drops it with it.
--
-- Backfill splits on whitespace: the first token becomes first_name, the last
-- becomes last_name, and anything between becomes middle_name. A single-token name
-- lands in first_name with last_name left NULL rather than being duplicated, since
-- inventing a surname is worse than admitting one is unknown. Rows with no name at
-- all (the beneficiary accounts, which store their real name on the beneficiaries
-- row) stay empty here.
--
-- Safe to run more than once (idempotent).
-- Run:  mysql -u root -p acm < migrations/008_user_name_parts.sql
-- ============================================================

USE acm;

SET @col := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = 'acm' AND TABLE_NAME = 'users' AND COLUMN_NAME = 'first_name'
);
SET @sql := IF(@col = 0,
  'ALTER TABLE users ADD COLUMN first_name VARCHAR(80) NULL DEFAULT NULL AFTER id',
  'DO 0');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = 'acm' AND TABLE_NAME = 'users' AND COLUMN_NAME = 'middle_name'
);
SET @sql := IF(@col = 0,
  'ALTER TABLE users ADD COLUMN middle_name VARCHAR(80) NULL DEFAULT NULL AFTER first_name',
  'DO 0');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = 'acm' AND TABLE_NAME = 'users' AND COLUMN_NAME = 'last_name'
);
SET @sql := IF(@col = 0,
  'ALTER TABLE users ADD COLUMN last_name VARCHAR(80) NULL DEFAULT NULL AFTER middle_name',
  'DO 0');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Backfill from the legacy single column. SUBSTRING_INDEX(..., CHAR(32), -1) is
-- the final token and SUBSTRING_INDEX(..., CHAR(32), 1) the first; the middle is
-- what is left once both ends are removed.
--
-- Every space literal is written CHAR(32) rather than ' ', which leaves this
-- string with no single quotes in it at all. Escaping quotes inside a quoted
-- string that is itself building SQL is what made the first version of this
-- migration fail to parse; keeping the literal quote-free removes the whole
-- class of problem. Empty checks use CHAR_LENGTH(...) = 0 for the same reason.
--
-- Runs through PREPARE because it reads full_name, which this migration drops
-- below, so a plain statement would break on the second run.
SET @has_legacy := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = 'acm' AND TABLE_NAME = 'users' AND COLUMN_NAME = 'full_name'
);
SET @backfill := 'UPDATE users SET
  first_name = CASE WHEN CHAR_LENGTH(TRIM(full_name)) = 0 THEN NULL
                    ELSE SUBSTRING_INDEX(TRIM(full_name), CHAR(32), 1) END,
  middle_name = CASE
    WHEN CHAR_LENGTH(TRIM(full_name)) = 0 THEN NULL
    WHEN INSTR(TRIM(full_name), CHAR(32)) = 0 THEN NULL
    WHEN CHAR_LENGTH(TRIM(BOTH CHAR(32) FROM SUBSTR(TRIM(full_name),
           CHAR_LENGTH(SUBSTRING_INDEX(TRIM(full_name), CHAR(32), 1)) + 1,
           CHAR_LENGTH(TRIM(full_name)) - CHAR_LENGTH(SUBSTRING_INDEX(TRIM(full_name), CHAR(32), 1))
                        - CHAR_LENGTH(SUBSTRING_INDEX(TRIM(full_name), CHAR(32), -1))))) = 0 THEN NULL
    ELSE TRIM(BOTH CHAR(32) FROM SUBSTR(TRIM(full_name),
           CHAR_LENGTH(SUBSTRING_INDEX(TRIM(full_name), CHAR(32), 1)) + 1,
           CHAR_LENGTH(TRIM(full_name)) - CHAR_LENGTH(SUBSTRING_INDEX(TRIM(full_name), CHAR(32), 1))
                        - CHAR_LENGTH(SUBSTRING_INDEX(TRIM(full_name), CHAR(32), -1))))
  END,
  last_name = CASE WHEN CHAR_LENGTH(TRIM(full_name)) = 0 THEN NULL
                   WHEN INSTR(TRIM(full_name), CHAR(32)) = 0 THEN NULL
                   ELSE SUBSTRING_INDEX(TRIM(full_name), CHAR(32), -1) END
WHERE first_name IS NULL AND last_name IS NULL AND CHAR_LENGTH(TRIM(full_name)) > 0';
SET @sql := IF(@has_legacy > 0, @backfill, 'DO 0');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- full_name is now redundant everywhere.
SET @col := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = 'acm' AND TABLE_NAME = 'users' AND COLUMN_NAME = 'full_name'
);
SET @sql := IF(@col = 1, 'ALTER TABLE users DROP COLUMN full_name', 'DO 0');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Post-conditions, reported rather than assumed so a partial run is obvious.
SELECT COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = 'acm' AND TABLE_NAME = 'users'
ORDER BY ORDINAL_POSITION;

SELECT id, email, first_name, middle_name, last_name, role
FROM users ORDER BY id;