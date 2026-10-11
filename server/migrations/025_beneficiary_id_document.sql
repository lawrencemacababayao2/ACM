-- ============================================================
-- Migration 025 - Beneficiary ID document
--
-- Mobile self-registration now captures a photo of the
-- registrant's valid ID (camera or gallery). The API saves the
-- image to server/uploads and stores only its public path here,
-- the same way PATCH /api/me/photo handles profile_pic. The MAO
-- reviews it on the admin Beneficiaries page before verifying.
--
-- Safe to run more than once (idempotent).
-- Run:  mysql -u root -p acm < migrations/025_beneficiary_id_document.sql
-- ============================================================

USE acm;

SET @col := (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = 'acm' AND TABLE_NAME = 'beneficiaries' AND COLUMN_NAME = 'id_document');
SET @sql := IF(@col = 0,
  'ALTER TABLE beneficiaries ADD COLUMN id_document VARCHAR(255) NULL AFTER profile_pic',
  'DO 0');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
