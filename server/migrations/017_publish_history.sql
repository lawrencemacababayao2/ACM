-- Migration 017 - publication history for advisories (announcements)
--
-- Records every time an advisory is published or republished, so the Super Admin
-- can see the trail (who published it and when, and how many were reached),
-- instead of only the very first published_at on the row.
--
-- Run:  node run-migration.mjs migrations/017_publish_history.sql

CREATE TABLE IF NOT EXISTS announcement_publish_log (
  id INT AUTO_INCREMENT PRIMARY KEY,
  announcement_id INT NOT NULL,
  action VARCHAR(32) NOT NULL,             -- 'published' | 'republished'
  published_at DATETIME NOT NULL,
  actor_id INT NULL,
  sms_recipients INT NOT NULL DEFAULT 0,
  app_recipients INT NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_ann_publish_log_ann (announcement_id),
  CONSTRAINT fk_ann_publish_log_ann FOREIGN KEY (announcement_id)
    REFERENCES announcements(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SELECT 'announcement_publish_log ready' AS status;