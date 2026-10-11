-- ---------------------------------------------------------------------------
-- 024 service request catalog
--
-- The Submit Request page is driven by a per-beneficiary-type catalog (fisherfolk,
-- farmer, livestock owner) instead of the old free-form service/equipment list.
-- This migration adds the storage that catalog needs:
--   * beneficiaries.fishr_number  - the fisherfolk ID autofilled into requests
--   * requests.option_key         - which catalog option was chosen (e.g. 'carabao')
--   * requests.field_values       - the option's answers, keyed by field
--
-- `requests.type` keeps its existing ENUM (each option maps to service/equipment)
-- so the admin Requests screens and their filters keep working unchanged.
-- Written to be safe to run more than once.
-- ---------------------------------------------------------------------------

-- beneficiaries.fishr_number
SET @col := (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'beneficiaries' AND COLUMN_NAME = 'fishr_number');
SET @sql := IF(@col = 0,
  'ALTER TABLE beneficiaries ADD COLUMN fishr_number VARCHAR(60) NULL AFTER rsbsa_number',
  'DO 0');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- requests.option_key
SET @col := (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'requests' AND COLUMN_NAME = 'option_key');
SET @sql := IF(@col = 0,
  'ALTER TABLE requests ADD COLUMN option_key VARCHAR(60) NULL AFTER subject',
  'DO 0');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- requests.field_values
SET @col := (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'requests' AND COLUMN_NAME = 'field_values');
SET @sql := IF(@col = 0,
  'ALTER TABLE requests ADD COLUMN field_values JSON NULL AFTER details',
  'DO 0');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
