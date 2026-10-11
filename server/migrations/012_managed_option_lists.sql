-- 012: option lists the office maintains, and Treated By as a name.
--
-- Two lists were frozen in ways that did not fit how the report is actually used.
--
-- Species was a closed list in src/data/reportTypes.js. Growing it meant editing
-- code, and an admin could only add a value to a single record. Deriving the list
-- from the records instead does not work either: the last record holding a value
-- would take the value with it, so the entry would vanish the moment it was no
-- longer the only reason it existed.
--
-- Treated By was a user id, so the list of names on the dropdown was the set of
-- staff accounts. Attribution on a treatment sheet is not a login: the office needs
-- to be able to write down who did the work even for somebody who has no account,
-- and to take somebody off the list without touching their records.
--
-- So the lists move into storage of their own, and treated_by holds a name.
--
-- Nothing is thrown away. Every species already recorded is seeded into the list,
-- and each treated_by id is resolved to the staff member's display name before the
-- id column goes, so no existing report changes what it says.

CREATE TABLE report_option_values (
  id INT AUTO_INCREMENT PRIMARY KEY,
  list_name VARCHAR(64) NOT NULL,
  value VARCHAR(80) NOT NULL,
  -- Tenths, so an entry lands between two seeded ones rather than having to renumber
  -- the whole list to put it somewhere sensible.
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_rov_list_value UNIQUE (list_name, value),
  INDEX idx_rov_list (list_name, sort_order, value)
);

-- The lists as they stood in src/data/reportTypes.js before this migration.
INSERT INTO report_option_values (list_name, value, sort_order) VALUES
  ('species', 'Carabao', 10),
  ('species', 'Cattle',   20),
  ('species', 'Goat',     30),
  ('species', 'Sheep',    40),
  ('species', 'Pig',      50),
  ('species', 'Chicken',  60),
  ('species', 'Duck',     70),
  ('species', 'Tilapia',  80),
  ('species', 'Rabbit',   90),
  ('species', 'Horse',   100);

-- Staff who can already be credited, so nobody who has treated an animal loses the
-- ability to be picked after the list becomes names rather than ids. Every active
-- member of the three roles that could hold the attribution is listed, not only the
-- ones on a record: the next person to file a treatment has to be pickable too.
-- Ordered by name so the list reads the way the dropdown did.
-- A variable rather than ROW_NUMBER so the statement also runs on a MySQL older than
-- 8.0 or a MariaDB without window functions.
SET @staff_order = 0;
INSERT IGNORE INTO report_option_values (list_name, value, sort_order)
SELECT 'staff', COALESCE(NULLIF(trim(concat_ws(' ', first_name, last_name)), ''), email),
       (@staff_order := @staff_order + 10)
  FROM users
 WHERE is_active = 1 AND role IN ('super_admin', 'admin', 'technician')
 ORDER BY 2;

-- A species that is on a record but not on the configured list was typed by an admin
-- through the old VARCHAR column. The office used it, so it joins the list rather
-- than leaving those records with a value the form cannot offer.
INSERT IGNORE INTO report_option_values (list_name, value, sort_order)
SELECT 'species', recorded.species, 900
  FROM (SELECT DISTINCT species FROM animal_health_records) recorded;

-- treated_by becomes a name. The foreign key and its index go first: the constraint
-- has to be gone before the column can change type, and the index has to be dropped
-- with it because it is maintained by the constraint.
ALTER TABLE animal_health_records
  DROP FOREIGN KEY fk_ahr_treated_by,
  DROP INDEX idx_ahr_treated_by;

-- Resolved while the ids are still there. CONCAT_WS skips the NULL name parts, and
-- TRIM removes the leading space a last-name-only row would otherwise get.
ALTER TABLE animal_health_records
  ADD COLUMN treated_by_name VARCHAR(80) DEFAULT NULL AFTER no_of_heads;

UPDATE animal_health_records r
  LEFT JOIN users u ON u.id = r.treated_by
   SET r.treated_by_name = nullif(trim(concat_ws(' ', u.first_name, u.last_name)), '');

-- A staff row with no name parts at all still has to leave something behind, or the
-- NOT NULL conversion below would fail. "Unassigned" is what the column already
-- displayed for a missing value, so it is seeded into the list for the same reason.
UPDATE animal_health_records
   SET treated_by_name = 'Unassigned'
 WHERE treated_by_name IS NULL OR treated_by_name = '';

INSERT IGNORE INTO report_option_values (list_name, value, sort_order)
VALUES ('staff', 'Unassigned', 900);

-- Drop and rename in separate statements: doing both in one ALTER would have the
-- name resolution depend on which clause ran first.
ALTER TABLE animal_health_records DROP COLUMN treated_by;

ALTER TABLE animal_health_records
  CHANGE COLUMN treated_by_name treated_by VARCHAR(80) NOT NULL COMMENT 'Name from the staff list',
  ADD INDEX idx_ahr_treated_by (treated_by);

-- Post-condition: the lists the API will serve, and what the attribution now holds.
SELECT list_name, COUNT(*) AS entries
  FROM report_option_values
 GROUP BY list_name;

SELECT treated_by, COUNT(*) AS records
  FROM animal_health_records
 GROUP BY treated_by
 ORDER BY records DESC;