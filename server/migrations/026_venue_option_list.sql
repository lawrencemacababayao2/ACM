-- 026: a shared, maintained Venue list for the Program and Training forms.
--
-- Venue was free text on both forms, so the same place was spelled several ways
-- and there was nothing to pick from. It now draws on a maintained list like the
-- report species/staff lists: an admin adds an entry once and it is offered in
-- both forms from then on, and removing one never edits the records that carry it.
--
-- The values live in report_option_values, the table the report option lists
-- already use, so no new storage is introduced. The API addresses the list by the
-- name 'venues'. The list is offered only in the admin portal (Programs and
-- Trainings are admin-only), so the entries are the office's own vocabulary.

INSERT IGNORE INTO report_option_values (list_name, value, sort_order) VALUES
  ('venues', 'MAO Office',              10),
  ('venues', 'MAO Training Hall, Medina', 20),
  ('venues', 'Municipal Hall',          30),
  ('venues', 'Barangay Hall',           40),
  ('venues', 'South Poblacion',         50),
  ('venues', 'Medina Gymnasium',        60);

-- Post-condition: the list the API will serve.
SELECT value FROM report_option_values WHERE list_name = 'venues' ORDER BY sort_order, value;
