-- ============================================================
-- Migration 005 - User Management (admin web portal accounts)
--
-- Adds the account model the admin web portal's User Management screen needs:
--
--   * role gains 'super_admin'. The column was ENUM('admin','beneficiary') and
--     MariaDB silently truncates a value outside the declared set, so the column
--     has to be widened before any Super Admin row can exist at all.
--   * full_name, because an account is a person. Without it the whole admin list
--     is a column of email addresses, which tells a Super Admin nothing about
--     who they are handing the keys to.
--   * is_active, so an account can be switched off without deleting it. Deleting
--     is deliberately not offered anywhere in the feature: the row is the audit
--     trail, and a removed account would take its history with it.
--
-- The seeded admin@mao.gov.ph is promoted to Super Admin. This is not a
-- convenience: only a Super Admin may open User Management, so a database with
-- no Super Admin could never create its first one and the portal would be
-- permanently locked out of its own account management. Promote by email rather
-- than by "lowest id" so the account that normally holds the demo login is the
-- one that gets it.
--
-- Safe to run more than once (idempotent).
-- Run:  mysql -u root -p acm < migrations/005_user_management.sql
-- ============================================================

USE acm;

-- ---------- role: add 'super_admin' to the enum ----------
-- information_schema.COLUMNS.COLUMN_TYPE reads back as
-- "enum('admin','super_admin','beneficiary')", so the LIKE is the existence test.
SET @enum_has_super := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = 'acm' AND TABLE_NAME = 'users'
    AND COLUMN_NAME = 'role' AND COLUMN_TYPE LIKE '%super_admin%'
);
SET @sql := IF(@enum_has_super = 0,
  'ALTER TABLE users
     MODIFY COLUMN role ENUM(''admin'',''super_admin'',''beneficiary'')
     NOT NULL DEFAULT ''beneficiary''',
  'DO 0');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ---------- full_name ----------
SET @col := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = 'acm' AND TABLE_NAME = 'users' AND COLUMN_NAME = 'full_name'
);
SET @sql := IF(@col = 0,
  'ALTER TABLE users ADD COLUMN full_name VARCHAR(150) NULL AFTER email',
  'DO 0');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ---------- is_active ----------
-- Existing rows land on 1, so every current account keeps working after the
-- upgrade instead of locking everyone out at once.
SET @col := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = 'acm' AND TABLE_NAME = 'users' AND COLUMN_NAME = 'is_active'
);
SET @sql := IF(@col = 0,
  'ALTER TABLE users ADD COLUMN is_active TINYINT(1) NOT NULL DEFAULT 1 AFTER role',
  'DO 0');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ---------- bootstrap the first Super Admin ----------
UPDATE users SET role = 'super_admin'
WHERE email = 'admin@mao.gov.ph' AND role = 'admin';

-- Named so the Super Admin in the list is identifiable, since the seeded row
-- predates the full_name column.
UPDATE users SET full_name = 'MAO Administrator'
WHERE email = 'admin@mao.gov.ph' AND (full_name IS NULL OR full_name = '');

-- Post-conditions, reported rather than assumed so a partial run is obvious.
SELECT id, full_name, email, role, is_active, created_at
FROM users
WHERE role IN ('admin', 'super_admin')
ORDER BY FIELD(role, 'super_admin', 'admin'), id;

SELECT COUNT(*) AS active_super_admins
FROM users
WHERE role = 'super_admin' AND is_active = 1;