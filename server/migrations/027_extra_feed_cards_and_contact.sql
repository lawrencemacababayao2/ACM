-- ============================================================
-- Migration 027 - real MAO contact + two more home-feed cards
--
-- 1) The contact_info row seeded with placeholder details is updated to the
--    office's actual phone and email so the mobile Profile, post details and
--    request detail show the client's real contact information.
-- 2) Two more "Latest from the MAO" cards are added, targeted to everyone
--    (public/all) so every signed-in beneficiary sees them. published_at is
--    the current timestamp so they sort into the most recent slot.
--
-- Safe to re-run (UPDATE matches the known contact row; INSERTs create new
-- rows with auto-increment ids).
-- ============================================================

UPDATE contact_info
SET phone = '09177196318', email = 'frederickdocdoc6@gmail.com'
WHERE id = 1;

INSERT INTO programs (title, description, target_type, target_beneficiary_types, venue, schedule, status, published_at, show_on_website)
VALUES
  ('Distribution of Certified Seeds',
   'Qualified beneficiaries may claim certified rice and vegetable seed packages at the MAO office. Bring a valid ID and your RSBSA number.',
   'public', JSON_ARRAY('public'), 'MAO Office, Medina', '2026-10-22 09:00:00',
   'published', CURRENT_TIMESTAMP, 1);

INSERT INTO program_benefits (program_id, benefit, sort_order)
VALUES
  (LAST_INSERT_ID(), 'Certified seed package', 0);

INSERT INTO trainings (title, description, target_type, target_beneficiary_types, venue, schedule, event_date, start_time, end_time, status, publish_status, published_at, show_on_website)
VALUES
  ('Organic Fertilizer Production Training',
   'Hands-on session on making compost and organic fertilizers from farm and household waste. Free starter kit for participants.',
   'all', JSON_ARRAY('all'), 'MAO Training Hall, Medina', '2026-10-21 09:00:00',
   '2026-10-21', '09:00:00', '16:00:00',
   'upcoming', 'published', CURRENT_TIMESTAMP, 1);

INSERT INTO training_benefits (training_id, benefit, sort_order)
VALUES
  (LAST_INSERT_ID(), 'Organic fertilizer starter kit', 0);