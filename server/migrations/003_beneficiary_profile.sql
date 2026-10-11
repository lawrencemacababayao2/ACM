-- ============================================================
-- Migration 003 - Beneficiary profile fields
--
-- Step 1 of the registration wizard now also collects:
--   * gender     - Male / Female
--   * birthday   - date of birth
--   * province   - province of residence
--   * purok      - purok / sitio
--
-- `barangay` already exists on beneficiaries (nullable since 002), so it is
-- reused here rather than added again.
--
-- Safe to run more than once (idempotent).
-- Run:  mysql -u root -p acm < migrations/003_beneficiary_profile.sql
-- ============================================================

USE acm;

SET @col := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = 'acm' AND TABLE_NAME = 'beneficiaries' AND COLUMN_NAME = 'gender'
);
SET @sql := IF(@col = 0,
  'ALTER TABLE beneficiaries ADD COLUMN gender ENUM(''male'',''female'') DEFAULT NULL AFTER last_name',
  'DO 0');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = 'acm' AND TABLE_NAME = 'beneficiaries' AND COLUMN_NAME = 'birthday'
);
SET @sql := IF(@col = 0,
  'ALTER TABLE beneficiaries ADD COLUMN birthday DATE DEFAULT NULL AFTER gender',
  'DO 0');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = 'acm' AND TABLE_NAME = 'beneficiaries' AND COLUMN_NAME = 'province'
);
SET @sql := IF(@col = 0,
  'ALTER TABLE beneficiaries ADD COLUMN province VARCHAR(80) DEFAULT NULL AFTER birthday',
  'DO 0');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = 'acm' AND TABLE_NAME = 'beneficiaries' AND COLUMN_NAME = 'purok'
);
SET @sql := IF(@col = 0,
  'ALTER TABLE beneficiaries ADD COLUMN purok VARCHAR(80) DEFAULT NULL AFTER barangay',
  'DO 0');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
