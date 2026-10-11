-- 011: make the Animal Health option lists editable without an ALTER TABLE.
--
-- `species` and `age_unit` were DB enums, so the values offered in every dropdown
-- were frozen in the schema: adding or renaming one meant writing DDL, and the
-- report config in src/data/reportTypes.js could not be the single source of truth
-- it claims to be. Both become VARCHAR and the allowed values are enforced by the
-- API (validateRecord, the `select` branch) against the config instead.
--
-- Existing data is preserved: widening a column to VARCHAR cannot invalidate the
-- values already stored. No index is lost -- idx_ahr_species stays valid on VARCHAR.

ALTER TABLE animal_health_records
  MODIFY COLUMN species VARCHAR(64) NOT NULL COMMENT 'Species from the report config list',
  MODIFY COLUMN age_unit VARCHAR(16) NOT NULL COMMENT 'Age unit from the report config list';