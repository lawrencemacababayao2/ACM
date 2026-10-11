-- ============================================================
-- Migration 006 - track when an account was last active
--
-- Adds users.last_active_at so User Management can show a real "Last active"
-- timestamp per admin account.
--
-- Why a column and not created_at: created_at says when the account was made,
-- which for a long-lived portal can be years before the person last used it.
-- An account list that only shows creation dates cannot answer the question a
-- Super Admin actually asks, which is "is this login still in use?".
--
-- Deliberately NULL for existing rows rather than backfilled from created_at or
-- from now(). Backfilling from created_at would state a last-seen time nobody
-- observed; backfilling from now() would make every dormant account look freshly
-- used. NULL is honest, and the UI renders it as "Never".
--
-- Written on successful sign-in only, and only after the password and is_active
-- checks pass, so a failed attempt or a deactivated account does not register as
-- activity. Beneficiaries share the table and are stamped too; the admin screen
-- only ever lists admin accounts, so the extra writes are harmless.
--
-- Safe to run more than once (idempotent).
-- Run:  mysql -u root -p acm < migrations/006_user_last_active_at.sql
-- ============================================================

USE acm;

SET @col := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = 'acm' AND TABLE_NAME = 'users' AND COLUMN_NAME = 'last_active_at'
);
SET @sql := IF(@col = 0,
  'ALTER TABLE users ADD COLUMN last_active_at DATETIME NULL DEFAULT NULL AFTER created_at',
  'DO 0');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Post-conditions, reported rather than assumed so a partial run is obvious.
SELECT COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE, COLUMN_DEFAULT
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = 'acm' AND TABLE_NAME = 'users' AND COLUMN_NAME = 'last_active_at';

SELECT id, full_name, email, role, is_active, created_at, last_active_at
FROM users
WHERE role IN ('admin', 'super_admin')
ORDER BY FIELD(role, 'super_admin', 'admin'), id;