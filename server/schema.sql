-- ============================================================
-- AgriConnect Medina (ACM) - Schema + Seed Data
-- Target: MariaDB (XAMPP) / MySQL 5.7+
-- Import:  mysql -u root -p < schema.sql
-- ============================================================

CREATE DATABASE IF NOT EXISTS acm CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE acm;

DROP TABLE IF EXISTS service_cards;
DROP TABLE IF EXISTS why_cards;
DROP TABLE IF EXISTS stats_cards;
DROP TABLE IF EXISTS about_cards;
DROP TABLE IF EXISTS contact_info;
DROP TABLE IF EXISTS translations;
DROP TABLE IF EXISTS notifications;
DROP TABLE IF EXISTS animal_health_records;
DROP TABLE IF EXISTS report_option_values;
-- The retired Crop / Livestock / Fisheries table is still named here on purpose.
-- An existing installation that upgrades by re-importing this file would otherwise
-- be left holding a table nothing reads any more, and it holds a foreign key to
-- users, which would then fail the users drop further down. `IF EXISTS` keeps the
-- line harmless on a clean database. Existing data was exported before the table
-- was retired; see /backups and migrations/010_animal_health_monitoring.sql.
DROP TABLE IF EXISTS report_records;
DROP TABLE IF EXISTS request_status_log;
DROP TABLE IF EXISTS requests;
DROP TABLE IF EXISTS trainings;
DROP TABLE IF EXISTS program_benefits;
DROP TABLE IF EXISTS programs;
DROP TABLE IF EXISTS announcements;
DROP TABLE IF EXISTS faqs;
DROP TABLE IF EXISTS carousel_slides;
DROP TABLE IF EXISTS landing_sections;
DROP TABLE IF EXISTS otp_codes;
-- Must be dropped before users: push_tokens has a foreign key to it. Without this
-- line re-importing schema.sql over an existing database fails on
-- "Table 'push_tokens' already exists".
DROP TABLE IF EXISTS push_tokens;
DROP TABLE IF EXISTS beneficiaries;
DROP TABLE IF EXISTS users;

-- ---------- Users ----------
CREATE TABLE users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    -- Name parts, matching the beneficiaries table. No uniqueness: two people can
    -- legitimately share a name, which is why this replaced a UNIQUE full_name.
    first_name VARCHAR(80) DEFAULT NULL,
    middle_name VARCHAR(80) DEFAULT NULL,
    last_name VARCHAR(80) DEFAULT NULL,
    email VARCHAR(150) NULL UNIQUE,
  mobile_number VARCHAR(20) NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
role ENUM('admin','super_admin','technician','beneficiary') NOT NULL DEFAULT 'beneficiary',
    is_active TINYINT(1) NOT NULL DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_active_at DATETIME NULL DEFAULT NULL,
    profile_pic MEDIUMTEXT DEFAULT NULL
    );

-- ---------- Beneficiaries ----------
CREATE TABLE beneficiaries (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT DEFAULT NULL,
  beneficiary_type VARCHAR(40) DEFAULT NULL,
  rsbsa_number VARCHAR(60) DEFAULT NULL,
  rsbsa_match_id INT DEFAULT NULL,
  first_name VARCHAR(80) NOT NULL,
  middle_name VARCHAR(80) DEFAULT NULL,
  last_name VARCHAR(80) NOT NULL,
  gender ENUM('male','female') DEFAULT NULL,
  birthday DATE DEFAULT NULL,
  suffix VARCHAR(20) DEFAULT NULL,
  contact_number VARCHAR(20) NOT NULL,
  province VARCHAR(80) DEFAULT NULL,
  barangay VARCHAR(80) DEFAULT NULL,
  purok VARCHAR(80) DEFAULT NULL,
  category ENUM('farmer','fisherfolk','livestock_owner') NOT NULL DEFAULT 'farmer',
  farm_location VARCHAR(255) DEFAULT NULL,
  area_hectares DECIMAL(8,2) DEFAULT NULL,
  livelihood VARCHAR(120) DEFAULT NULL,
  status ENUM('pending','verified','rejected') NOT NULL DEFAULT 'pending',
  profile_pic MEDIUMTEXT DEFAULT NULL,
  -- Public path of the valid-ID photo uploaded during registration. Reviewed by
  -- the MAO on the admin Beneficiaries page. See migrations/025_beneficiary_id_document.sql.
  id_document VARCHAR(255) DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  -- An RSBSA number identifies one beneficiary, so it may only be claimed once.
  -- MySQL has no partial unique index, so a virtual column carries the number
  -- only for rows that are actually claimed and NULL for unclaimed MAO records;
  -- a unique index ignores NULLs, which still lets several unclaimed records
  -- share a number. See migrations/004_unique_claimed_rsbsa.sql.
  claimed_rsbsa_number VARCHAR(60)
    GENERATED ALWAYS AS (IF(user_id IS NULL, NULL, rsbsa_number)) VIRTUAL,
  UNIQUE KEY uq_beneficiaries_claimed_rsbsa (claimed_rsbsa_number),
  CONSTRAINT fk_ben_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_ben_rsbsa_match FOREIGN KEY (rsbsa_match_id) REFERENCES beneficiaries(id) ON DELETE SET NULL
);

-- ---------- Registration OTP ----------
CREATE TABLE otp_codes (
  id INT AUTO_INCREMENT PRIMARY KEY,
  mobile_number VARCHAR(20) NOT NULL,
  code VARCHAR(10) NOT NULL,
  purpose VARCHAR(30) NOT NULL DEFAULT 'register',
  attempts TINYINT NOT NULL DEFAULT 0,
  verified_at DATETIME DEFAULT NULL,
  superseded TINYINT(1) NOT NULL DEFAULT 0,
  expires_at DATETIME NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_otp_mobile (mobile_number),
  INDEX idx_otp_created (created_at)
);

-- ---------- Announcements ----------
CREATE TABLE announcements (
  id INT AUTO_INCREMENT PRIMARY KEY,
  title VARCHAR(200) NOT NULL,
  body TEXT NOT NULL,
target_type ENUM('all','farmer','fisherfolk','livestock_owner') NOT NULL DEFAULT 'all',
    target_beneficiary_types JSON NOT NULL,
    send_sms TINYINT(1) NOT NULL DEFAULT 0,
    status ENUM('draft','published') NOT NULL DEFAULT 'draft',
    published_at DATETIME DEFAULT NULL,
    type ENUM('announcement','program','training','general') NOT NULL DEFAULT 'announcement',
  sms_sent TINYINT(1) NOT NULL DEFAULT 0,
  notified TINYINT(1) NOT NULL DEFAULT 0,
  notified_types JSON NULL,
  created_by INT DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_ann_creator FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
);

-- ---------- Programs ----------
CREATE TABLE programs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  title VARCHAR(200) NOT NULL,
  description TEXT,
target_type ENUM('all','farmer','fisherfolk','livestock_owner','public') NOT NULL DEFAULT 'farmer',
    target_beneficiary_types JSON NOT NULL,
    venue VARCHAR(255),
  schedule DATETIME NULL,
  end_at DATETIME NULL,
  cancelled TINYINT(1) NOT NULL DEFAULT 0,
  show_on_website TINYINT(1) NOT NULL DEFAULT 0,
  category VARCHAR(40) NULL DEFAULT NULL,
  send_sms TINYINT(1) NOT NULL DEFAULT 0,
  sms_sent TINYINT(1) NOT NULL DEFAULT 0,
  notified TINYINT(1) NOT NULL DEFAULT 0,
  notified_types JSON NULL,
  status ENUM('draft','published') NOT NULL DEFAULT 'draft',
  published_at DATETIME NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE program_benefits (
  id INT AUTO_INCREMENT PRIMARY KEY,
  program_id INT NOT NULL,
  benefit TEXT NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  FOREIGN KEY (program_id) REFERENCES programs(id) ON DELETE CASCADE
);

-- ---------- Trainings / Seminars ----------
CREATE TABLE trainings (
  id INT AUTO_INCREMENT PRIMARY KEY,
  title VARCHAR(200) NOT NULL,
  description TEXT,
  target_type ENUM('all','farmer','fisherfolk','livestock_owner','public') NOT NULL DEFAULT 'all',
  target_beneficiary_types JSON NOT NULL,
  venue VARCHAR(200) DEFAULT NULL,
  event_date DATE DEFAULT NULL,
  start_time TIME DEFAULT NULL,
  end_time TIME DEFAULT NULL,
  -- Single schedule value, mirroring programs.schedule. The legacy DATE/TIME
  -- columns above are kept in sync from it for the calendar feed and mobile.
  schedule DATETIME NULL,
  -- Full end date+time for the date-range/time-range schedule. Kept in sync
  -- (end_date + end_time) like end_time above is for the legacy columns.
  end_at DATETIME NULL,
  show_on_website TINYINT(1) NOT NULL DEFAULT 0,
  category VARCHAR(40) NULL DEFAULT NULL,
  -- Lifecycle: is this session still happening. Separate from publish_status,
  -- which decides whether the row is visible to the public.
  status ENUM('upcoming','completed','cancelled') NOT NULL DEFAULT 'upcoming',
  publish_status ENUM('draft','published') NOT NULL DEFAULT 'published',
  published_at DATETIME NULL,
  created_by INT DEFAULT NULL,
  send_sms TINYINT(1) NOT NULL DEFAULT 0,
  sms_sent TINYINT(1) NOT NULL DEFAULT 0,
  notified TINYINT(1) NOT NULL DEFAULT 0,
  notified_types JSON NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE training_benefits (
  id INT AUTO_INCREMENT PRIMARY KEY,
  training_id INT NOT NULL,
  benefit TEXT NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  FOREIGN KEY (training_id) REFERENCES trainings(id) ON DELETE CASCADE
);

-- ---------- Service / Equipment Requests ----------
CREATE TABLE requests (
  id INT AUTO_INCREMENT PRIMARY KEY,
  beneficiary_id INT NOT NULL,
  type ENUM('service','equipment') NOT NULL,
  subject VARCHAR(200) NOT NULL,
  details TEXT,
  quantity INT DEFAULT 1,
  preferred_date DATE DEFAULT NULL,
  status ENUM('pending','approved','scheduled','in_progress','completed','rejected') NOT NULL DEFAULT 'pending',
  scheduled_for DATE DEFAULT NULL,
  admin_notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_req_beneficiary FOREIGN KEY (beneficiary_id) REFERENCES beneficiaries(id) ON DELETE CASCADE
);

-- History of a request's status changes (drives the beneficiary tracking timeline)
CREATE TABLE request_status_log (
  id INT AUTO_INCREMENT PRIMARY KEY,
  request_id INT NOT NULL,
  status ENUM('pending','approved','scheduled','in_progress','completed','rejected') NOT NULL,
  note VARCHAR(500) DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_rql_request (request_id),
  CONSTRAINT fk_rql_request FOREIGN KEY (request_id) REFERENCES requests(id) ON DELETE CASCADE
);

-- ---------- Animal Health Monitoring report ----------
-- Replaces the old Crop / Livestock / Fisheries `report_records` table. See
-- migrations/010_animal_health_monitoring.sql for why each old column went away
-- and why `activity` is a JSON array rather than an ENUM.
CREATE TABLE animal_health_records (
  id INT AUTO_INCREMENT PRIMARY KEY,
  record_date DATE NOT NULL,
  barangay VARCHAR(80) NOT NULL,
  farmer_name VARCHAR(160) NOT NULL,
  beneficiary_id INT DEFAULT NULL,
  activity JSON NOT NULL,
  medicine_used VARCHAR(160) NOT NULL,
  -- species and age_unit are plain VARCHAR, not ENUM: species is drawn from the
  -- managed list in report_option_values and age_unit from the report config, and the
  -- API enforces both, so the option lists never need an ALTER TABLE of their own.
  -- See migrations 011 and 012.
  species VARCHAR(64) NOT NULL COMMENT 'Species from the managed list',
  age_value SMALLINT UNSIGNED NOT NULL,
  age_unit VARCHAR(16) NOT NULL COMMENT 'Age unit from the report config list',
  no_of_heads INT UNSIGNED NOT NULL,
  -- A name, not a user id: attribution on a treatment sheet is not a login, and the
  -- office records work done by somebody who has no account. Kept apart from
  -- `created_by`, which is the ownership rule and stays a real user id. See
  -- migration 012 for why the foreign key went.
  treated_by VARCHAR(80) NOT NULL COMMENT 'Name from the managed staff list',
  created_by INT NOT NULL,
  request_id INT DEFAULT NULL,
  source ENUM('manual','request') NOT NULL DEFAULT 'manual',
  notes TEXT DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT uq_ahr_request UNIQUE (request_id),
  CONSTRAINT chk_ahr_age CHECK (age_value > 0),
  CONSTRAINT chk_ahr_heads CHECK (no_of_heads > 0),
  CONSTRAINT fk_ahr_beneficiary FOREIGN KEY (beneficiary_id) REFERENCES beneficiaries(id) ON DELETE SET NULL,
  CONSTRAINT fk_ahr_created_by FOREIGN KEY (created_by) REFERENCES users(id),
  CONSTRAINT fk_ahr_request FOREIGN KEY (request_id) REFERENCES requests(id) ON DELETE SET NULL,
  INDEX idx_ahr_date (record_date),
  INDEX idx_ahr_barangay (barangay),
  INDEX idx_ahr_species (species),
  INDEX idx_ahr_treated_by (treated_by)
);

-- ---------- Managed report option lists ----------
-- Option lists the office maintains from the report screen instead of in code:
-- which species the MAO treats, and who is recorded as treating an animal. They live
-- in storage rather than being derived from the records, so an entry outlives the
-- record it was added for and only leaves when an admin removes it. See migration 012.
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

-- ---------- FAQ / Chatbot knowledge ----------
CREATE TABLE faqs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  question VARCHAR(255) NOT NULL,
  answer TEXT NOT NULL,
  keywords VARCHAR(255) DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ---------- Landing page carousel (agriculture info slides) ----------
CREATE TABLE carousel_slides (
  id INT AUTO_INCREMENT PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  subtitle VARCHAR(500) DEFAULT NULL,
  category VARCHAR(60) NOT NULL DEFAULT 'Agriculture',
  image_url VARCHAR(500) DEFAULT NULL,
  link VARCHAR(500) DEFAULT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  status ENUM('active','inactive') NOT NULL DEFAULT 'active',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- ---------- Landing page: About cards ----------
CREATE TABLE about_cards (
  id INT AUTO_INCREMENT PRIMARY KEY,
  icon VARCHAR(40) NOT NULL DEFAULT 'leaf',
  title VARCHAR(255) NOT NULL,
  text TEXT,
  points JSON,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- ---------- Landing page: Stats band ----------
CREATE TABLE stats_cards (
  id INT AUTO_INCREMENT PRIMARY KEY,
  icon VARCHAR(40) NOT NULL DEFAULT 'leaf',
  value VARCHAR(100) NOT NULL,
  label VARCHAR(150) NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- ---------- Landing page: Why choose cards ----------
CREATE TABLE why_cards (
  id INT AUTO_INCREMENT PRIMARY KEY,
  icon VARCHAR(40) NOT NULL DEFAULT 'leaf',
  title VARCHAR(255) NOT NULL,
  description TEXT,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- ---------- Landing page: Service cards ----------
CREATE TABLE service_cards (
  id INT AUTO_INCREMENT PRIMARY KEY,
  service_key VARCHAR(60) NOT NULL UNIQUE,
  icon VARCHAR(40) NOT NULL DEFAULT 'leaf',
  title VARCHAR(255) NOT NULL,
  short VARCHAR(500) NOT NULL,
  intro TEXT,
  img VARCHAR(500) DEFAULT NULL,
  points JSON,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- ---------- Landing page: Contact info (single row) ----------
CREATE TABLE contact_info (
  id TINYINT UNSIGNED PRIMARY KEY DEFAULT 1,
  heading VARCHAR(120) DEFAULT '',
  title VARCHAR(120) DEFAULT '',
  address VARCHAR(255) DEFAULT '',
  hours VARCHAR(120) DEFAULT '',
  phone VARCHAR(40) DEFAULT '',
  email VARCHAR(120) DEFAULT '',
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- ---------- AI translation cache (source text -> Bisaya/Tagalog) ----------
CREATE TABLE translations (
  id INT AUTO_INCREMENT PRIMARY KEY,
  source_text TEXT NOT NULL,
  lang VARCHAR(10) NOT NULL DEFAULT 'bis',
  translated TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_src_lang (lang, source_text(191))
);

-- ---------- Notifications / SMS log ----------
CREATE TABLE notifications (
  id INT AUTO_INCREMENT PRIMARY KEY,
  beneficiary_id INT DEFAULT NULL,
  phone VARCHAR(20) DEFAULT NULL,
  type VARCHAR(30) NOT NULL DEFAULT 'sms',
  subject VARCHAR(200) DEFAULT '',
  subject_bis VARCHAR(200) DEFAULT NULL,
  message TEXT NOT NULL,
  message_bis TEXT DEFAULT NULL,
  status ENUM('sent','log','failed') NOT NULL DEFAULT 'sent',
  gateway_ref VARCHAR(255) DEFAULT NULL,
  notification_type ENUM('announcement','program','training','request_status') NOT NULL DEFAULT 'announcement',
  announcement_id INT DEFAULT NULL,
  request_id INT DEFAULT NULL,
  sent_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_notif_type (notification_type),
  INDEX idx_notif_request (request_id),
  CONSTRAINT fk_notif_beneficiary FOREIGN KEY (beneficiary_id) REFERENCES beneficiaries(id) ON DELETE SET NULL,
  CONSTRAINT fk_notif_announcement FOREIGN KEY (announcement_id) REFERENCES announcements(id) ON DELETE CASCADE,
  CONSTRAINT fk_notif_request FOREIGN KEY (request_id) REFERENCES requests(id) ON DELETE CASCADE
);

CREATE TABLE push_tokens (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  token VARCHAR(255) NOT NULL,
  lang VARCHAR(8) NOT NULL DEFAULT 'bis',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_push_token (token)
);

-- ============================================================
-- SEED DATA
-- ============================================================

-- Default accounts (password is BCrypt hash of "admin123" / "ana123")
-- The MAO account is seeded as the Super Admin because User Management is reachable
-- only by a Super Admin: a fresh database with none would have no way to create one.
-- Beneficiary accounts carry no name here because their real name lives on the
-- beneficiaries row, not on the login.
INSERT INTO users (email, first_name, middle_name, last_name, password_hash, role) VALUES
('admin@mao.gov.ph', 'MAO', NULL, 'Administrator', '$2a$10$xPp75tMDJr6uTWvxILTKEuBin6gODxn0nWSG4mPAFWkoSaetvKWdW', 'super_admin'), -- admin123
('ana@example.com',  NULL, NULL, NULL, '$2a$10$TGqMESefq7a48wBlAcnnKuUWi/jEogxjKGl6DXlKKbYIHakiG/.Vq', 'beneficiary'); -- ana123

INSERT INTO beneficiaries (user_id, first_name, last_name, contact_number, barangay, category, farm_location, area_hectares, livelihood, status) VALUES
((SELECT id FROM users WHERE email = 'ana@example.com'), 'Ana', 'Dumandan', '09171234567', 'Poblacion', 'farmer', 'Brgy. Poblacion, Medina', 2.50, 'Rice, Corn', 'verified'),
(NULL, 'Juan', 'Delacruz', '09182223344', 'Hipaya', 'fisherfolk', NULL, NULL, 'Fish cage', 'pending'),
(NULL, 'Pedro', 'Santos', '09213334455', 'Kibungsod', 'livestock_owner', NULL, 1.00, 'Swine', 'pending');

INSERT INTO announcements (title, body, target_type, target_beneficiary_types, send_sms, status, published_at, type, sms_sent, created_by) VALUES
('Fertilizer Voucher Distribution', 'Registered farmers may claim their fertilizer vouchers at the Municipal Agriculture Office starting Monday. Bring a valid ID and your farmer registry number.', 'farmer', JSON_ARRAY('farmer'), 1, 'published', CURRENT_TIMESTAMP, 'announcement', 0, 1),
('Free Rabies Vaccination for Swine/Poultry', 'The MAO will conduct free vaccination drive on July 30 at the municipal gym. Interested livestock owners should pre-register.', 'livestock_owner', JSON_ARRAY('livestock_owner'), 1, 'published', CURRENT_TIMESTAMP, 'program', 0, 1);

INSERT INTO programs (title, description, target_type, target_beneficiary_types, venue, schedule, send_sms, status, published_at) VALUES
('Rice Farmers Financial Assistance', 'Financial and farm-input assistance for rice farmers under the national program.', 'farmer', JSON_ARRAY('farmer'), 'MAO Office, Medina', '2026-09-25 09:00:00', 0, 'published', CURRENT_TIMESTAMP),
('Fisherfolk Livelihood Support', 'Provision of fish cages and fingerlings to registered fisherfolk.', 'fisherfolk', JSON_ARRAY('fisherfolk'), 'Municipal Hall, Medina', '2026-10-02 08:00:00', 0, 'published', CURRENT_TIMESTAMP);

INSERT INTO program_benefits (program_id, benefit, sort_order) VALUES
(1, 'Calculator assistance', 0),
(1, 'Farm input package', 1),
(1, 'Bottom area loan access', 2),
(2, 'Fish cage starter kit', 0),
(2, '5,000 fingerlings', 1);

INSERT INTO trainings (title, description, venue, schedule, event_date, start_time, end_time, status, target_type, target_beneficiary_types) VALUES
('Organic Farming Seminar', 'Two-day seminar on organic vegetable production and composting.', 'MAO Training Hall, Medina', '2026-09-10 08:00:00', '2026-09-10', '08:00:00', '17:00:00', 'upcoming', 'all', JSON_ARRAY('all')),
('Pest Management Workshop', 'Hands-on training on integrated pest management for rice and corn.', 'Brgy. Hall, Poblacion', '2026-09-24 09:00:00', '2026-09-24', '09:00:00', '16:00:00', 'upcoming', 'all', JSON_ARRAY('all'));

INSERT INTO training_benefits (training_id, benefit, sort_order) VALUES
(1, 'Organic production handbook', 0),
(1, 'Seed starter kit', 1),
(2, 'IPM pocket guide', 0);

-- Two more home-feed cards (migration 027): targeted to everyone so every
-- signed-in beneficiary sees them in "Latest from the MAO", published fresh
-- so they sort as the most recent.
INSERT INTO programs (title, description, target_type, target_beneficiary_types, venue, schedule, status, published_at, show_on_website) VALUES
('Distribution of Certified Seeds', 'Qualified beneficiaries may claim certified rice and vegetable seed packages at the MAO office. Bring a valid ID and your RSBSA number.', 'public', JSON_ARRAY('public'), 'MAO Office, Medina', '2026-10-22 09:00:00', 'published', CURRENT_TIMESTAMP, 1);

INSERT INTO program_benefits (program_id, benefit, sort_order) VALUES
(3, 'Certified seed package', 0);

INSERT INTO trainings (title, description, target_type, target_beneficiary_types, venue, schedule, event_date, start_time, end_time, status, publish_status, published_at, show_on_website) VALUES
('Organic Fertilizer Production Training', 'Hands-on session on making compost and organic fertilizers from farm and household waste. Free starter kit for participants.', 'all', JSON_ARRAY('all'), 'MAO Training Hall, Medina', '2026-10-21 09:00:00', '2026-10-21', '09:00:00', '16:00:00', 'upcoming', 'published', CURRENT_TIMESTAMP, 1);

INSERT INTO training_benefits (training_id, benefit, sort_order) VALUES
(3, 'Organic fertilizer starter kit', 0);

INSERT INTO requests (beneficiary_id, type, subject, details, quantity, preferred_date, status, scheduled_for, admin_notes) VALUES
(1, 'equipment', 'Hand Tractor', 'Requesting hand tractor for land preparation this season.', 1, '2026-09-01', 'approved', '2026-09-05', 'Tractor scheduled for morning shift.'),
(1, 'service', 'Rice Seed Assistance', 'Asking for certified rice seeds for 1 hectare.', 4, '2026-08-25', 'pending', NULL, NULL);

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
  ('species', 'Horse',   100),
  ('staff', 'MAO Administrator', 10);

-- The second sample record carries two activities, so the comma-separated Activity
-- cell and the summary's per-activity count both have a multi-activity row to show.

-- treated_by is a name from the staff list above, not a user id: it is attribution on
-- a treatment sheet, which the office records even for somebody with no login.
INSERT INTO animal_health_records
  (record_date, barangay, farmer_name, beneficiary_id, activity, medicine_used,
   species, age_value, age_unit, no_of_heads, treated_by, created_by, request_id, source, notes)
VALUES
  ('2026-08-15', 'South Poblacion', 'Ana S. Dela Cruz', NULL, JSON_ARRAY('Deworming'), 'Ivermectin 3.15%', 'Carabao', 24, 'months', 2, 'MAO Administrator', 1, NULL, 'manual', 'Routine round during the planting season.'),
  ('2026-08-20', 'North Poblacion', 'Ramon B. Lantoy', NULL, JSON_ARRAY('Deworming', 'Vitamins'), 'Ivermectin 3.15%, Vitamin B12', 'Carabao', 36, 'months', 1, 'MAO Administrator', 1, NULL, 'manual', 'Weak animal brought in for follow-up.');

INSERT INTO carousel_slides (title, category, image_url, sort_order, status) VALUES
('Rice farming across Medina''s lowland barangays', 'Rice', 'https://images.unsplash.com/photo-1500382017468-9049fed747ef?w=1600&q=80&auto=format&fit=crop', 1, 'active'),
('Vegetable farming support and technical visits', 'Crops', 'https://images.unsplash.com/photo-1518977676601-b53f82aba655?w=1600&q=80&auto=format&fit=crop', 2, 'active'),
('Fisheries development for coastal communities', 'Fisheries', 'https://images.unsplash.com/photo-1544551763-46a013bb70d5?w=1600&q=80&auto=format&fit=crop', 3, 'active'),
('Agricultural trainings and community seminars', 'Training', 'https://images.unsplash.com/photo-1552664730-d307ca884978?w=1600&q=80&auto=format&fit=crop', 4, 'active'),
('Distribution of certified seeds and farm inputs', 'Services', 'https://images.unsplash.com/photo-1625246333195-78d9c38ad449?w=1600&q=80&auto=format&fit=crop', 5, 'active');

INSERT INTO contact_info (id, heading, title, address, hours, phone, email) VALUES
(1, 'Get in Touch', 'Contact the MAO', 'Poblacion, Medina, Misamis Oriental', 'Monday–Friday, 8:00 AM – 5:00 PM', '09177196318', 'frederickdocdoc6@gmail.com');

INSERT INTO about_cards (icon, title, text, points, sort_order) VALUES
('building', 'History', 'The Municipal Agriculture Office of Medina was established to carry out the municipality''s agricultural extension mandate under the Local Government Code, coordinating with provincial and national agencies to bring farm and fishery support directly to Medina''s barangays.', NULL, 0),
('target', 'Purpose', 'To improve the productivity, income, and resilience of farming, fishing, and livestock-raising households in Medina through accessible programs, technical guidance, and timely information.', NULL, 1),
('clipboard', 'Responsibilities', '', JSON_ARRAY(
  'Extension services for crop, livestock, and fisheries',
  'Distribution of certified seeds and farm inputs',
  'Veterinary and animal health services',
  'Agricultural surveys and farm registration',
  'Community training and cooperative support'
), 2);

INSERT INTO stats_cards (icon, value, label, sort_order) VALUES
('layers', '4', 'Services Offered', 0),
('users', '3,240+', 'Registered Beneficiaries', 1),
('trending', '19', 'Partner Barangays', 2);

INSERT INTO why_cards (icon, title, description, sort_order) VALUES
('zap', 'Faster service delivery', 'File requests and check schedules online instead of waiting in line.', 0),
('layers', 'Centralized information', 'Programs, services, and requirements in one consistent place.', 1),
('megaphone', 'Real-time announcements', 'Know about releases, drives, and deadlines as soon as they''re posted.', 2),
('clipboard', 'Easy access to programs', 'Browse eligibility and schedules before applying at the office.', 3),
('user-check', 'Digital beneficiary management', 'Your records and application history stay tied to one account.', 4),
('message', 'Better communication', 'A direct, documented channel between the MAO and beneficiaries.', 5);

INSERT INTO service_cards (service_key, icon, title, short, intro, img, points, sort_order) VALUES
('crop', 'sprout', 'Crop Production', 'Seed distribution, fertilizer assistance, farm consultations, and technical assistance.', 'Support for registered crop farmers, from planting to harvest.', 'https://images.unsplash.com/photo-1500382017468-9049fed747ef?w=900&q=80&auto=format&fit=crop', JSON_ARRAY(
  JSON_OBJECT('title', 'Seed distribution', 'desc', 'Certified rice, corn, and vegetable seeds released on a scheduled basis per barangay.'),
  JSON_OBJECT('title', 'Fertilizer assistance', 'desc', 'Subsidized fertilizer allocations tied to farm size and crop type.'),
  JSON_OBJECT('title', 'Farm consultations', 'desc', 'One-on-one guidance from agricultural technologists on soil, pest, and crop issues.'),
  JSON_OBJECT('title', 'Technical assistance', 'desc', 'On-site visits for planting, spacing, and harvest planning support.')
), 0),
('vet', 'stethoscope', 'Veterinary Services', 'Animal vaccination, consultation, disease prevention, and animal treatment.', 'Health services for livestock and poultry raised by MAO beneficiaries.', 'https://images.unsplash.com/photo-1500595046743-cd271d694d30?w=900&q=80&auto=format&fit=crop', JSON_ARRAY(
  JSON_OBJECT('title', 'Animal vaccination', 'desc', 'Scheduled vaccination rounds for carabao, cattle, goats, and poultry by barangay.'),
  JSON_OBJECT('title', 'Consultation', 'desc', 'Veterinary staff available for health checks and treatment advice.'),
  JSON_OBJECT('title', 'Disease prevention', 'desc', 'Deworming drives and monitoring to prevent outbreaks before they spread.'),
  JSON_OBJECT('title', 'Animal treatment', 'desc', 'Direct treatment for sick or injured livestock referred by owners.')
), 1),
('fisheries', 'fish', 'Fisheries Services', 'Fingerling distribution, fisheries assistance, and pond management.', 'Support for registered fisherfolk and small-scale aquaculture operators.', 'https://images.unsplash.com/photo-1544551763-46a013bb70d5?w=900&q=80&auto=format&fit=crop', JSON_ARRAY(
  JSON_OBJECT('title', 'Fingerling distribution', 'desc', 'Tilapia and other fingerlings released to registered pond and cage operators.'),
  JSON_OBJECT('title', 'Fisheries assistance', 'desc', 'Gear, boat repair, and registration support for municipal fisherfolk.'),
  JSON_OBJECT('title', 'Pond management', 'desc', 'Guidance on water quality, stocking density, and harvest timing.')
), 2),
('extension', 'graduation', 'Agricultural Extension', 'Trainings, seminars, farmer education, and field demonstrations.', 'Education and field-based learning for farming and fishing households.', 'https://images.unsplash.com/photo-1552664730-d307ca884978?w=900&q=80&auto=format&fit=crop', JSON_ARRAY(
  JSON_OBJECT('title', 'Trainings', 'desc', 'Skills-based sessions on production techniques and farm recordkeeping.'),
  JSON_OBJECT('title', 'Seminars', 'desc', 'Cooperative management, market access, and financial literacy sessions.'),
  JSON_OBJECT('title', 'Farmer education', 'desc', 'Ongoing learning tracks for both new and experienced farmers.'),
  JSON_OBJECT('title', 'Field demonstrations', 'desc', 'Live demonstrations of new techniques on model farm plots.')
), 3);

INSERT INTO faqs (question, answer, keywords) VALUES
('What are the office hours of the Municipal Agriculture Office?', 'The MAO of Medina is open Monday to Friday, 8:00 AM to 5:00 PM, at the Municipal Agriculture Office compound.', 'hours open schedule time office'),
('How do I register as a beneficiary?', 'You can register through the AgriConnect Medina mobile app, or visit the Municipal Agriculture Office with a valid ID. Your application will be verified by MAO personnel.', 'register registration beneficiary how to apply'),
('What are the requirements for the Rice Farmers Financial Assistance?', 'Bring a valid government ID, proof of farming (e.g., lease agreement or farm certification from the barangay), and your farmer registry number.', 'requirements rice assistance financial'),
('How can I request agricultural equipment?', 'Open the AgriConnect Medina app, go to Requests, tap New Request, choose Equipment, fill in the details, and submit. MAO will review and schedule your request.', 'equipment request tractor how'),
('Do you provide free seedlings and seeds?', 'Yes. The MAO distributes certified seeds and seedlings under its programs, subject to availability and verified beneficiary status.', 'seeds seedlings free distribute'),
('How do I know if my request is approved?', 'You can monitor your request status in the AgriConnect Medina app under the Requests tab. You will also receive an SMS when the status changes.', 'status request approved monitor sms');