-- ============================================================
-- Migration 023 - Profile self-service
--
-- Backs the redesigned mobile Profile screen and the MAO review
-- workflow for "profile correction" requests.
--
--   * users: notification + language preferences the farmer can
--     change from the Profile > Preferences card
--   * requests.type widened with 'profile_correction' and a set of
--     columns that describe the requested change (field, current
--     value, requested value, note, attachment) and the decision
--
-- Safe to run more than once (idempotent).
-- Run:  mysql -u root -p acm < migrations/023_profile_self_service.sql
-- ============================================================

USE acm;

-- ------------------------------------------------------------
-- users: notification / language preferences
-- ------------------------------------------------------------
SET @col := (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = 'acm' AND TABLE_NAME = 'users' AND COLUMN_NAME = 'push_notifications');
SET @sql := IF(@col = 0,
  'ALTER TABLE users ADD COLUMN push_notifications TINYINT(1) NOT NULL DEFAULT 1 AFTER token_version',
  'DO 0');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col := (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = 'acm' AND TABLE_NAME = 'users' AND COLUMN_NAME = 'sms_notifications');
SET @sql := IF(@col = 0,
  'ALTER TABLE users ADD COLUMN sms_notifications TINYINT(1) NOT NULL DEFAULT 1 AFTER push_notifications',
  'DO 0');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col := (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = 'acm' AND TABLE_NAME = 'users' AND COLUMN_NAME = 'language');
SET @sql := IF(@col = 0,
  "ALTER TABLE users ADD COLUMN language VARCHAR(5) NOT NULL DEFAULT 'en' AFTER sms_notifications",
  'DO 0');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ------------------------------------------------------------
-- requests.type: add 'profile_correction'
-- ------------------------------------------------------------
SET @col := (SELECT COLUMN_TYPE FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = 'acm' AND TABLE_NAME = 'requests' AND COLUMN_NAME = 'type');
SET @sql := IF(@col IS NOT NULL AND @col NOT LIKE '%profile_correction%',
  "ALTER TABLE requests MODIFY COLUMN type ENUM('service','equipment','profile_correction') NOT NULL",
  'DO 0');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ------------------------------------------------------------
-- requests: profile-correction detail + decision columns
-- ------------------------------------------------------------
SET @col := (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = 'acm' AND TABLE_NAME = 'requests' AND COLUMN_NAME = 'request_field');
SET @sql := IF(@col = 0,
  'ALTER TABLE requests ADD COLUMN request_field VARCHAR(40) NULL AFTER type',
  'DO 0');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col := (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = 'acm' AND TABLE_NAME = 'requests' AND COLUMN_NAME = 'current_value');
SET @sql := IF(@col = 0,
  'ALTER TABLE requests ADD COLUMN current_value TEXT NULL AFTER request_field',
  'DO 0');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col := (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = 'acm' AND TABLE_NAME = 'requests' AND COLUMN_NAME = 'requested_value');
SET @sql := IF(@col = 0,
  'ALTER TABLE requests ADD COLUMN requested_value TEXT NULL AFTER current_value',
  'DO 0');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col := (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = 'acm' AND TABLE_NAME = 'requests' AND COLUMN_NAME = 'correction_note');
SET @sql := IF(@col = 0,
  'ALTER TABLE requests ADD COLUMN correction_note TEXT NULL AFTER details',
  'DO 0');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col := (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = 'acm' AND TABLE_NAME = 'requests' AND COLUMN_NAME = 'attachment_url');
SET @sql := IF(@col = 0,
  'ALTER TABLE requests ADD COLUMN attachment_url VARCHAR(255) NULL AFTER correction_note',
  'DO 0');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col := (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = 'acm' AND TABLE_NAME = 'requests' AND COLUMN_NAME = 'decision_reason');
SET @sql := IF(@col = 0,
  'ALTER TABLE requests ADD COLUMN decision_reason TEXT NULL AFTER admin_notes',
  'DO 0');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
