-- Trainings gain an optional explicit end (end_at) so a scheduled activity can be
-- marked Ongoing instead of showing as an all-day event on its start date.
-- Migrates existing end_time to end_at using schedule's date + end_time.
-- If the computed end is not after start, end_at is set to NULL and the row id is logged.

ALTER TABLE trainings
  ADD COLUMN end_at DATETIME NULL AFTER schedule;

-- Migrate existing end_time values to end_at
UPDATE trainings
SET end_at = CASE
  WHEN end_time IS NOT NULL AND schedule IS NOT NULL THEN
    CONCAT(DATE(schedule), ' ', end_time)
  ELSE NULL
END;

-- Log rows where end_at is not after start (invalid end)
-- These rows will have end_at set to NULL
UPDATE trainings
SET end_at = NULL
WHERE end_at IS NOT NULL AND schedule IS NOT NULL AND end_at <= schedule;

-- Select the ids of rows where end_at was nulled due to invalid end for logging
SELECT id, title, schedule, end_time, end_at
FROM trainings
WHERE end_time IS NOT NULL AND schedule IS NOT NULL AND (end_at IS NULL OR end_at <= schedule);