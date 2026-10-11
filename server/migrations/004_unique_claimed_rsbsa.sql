-- ============================================================
-- Migration 004 - One claim per RSBSA number
--
-- An RSBSA number identifies exactly one beneficiary, so the same number must
-- never end up attached to two accounts. The API already refuses a number that
-- has already been claimed, but a check-then-insert in application code can
-- still be raced by two requests arriving together, so the rule is also
-- enforced by the database.
--
-- MySQL has no partial/filtered unique index, so a virtual column does the
-- filtering: it yields the RSBSA number only for rows that have been claimed
-- (user_id set) and NULL for every unclaimed MAO record. A unique index ignores
-- NULLs, which is what allows several unclaimed records to share a number -
-- the linking step in /register deliberately picks the first of those.
--
-- Safe to run more than once (idempotent).
-- Run:  mysql -u root -p acm < migrations/004_unique_claimed_rsbsa.sql
-- ============================================================

USE acm;

SET @col := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = 'acm' AND TABLE_NAME = 'beneficiaries'
    AND COLUMN_NAME = 'claimed_rsbsa_number'
);
SET @sql := IF(@col = 0,
  'ALTER TABLE beneficiaries ADD COLUMN claimed_rsbsa_number
     VARCHAR(60)
     GENERATED ALWAYS AS (IF(user_id IS NULL, NULL, rsbsa_number)) VIRTUAL',
  'DO 0');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Before adding the index, any number already claimed twice has to be resolved
-- by hand, or the ALTER fails. The count is reported so it cannot be missed.
SELECT rsbsa_number, COUNT(*) AS claimed_times
FROM beneficiaries
WHERE rsbsa_number IS NOT NULL AND rsbsa_number <> '' AND user_id IS NOT NULL
GROUP BY rsbsa_number
HAVING COUNT(*) > 1;

SET @idx := (
  SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = 'acm' AND TABLE_NAME = 'beneficiaries'
    AND INDEX_NAME = 'uq_beneficiaries_claimed_rsbsa'
);
SET @sql := IF(@idx = 0,
  'ALTER TABLE beneficiaries
     ADD UNIQUE KEY uq_beneficiaries_claimed_rsbsa (claimed_rsbsa_number)',
  'DO 0');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
