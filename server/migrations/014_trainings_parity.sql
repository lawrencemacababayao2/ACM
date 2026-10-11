-- ============================================================
-- Migration 014 - trainings & seminars aligned to programs
--
-- Makes the training page offer the same fields programs do. Two additions:
--
--   1. schedule DATETIME  - programs keep their whole schedule in one DATETIME;
--      trainings used a DATE plus two TIME columns. The page now manages the
--      same single Schedule field, so existing rows are folded into it
--      (date + start time; the end time of a range has no programs equivalent,
--      so it is dropped from the page). The old columns are kept in sync for the
--      calendar feed and mobile consumers, which still read event_date/start_time.
--
--   2. training_benefits   - a 1:N list mirroring program_benefits, so the form
--      can offer the same Benefits list programs do. The aggregate is joined
--      into each row the way program_benefits is.
--
-- All columns and tables stay in place: nothing is dropped, so the change is
-- fully reversible and existing data (slots, lifecycle status) is preserved.
--
-- Safe to run more than once (idempotent).
-- Run:  mysql -u root -p acm < migrations/014_trainings_parity.sql
-- ============================================================

USE acm;

SET @col := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = 'acm' AND TABLE_NAME = 'trainings' AND COLUMN_NAME = 'schedule'
);
SET @sql := IF(@col = 0,
  'ALTER TABLE trainings ADD COLUMN schedule DATETIME NULL DEFAULT NULL AFTER end_time',
  'DO 0');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Existing rows: every one already has a date, most of them a start time. Fold
-- them into the new single value (missing start time reads as midnight). Rows
-- with no date at all are left NULL, matching a program with no schedule.
UPDATE trainings
SET schedule = COALESCE(
      schedule,
      IF(event_date IS NULL, NULL, CONCAT(DATE_FORMAT(event_date, '%Y-%m-%d'), ' ', TIME(COALESCE(start_time, '00:00:00'))))
    )
WHERE schedule IS NULL;

-- Same aggregate shape as program_benefits, FK-scoped to the training row.
SET @tb := (
  SELECT COUNT(*) FROM information_schema.TABLES
  WHERE TABLE_SCHEMA = 'acm' AND TABLE_NAME = 'training_benefits'
);
SET @sql := IF(@tb = 0,
  'CREATE TABLE training_benefits (
     id INT AUTO_INCREMENT PRIMARY KEY,
     training_id INT NOT NULL,
     benefit TEXT NOT NULL,
     sort_order INT NOT NULL DEFAULT 0,
     FOREIGN KEY (training_id) REFERENCES trainings(id) ON DELETE CASCADE
   )',
  'DO 0');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Post-conditions, reported rather than assumed so a partial run is obvious.
SELECT id, title, schedule, event_date, start_time, end_time, publish_status
FROM trainings ORDER BY id;

SELECT COLUMN_NAME, COLUMN_TYPE
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = 'acm' AND TABLE_NAME = 'training_benefits'
ORDER BY ORDINAL_POSITION;