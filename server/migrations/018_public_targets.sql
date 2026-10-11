-- ============================================================
-- Migration 018 - "General public" target + public publishing
--
-- Programs & Trainings gain a fully public audience and the website
-- switch that decides whether a published item is listed on the
-- public wait (landing) site.
--
--   * programs.target_type / trainings.target_type add a 'public'
--     enum member, so a post can be aimed at the general public
--     (walk-ins, site visitors) instead of only registered groups.
--   * show_on_website marks a published item as visible on the public
--     website. It defaults to 0, so every existing row stays hidden
--     until an admin flips it -- a draft item never leaks.
--   * category tags the item with its programme area
--     (livestock|crops|fisheries|pets|general) so the public site
--     can group cards. It is a plain VARCHAR, not an ENUM, so the
--     option list can grow without a schema change.
--
-- 'public' still counts as a target group, but it never matches a
-- registered beneficiary: the SMS / in-app / push fan-out all exclude
-- it, so a public-only post reaches nobody by design.
--
-- Idempotent: safe to run more than once.
-- Run:  node run-migration.mjs migrations/018_public_targets.sql
-- ============================================================

USE acm;

-- ---------- programs.target_type → add 'public' ----------
-- The existing default ('farmer') is preserved.
SET @has := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = 'acm' AND TABLE_NAME = 'programs'
    AND COLUMN_NAME = 'target_type' AND COLUMN_TYPE LIKE '%''public''%'
);
SET @sql := IF(@has = 0,
  'ALTER TABLE programs MODIFY COLUMN target_type ENUM(''all'',''farmer'',''fisherfolk'',''livestock_owner'',''public'') NOT NULL DEFAULT ''farmer''',
  'DO 0');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ---------- trainings.target_type → add 'public' ----------
SET @has := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = 'acm' AND TABLE_NAME = 'trainings'
    AND COLUMN_NAME = 'target_type' AND COLUMN_TYPE LIKE '%''public''%'
);
SET @sql := IF(@has = 0,
  'ALTER TABLE trainings MODIFY COLUMN target_type ENUM(''all'',''farmer'',''fisherfolk'',''livestock_owner'',''public'') NOT NULL DEFAULT ''all''',
  'DO 0');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ---------- programs.show_on_website / category ----------
SET @col := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = 'acm' AND TABLE_NAME = 'programs' AND COLUMN_NAME = 'show_on_website'
);
SET @sql := IF(@col = 0,
  'ALTER TABLE programs ADD COLUMN show_on_website TINYINT(1) NOT NULL DEFAULT 0 AFTER cancelled',
  'DO 0');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = 'acm' AND TABLE_NAME = 'programs' AND COLUMN_NAME = 'category'
);
SET @sql := IF(@col = 0,
  'ALTER TABLE programs ADD COLUMN category VARCHAR(40) NULL DEFAULT NULL AFTER show_on_website',
  'DO 0');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ---------- trainings.show_on_website / category ----------
SET @col := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = 'acm' AND TABLE_NAME = 'trainings' AND COLUMN_NAME = 'show_on_website'
);
SET @sql := IF(@col = 0,
  'ALTER TABLE trainings ADD COLUMN show_on_website TINYINT(1) NOT NULL DEFAULT 0 AFTER schedule',
  'DO 0');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = 'acm' AND TABLE_NAME = 'trainings' AND COLUMN_NAME = 'category'
);
SET @sql := IF(@col = 0,
  'ALTER TABLE trainings ADD COLUMN category VARCHAR(40) NULL DEFAULT NULL AFTER show_on_website',
  'DO 0');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Post-conditions, reported rather than assumed so a partial run is obvious.
SELECT COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE, COLUMN_DEFAULT
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = 'acm' AND TABLE_NAME = 'programs'
  AND COLUMN_NAME IN ('target_type', 'show_on_website', 'category')
ORDER BY ORDINAL_POSITION;

SELECT COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE, COLUMN_DEFAULT
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = 'acm' AND TABLE_NAME = 'trainings'
  AND COLUMN_NAME IN ('target_type', 'show_on_website', 'category')
ORDER BY ORDINAL_POSITION;