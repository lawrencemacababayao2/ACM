-- ============================================================
-- Migration 001 - Inbox merge: notification typing + deep links
-- Adds notification_type / announcement_id / request_id to the
-- existing notifications table so the mobile Inbox can merge
-- content notifications and request-status updates in one list.
--
-- Safe to run more than once (idempotent).
-- Run:  mysql -u root -p < migrations/001_notifications_inbox.sql
-- ============================================================

USE acm;

-- notification_type: which kind of feed a row belongs to.
SET @col := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = 'acm' AND TABLE_NAME = 'notifications' AND COLUMN_NAME = 'notification_type'
);
SET @sql := IF(@col = 0,
  "ALTER TABLE notifications
     ADD COLUMN notification_type ENUM('announcement','program','training','request_status')
       NOT NULL DEFAULT 'announcement' AFTER gateway_ref",
  'DO 0');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- announcement_id: deep link to the announcement/program row.
SET @col := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = 'acm' AND TABLE_NAME = 'notifications' AND COLUMN_NAME = 'announcement_id'
);
SET @sql := IF(@col = 0,
  'ALTER TABLE notifications ADD COLUMN announcement_id INT DEFAULT NULL AFTER notification_type',
  'DO 0');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- request_id: deep link to the service_request this status update is about.
SET @col := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = 'acm' AND TABLE_NAME = 'notifications' AND COLUMN_NAME = 'request_id'
);
SET @sql := IF(@col = 0,
  'ALTER TABLE notifications ADD COLUMN request_id INT DEFAULT NULL AFTER announcement_id',
  'DO 0');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Backfill: existing rows created from a request subject are request_status.
UPDATE notifications
SET notification_type = 'request_status'
WHERE request_id IS NULL
  AND notification_type = 'announcement'
  AND (subject LIKE 'ACM: Request%' OR subject LIKE 'ACM:%Hangyo%')
  AND message LIKE '%request%';

-- Indexes (guarded the same way).
SET @idx := (
  SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = 'acm' AND TABLE_NAME = 'notifications' AND INDEX_NAME = 'idx_notif_type'
);
SET @sql := IF(@idx = 0, 'ALTER TABLE notifications ADD INDEX idx_notif_type (notification_type)', 'DO 0');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @idx := (
  SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = 'acm' AND TABLE_NAME = 'notifications' AND INDEX_NAME = 'idx_notif_request'
);
SET @sql := IF(@idx = 0, 'ALTER TABLE notifications ADD INDEX idx_notif_request (request_id)', 'DO 0');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Foreign keys (guarded).
SET @fk := (
  SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
  WHERE CONSTRAINT_SCHEMA = 'acm' AND TABLE_NAME = 'notifications'
    AND CONSTRAINT_NAME = 'fk_notif_announcement'
);
SET @sql := IF(@fk = 0,
  'ALTER TABLE notifications ADD CONSTRAINT fk_notif_announcement
     FOREIGN KEY (announcement_id) REFERENCES announcements(id) ON DELETE CASCADE',
  'DO 0');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @fk := (
  SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
  WHERE CONSTRAINT_SCHEMA = 'acm' AND TABLE_NAME = 'notifications'
    AND CONSTRAINT_NAME = 'fk_notif_request'
);
SET @sql := IF(@fk = 0,
  'ALTER TABLE notifications ADD CONSTRAINT fk_notif_request
     FOREIGN KEY (request_id) REFERENCES requests(id) ON DELETE CASCADE',
  'DO 0');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
