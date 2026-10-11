-- ============================================================
-- Migration 022 - Self-service password reset
--
-- Adds what the 3-step forgot-password flow needs:
--   * otp_codes.code  widened to hold a SHA-256 hash (64 hex chars) so codes
--                     are never stored in the clear
--   * users.token_version           bumped on every password change so every
--                     existing JWT stops working at once
--   * otp_codes index on (mobile_number, purpose, created_at) for the per-number
--                     hourly rate limit
--
-- Safe to run more than once (idempotent).
-- Run:  mysql -u root -p acm < migrations/022_forgot_password.sql
-- ============================================================

USE acm;

-- ------------------------------------------------------------
-- otp_codes.code: VARCHAR(10) -> VARCHAR(64) (SHA-256 hex)
-- ------------------------------------------------------------
SET @col := (
  SELECT CHARACTER_MAXIMUM_LENGTH FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = 'acm' AND TABLE_NAME = 'otp_codes' AND COLUMN_NAME = 'code'
);
SET @sql := IF(COALESCE(@col, 0) < 64,
  'ALTER TABLE otp_codes MODIFY COLUMN code VARCHAR(64) NOT NULL',
  'DO 0');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ------------------------------------------------------------
-- otp_codes: rate-limit index (number + purpose + time)
-- ------------------------------------------------------------
SET @idx := (
  SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = 'acm' AND TABLE_NAME = 'otp_codes' AND INDEX_NAME = 'idx_otp_mobile_purpose_created'
);
SET @sql := IF(@idx = 0,
  'ALTER TABLE otp_codes ADD INDEX idx_otp_mobile_purpose_created (mobile_number, purpose, created_at)',
  'DO 0');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ------------------------------------------------------------
-- users.token_version
-- ------------------------------------------------------------
SET @col := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = 'acm' AND TABLE_NAME = 'users' AND COLUMN_NAME = 'token_version'
);
SET @sql := IF(@col = 0,
  'ALTER TABLE users ADD COLUMN token_version INT NOT NULL DEFAULT 0 AFTER is_active',
  'DO 0');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;