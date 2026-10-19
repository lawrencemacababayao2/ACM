USE acm;

SET @col := (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = 'acm' AND TABLE_NAME = 'users' AND COLUMN_NAME = 'profile_pic');
SET @sql := IF(@col = 0,
  'ALTER TABLE users ADD COLUMN profile_pic MEDIUMTEXT NULL',
  'DO 0');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SELECT 'users' AS tbl, COUNT(*) AS with_profile_pic FROM users WHERE profile_pic IS NOT NULL;
