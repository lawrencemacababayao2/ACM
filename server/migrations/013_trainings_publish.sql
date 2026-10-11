-- ============================================================
-- Migration 013 - trainings & seminars gain publish/draft + SMS
--
-- Brings the trainings table up to parity with programs: a publish
-- workflow (draft/published), SMS fan-out on publish, and an audit
-- pair for who created and when it was published.
--
-- The lifecycle status (upcoming/completed/cancelled) is kept as the
-- existing `status` column; it answers "is this session still happening"
-- and is deliberately separate from `publish_status` ("is it visible").
--
-- Existing rows keep working: publish_status defaults to 'published'
-- (so every training already in the system stays public exactly as it
-- was), and published_at is backfilled from created_at so the Published
-- column reads sensibly instead of a blank.
--
-- Safe to run more than once (idempotent).
-- Run:  mysql -u root -p acm < migrations/013_trainings_publish.sql
-- ============================================================

USE acm;

SET @col := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = 'acm' AND TABLE_NAME = 'trainings' AND COLUMN_NAME = 'send_sms'
);
SET @sql := IF(@col = 0,
  'ALTER TABLE trainings ADD COLUMN send_sms TINYINT(1) NOT NULL DEFAULT 0 AFTER end_time',
  'DO 0');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = 'acm' AND TABLE_NAME = 'trainings' AND COLUMN_NAME = 'sms_sent'
);
SET @sql := IF(@col = 0,
  'ALTER TABLE trainings ADD COLUMN sms_sent TINYINT(1) NOT NULL DEFAULT 0 AFTER send_sms',
  'DO 0');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = 'acm' AND TABLE_NAME = 'trainings' AND COLUMN_NAME = 'notified'
);
SET @sql := IF(@col = 0,
  'ALTER TABLE trainings ADD COLUMN notified TINYINT(1) NOT NULL DEFAULT 0 AFTER sms_sent',
  'DO 0');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- publish_status is separate from the lifecycle `status` above. Defaulting to
-- 'published' is what keeps every existing training visible after the change.
SET @col := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = 'acm' AND TABLE_NAME = 'trainings' AND COLUMN_NAME = 'publish_status'
);
SET @sql := IF(@col = 0,
  'ALTER TABLE trainings ADD COLUMN publish_status ENUM(''draft'',''published'') NOT NULL DEFAULT ''published'' AFTER status',
  'DO 0');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = 'acm' AND TABLE_NAME = 'trainings' AND COLUMN_NAME = 'published_at'
);
SET @sql := IF(@col = 0,
  'ALTER TABLE trainings ADD COLUMN published_at DATETIME NULL DEFAULT NULL AFTER publish_status',
  'DO 0');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = 'acm' AND TABLE_NAME = 'trainings' AND COLUMN_NAME = 'created_by'
);
SET @sql := IF(@col = 0,
  'ALTER TABLE trainings ADD COLUMN created_by INT DEFAULT NULL AFTER published_at',
  'DO 0');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Programs tracks when a row was last changed; do the same so the two
-- publish-draft tables expose the same shape to the admin.
SET @col := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = 'acm' AND TABLE_NAME = 'trainings' AND COLUMN_NAME = 'updated_at'
);
SET @sql := IF(@col = 0,
  'ALTER TABLE trainings ADD COLUMN updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP AFTER created_at',
  'DO 0');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Existing rows were public before the column existed, and defaulting
-- publish_status to 'published' keeps them that way. Backfill the published
-- date from creation so the UI's Published column reads like Programs.
UPDATE trainings
SET published_at = COALESCE(published_at, created_at)
WHERE publish_status = 'published' AND published_at IS NULL;

-- Post-conditions, reported rather than assumed so a partial run is obvious.
SELECT COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE, COLUMN_DEFAULT
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = 'acm' AND TABLE_NAME = 'trainings'
ORDER BY ORDINAL_POSITION;

SELECT id, title, status, publish_status, published_at, send_sms, sms_sent, notified
FROM trainings ORDER BY id;