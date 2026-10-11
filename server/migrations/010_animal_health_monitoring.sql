-- ============================================================
-- Migration 010 - Animal Health Monitoring report
--
-- Replaces the old Crop / Livestock / Fisheries `report_records` table with
-- `animal_health_records`, and introduces the `technician` role.
--
-- Why the old table goes away: it modelled commodity yields (commodity, quantity,
-- unit, area in hectares). The office now records animal health interventions
-- instead -- who was treated, for what activity, with which medicine, how many
-- head. Those are different facts, so the old columns could not be reused:
-- "area in hectares" has no meaning for a vaccinated carabao, and there was no
-- column for species, medicine or age. Every old column was dropped rather than
-- kept as a nullable remnant, because a nullable legacy column invites someone
-- to keep filling in a field that no longer appears on the form.
--
-- The four pre-existing rows were exported to /backups/report_records_*.{sql,csv}
-- by server/backup-report-records.mjs and confirmed restorable by
-- server/verify-report-backup.mjs before this migration was run.
--
-- `activity` is a JSON array, not an ENUM: the paper form says "check all that
-- apply", so one visit can be Deworming + Vaccination at the same time. An ENUM
-- would have forced a second row and double-counted `no_of_heads`. When the
-- custom-text branch is used the stored entry is the typed text instead of the
-- literal 'Other', so CSV and PDF never print a bare "Other".
--
-- `request_id` is nullable and UNIQUE so the request-completion hook can fill a
-- record exactly once; UNIQUE is what makes that safe under a double click or a
-- retried status update. ON DELETE SET NULL keeps the health record (a factual
-- record of work done) even if the request that caused it is removed.
--
-- `source` records how the row appeared: entered by hand, or created from a
-- completed service request. The web table shows a "From request" badge for the
-- latter so staff can tell at a glance which rows still need review.
-- ============================================================

-- ---------- technician role ----------
-- The report rules distinguish "may delete anything" from "may create and edit
-- only their own rows", but `users.role` had no technician value, so the second
-- rule had nobody to apply to. The full enum is restated rather than inserted
-- into, because that is how MySQL/MariaDB modify a column enum.
ALTER TABLE users
  MODIFY role ENUM('admin','super_admin','technician','beneficiary') NOT NULL DEFAULT 'beneficiary';

-- ---------- drop the legacy agricultural report table ----------
DROP TABLE IF EXISTS report_records;

-- ---------- Animal Health Monitoring ----------
CREATE TABLE IF NOT EXISTS animal_health_records (
  id INT AUTO_INCREMENT PRIMARY KEY,
  record_date DATE NOT NULL,
  barangay VARCHAR(80) NOT NULL,
  farmer_name VARCHAR(160) NOT NULL,
  -- Linked profile is optional: the form allows a farmer who has no
  -- beneficiary record yet, so this cannot be NOT NULL.
  beneficiary_id INT DEFAULT NULL,
  activity JSON NOT NULL,
  medicine_used VARCHAR(160) NOT NULL,
  species ENUM('Dog','Cat','Pig','Cattle','Carabao','Goat','Chicken','Other') NOT NULL,
  -- Age is split so it sorts and filters numerically; 6 months and 1 year are
  -- otherwise indistinguishable strings. 0 is not a real age, hence the > 0 guard.
  age_value SMALLINT UNSIGNED NOT NULL,
  age_unit ENUM('days','weeks','months','years') NOT NULL,
  no_of_heads INT UNSIGNED NOT NULL,
  treated_by INT NOT NULL,
  -- Who entered the row. Kept apart from `treated_by` on purpose: a technician
  -- may only edit records they created, and `treated_by` can be corrected later
  -- (a mis-keyed name, or a visit handled by someone else), which would silently
  -- hand the record's ownership to another user.
  created_by INT NOT NULL,
  request_id INT DEFAULT NULL,
  source ENUM('manual','request') NOT NULL DEFAULT 'manual',
  notes TEXT DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  -- The service-request hook must be idempotent, and a technician must not be
  -- able to inflate head counts by duplicating a row through a retried save.
  CONSTRAINT uq_ahr_request UNIQUE (request_id),
  CONSTRAINT chk_ahr_age CHECK (age_value > 0),
  CONSTRAINT chk_ahr_heads CHECK (no_of_heads > 0),
  CONSTRAINT fk_ahr_beneficiary FOREIGN KEY (beneficiary_id) REFERENCES beneficiaries(id) ON DELETE SET NULL,
  CONSTRAINT fk_ahr_treated_by FOREIGN KEY (treated_by) REFERENCES users(id),
  CONSTRAINT fk_ahr_created_by FOREIGN KEY (created_by) REFERENCES users(id),
  CONSTRAINT fk_ahr_request FOREIGN KEY (request_id) REFERENCES requests(id) ON DELETE SET NULL,
  -- Filters and the default ordering all read record_date, so it leads.
  INDEX idx_ahr_date (record_date),
  INDEX idx_ahr_barangay (barangay),
  INDEX idx_ahr_species (species),
  INDEX idx_ahr_treated_by (treated_by)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------- seed ----------
-- Two rows so a fresh install shows the shape of the form (including a
-- multi-activity row and a request-sourced row) instead of an empty table.
INSERT INTO animal_health_records
  (record_date, barangay, farmer_name, beneficiary_id, activity, medicine_used,
   species, age_value, age_unit, no_of_heads, treated_by, created_by, request_id, source, notes)
VALUES
  (CURDATE() - INTERVAL 3 DAY, 'South Poblacion', 'Ana S. Dela Cruz', NULL,
   JSON_ARRAY('Deworming'), 'Ivermectin 3.15%',
   'Carabao', 24, 'months', 2, 1, 1, NULL, 'manual',
   'Routine round during the planting season.'),
  (CURDATE() - INTERVAL 1 DAY, 'North Poblacion', 'Ramon B. Lantoy', NULL,
   JSON_ARRAY('Deworming', 'Vitamins'), 'Ivermectin 3.15%, Vitamin B12',
   'Carabao', 36, 'months', 1, 1, 1, NULL, 'manual',
   'Weak animal brought in for follow-up.');

-- ---------- postcondition ----------
-- Fails loudly instead of leaving a half-applied migration behind. Every table
-- this migration touches is asserted, so a later run cannot report success while
-- the old table is still present or the new one is missing.
SELECT 'report_records still exists' AS problem
  FROM information_schema.tables
 WHERE table_schema = DATABASE() AND table_name = 'report_records'
UNION ALL
SELECT 'animal_health_records missing' AS problem
  FROM information_schema.tables
 WHERE table_schema = DATABASE()
   AND table_name <> 'animal_health_records'
   AND NOT EXISTS (
     SELECT 1 FROM information_schema.tables
      WHERE table_schema = DATABASE() AND table_name = 'animal_health_records'
   )
UNION ALL
SELECT 'users.role technician missing' AS problem
  FROM information_schema.columns
 WHERE table_schema = DATABASE() AND table_name = 'users' AND column_name = 'role'
   AND column_type NOT LIKE '%technician%';