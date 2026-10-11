-- ============================================================
-- Migration 002 - Multi-step beneficiary registration
--
-- Adds what the 5-step mobile registration wizard needs:
--   * otp_codes          - OTP issue/verify records for +63 numbers
--   * users.mobile_number + nullable email
--                        - the wizard collects a mobile number, not an email
--   * beneficiaries extra identity fields
--                        - beneficiary_type, rsbsa_number, middle_name, suffix
--
-- Safe to run more than once (idempotent).
-- Run:  mysql -u root -p acm < migrations/002_registration_otp.sql
-- ============================================================

USE acm;

-- ------------------------------------------------------------
-- OTP codes
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS otp_codes (
  id INT AUTO_INCREMENT PRIMARY KEY,
  mobile_number VARCHAR(20) NOT NULL,
  code VARCHAR(10) NOT NULL,
  purpose VARCHAR(30) NOT NULL DEFAULT 'register',
  attempts TINYINT NOT NULL DEFAULT 0,
  verified_at DATETIME DEFAULT NULL,
  superseded TINYINT(1) NOT NULL DEFAULT 0,
  expires_at DATETIME NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_otp_mobile (mobile_number),
  INDEX idx_otp_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Older databases created before `superseded` existed.
SET @col := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = 'acm' AND TABLE_NAME = 'otp_codes' AND COLUMN_NAME = 'superseded'
);
SET @sql := IF(@col = 0,
  'ALTER TABLE otp_codes ADD COLUMN superseded TINYINT(1) NOT NULL DEFAULT 0 AFTER verified_at',
  'DO 0');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ------------------------------------------------------------
-- users: login by mobile number (the wizard never asks for email)
-- ------------------------------------------------------------
SET @col := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = 'acm' AND TABLE_NAME = 'users' AND COLUMN_NAME = 'mobile_number'
);
SET @sql := IF(@col = 0,
  'ALTER TABLE users ADD COLUMN mobile_number VARCHAR(20) DEFAULT NULL AFTER email',
  'DO 0');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- email must become optional so mobile-only accounts are allowed
SET @sql := 'ALTER TABLE users MODIFY COLUMN email VARCHAR(150) NULL';
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @idx := (
  SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = 'acm' AND TABLE_NAME = 'users' AND INDEX_NAME = 'uq_users_mobile'
);
SET @sql := IF(@idx = 0,
  'ALTER TABLE users ADD UNIQUE INDEX uq_users_mobile (mobile_number)',
  'DO 0');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ------------------------------------------------------------
-- beneficiaries: identity fields captured in step 1 of the wizard
-- ------------------------------------------------------------
SET @col := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = 'acm' AND TABLE_NAME = 'beneficiaries' AND COLUMN_NAME = 'beneficiary_type'
);
SET @sql := IF(@col = 0,
  'ALTER TABLE beneficiaries ADD COLUMN beneficiary_type VARCHAR(40) DEFAULT NULL AFTER user_id',
  'DO 0');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = 'acm' AND TABLE_NAME = 'beneficiaries' AND COLUMN_NAME = 'rsbsa_number'
);
SET @sql := IF(@col = 0,
  'ALTER TABLE beneficiaries ADD COLUMN rsbsa_number VARCHAR(60) DEFAULT NULL AFTER beneficiary_type',
  'DO 0');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = 'acm' AND TABLE_NAME = 'beneficiaries' AND COLUMN_NAME = 'middle_name'
);
SET @sql := IF(@col = 0,
  'ALTER TABLE beneficiaries ADD COLUMN middle_name VARCHAR(80) DEFAULT NULL AFTER first_name',
  'DO 0');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = 'acm' AND TABLE_NAME = 'beneficiaries' AND COLUMN_NAME = 'suffix'
);
SET @sql := IF(@col = 0,
  'ALTER TABLE beneficiaries ADD COLUMN suffix VARCHAR(20) DEFAULT NULL AFTER last_name',
  'DO 0');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- category is currently NOT NULL with no default; give it one so the wizard
-- can insert a row before the MAO assigns the final category.
SET @sql := 'ALTER TABLE beneficiaries MODIFY COLUMN category ENUM(''farmer'',''fisherfolk'',''livestock_owner'') NOT NULL DEFAULT ''farmer''';
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- The wizard does not ask for a barangay (the MAO assigns it during
-- verification), so it must be allowed to be empty.
SET @sql := 'ALTER TABLE beneficiaries MODIFY COLUMN barangay VARCHAR(80) NULL';
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ---------------------------------------------------------
-- Verification link: the wizard links itself to an existing
-- MAO record using the RSBSA / Beneficiary ID + full name.
-- ---------------------------------------------------------
SET @col := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = 'acm' AND TABLE_NAME = 'beneficiaries' AND COLUMN_NAME = 'rsbsa_match_id'
);
SET @sql := IF(@col = 0,
  'ALTER TABLE beneficiaries ADD COLUMN rsbsa_match_id INT DEFAULT NULL AFTER rsbsa_number',
  'DO 0');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @fk := (
  SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
  WHERE CONSTRAINT_SCHEMA = 'acm' AND TABLE_NAME = 'beneficiaries'
    AND CONSTRAINT_NAME = 'fk_ben_rsbsa_match'
);
SET @sql := IF(@fk = 0,
  'ALTER TABLE beneficiaries ADD CONSTRAINT fk_ben_rsbsa_match
     FOREIGN KEY (rsbsa_match_id) REFERENCES beneficiaries(id) ON DELETE SET NULL',
  'DO 0');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
