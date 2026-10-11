-- P2: programs lifecycle
-- Programs gain an optional explicit end so a scheduled activity can be marked
-- Ongoing instead of showing as an all-day event on its start date. `cancelled`
-- gives admins a soft "cancelled" state without removing the row; the public
-- feed hides cancelled records automatically.
ALTER TABLE programs
  ADD COLUMN end_at DATETIME NULL AFTER schedule,
  ADD COLUMN cancelled TINYINT(1) NOT NULL DEFAULT 0 AFTER end_at;