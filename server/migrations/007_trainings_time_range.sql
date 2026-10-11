-- ============================================================
-- Migration 007 - real start/end times for trainings & seminars
--
-- Replaces trainings.event_time VARCHAR(50) with start_time / end_time TIME.
--
-- Why: the old column was free text. "8:00 AM - 5:00 PM" was typed by hand, so
-- the same schedule could be stored as "8:00AM-5PM", "8:00 am to 5:00 pm", or
-- "8am" and the database could not tell them apart. calendar.js had to grow a
-- regex parser (parseEventTime) whose only job was to guess the start hour back
-- out of that string, and any format it did not anticipate silently became
-- midnight. Splitting the range into two TIME columns makes the value queryable
-- and sortable, and lets the UI offer a picker instead of asking for typing.
--
-- Backfill parses the legacy text so the two existing rows survive the change.
-- A range is stored as-is even when it crosses midnight (an 8 PM - 2 AM shift);
-- ordering across days is the reader's job, not a reason to drop the end time.
--
-- Both columns are nullable: a training can be scheduled on a date whose hours
-- are not decided yet. The API enforces that if one is present the other is too.
--
-- Safe to run more than once (idempotent).
-- Run:  mysql -u root -p acm < migrations/007_trainings_time_range.sql
-- ============================================================

USE acm;

SET @col := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = 'acm' AND TABLE_NAME = 'trainings' AND COLUMN_NAME = 'start_time'
);
SET @sql := IF(@col = 0,
  'ALTER TABLE trainings ADD COLUMN start_time TIME NULL DEFAULT NULL AFTER event_date',
  'DO 0');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = 'acm' AND TABLE_NAME = 'trainings' AND COLUMN_NAME = 'end_time'
);
SET @sql := IF(@col = 0,
  'ALTER TABLE trainings ADD COLUMN end_time TIME NULL DEFAULT NULL AFTER start_time',
  'DO 0');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Backfill from the legacy free text. The pattern takes the first "h:mm am/pm"
-- as the start and the next one as the end, which covers both "8:00 AM - 5:00 PM"
-- and a bare "8:00 AM". Only rows still holding text are touched, so re-running
-- cannot overwrite an edited time.
--
-- Two details the parsing depends on:
--   * TRIM before splitting on the space. The text is written "8:00 AM - 5:00 PM",
--     so the segment after the dash is " 5:00 PM" with a leading space, and
--     SUBSTRING_INDEX(..., ' ', 1) on that yields an empty string.
--   * keep TWO tokens, not one, so the AM/PM marker survives. Taking only "8:00"
--     loses the meridiem and STR_TO_DATE would then read "5:00" as 5 AM instead
--     of 5 PM.
--
-- Run through PREPARE because it reads event_time, which this migration drops
-- further down. A plain statement would fail on the second run with
-- "Unknown column 'event_time'", which is how the first attempt at this file
-- turned out to be not actually idempotent.
SET @has_legacy := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = 'acm' AND TABLE_NAME = 'trainings' AND COLUMN_NAME = 'event_time'
);
SET @backfill := 'UPDATE trainings
  SET start_time = STR_TO_DATE(
        SUBSTRING_INDEX(TRIM(SUBSTRING_INDEX(event_time, ''-'', 1)), '' '', 2), ''%h:%i %p''
      ),
      end_time = NULLIF(
        STR_TO_DATE(
          SUBSTRING_INDEX(TRIM(SUBSTRING_INDEX(event_time, ''-'', -1)), '' '', 2), ''%h:%i %p''
        ), ''NULL''
      )
  WHERE event_time IS NOT NULL
    AND event_time <> ''''
    AND start_time IS NULL
    AND STR_TO_DATE(SUBSTRING_INDEX(TRIM(SUBSTRING_INDEX(event_time, ''-'', 1)), '' '', 2), ''%h:%i %p'') IS NOT NULL';
SET @sql := IF(@has_legacy > 0, @backfill, 'DO 0');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- event_time is now redundant. Dropped so nothing can keep writing to it; the
-- display string is derived from the two TIME columns wherever it is needed.
SET @col := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = 'acm' AND TABLE_NAME = 'trainings' AND COLUMN_NAME = 'event_time'
);
SET @sql := IF(@col = 1, 'ALTER TABLE trainings DROP COLUMN event_time', 'DO 0');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Post-conditions, reported rather than assumed so a partial run is obvious.
SELECT COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = 'acm' AND TABLE_NAME = 'trainings'
ORDER BY ORDINAL_POSITION;

SELECT id, title, event_date, start_time, end_time
FROM trainings ORDER BY id;