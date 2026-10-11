-- ============================================================
-- Migration 015 - idempotency keys
--
-- Lets a mutating API call be retried safely after an interrupted round-trip
-- (lost response, power cut, browser close) without running the work a second
-- time. The web admin sends an Idempotency-Key header on publish/create and
-- side-effect requests (SMS, push, verifying a beneficiary, processing a
-- request); the middleware stores the attempt here and either replays the
-- stored response or refuses a duplicate.
--
-- The uniqueness that makes the guarantee is the (key, user_id, route) triple,
-- scoped per signed-in user per endpoint, so one user's key can never suppress
-- another's work and a key reused on a different route creates a fresh entry.
-- `request_hash` links a key to the exact body it was used with: the same key
-- on the same route with different input is an error, not a replay.
--
-- Completed entries expire after 24 hours and abandoned in_progress entries
-- (crashed mid-request) are reclaimed after 60 seconds, both swept
-- opportunistically by the middleware.
--
-- Safe to run more than once (idempotent).
-- Run:  mysql -u root -p acm < migrations/015_idempotency_keys.sql
-- ============================================================

USE acm;

SET @t := (
  SELECT COUNT(*) FROM information_schema.TABLES
  WHERE TABLE_SCHEMA = 'acm' AND TABLE_NAME = 'idempotency_keys'
);
SET @sql := IF(@t = 0,
  'CREATE TABLE idempotency_keys (
     id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
     `key` VARCHAR(128) NOT NULL,
     user_id INT NOT NULL,
     route VARCHAR(255) NOT NULL,
     request_hash CHAR(64) NOT NULL,
     status ENUM(''in_progress'', ''completed'') NOT NULL DEFAULT ''in_progress'',
     status_code SMALLINT NULL,
     response_body MEDIUMTEXT NULL,
     created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
     updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
     PRIMARY KEY (id),
     UNIQUE KEY uq_idempotency (`key`, user_id, route),
     KEY idx_idempotency_created (created_at)
   ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci',
  'DO 0');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Post-condition, reported rather than assumed so a partial run is obvious.
SELECT COUNT(*) AS idempotency_keys_count
FROM information_schema.TABLES
WHERE TABLE_SCHEMA = 'acm' AND TABLE_NAME = 'idempotency_keys';