-- Legacy backup of `report_records`
-- Database: acm
-- Taken: 2026-10-05T08:57:00.540Z
-- Rows: 4
-- Restore with:
--   CREATE DATABASE acm_report_backup_restore;
--   mysql acm_report_backup_restore < report_records_2026-10-05085700.sql
-- Restoring re-creates the table and re-inserts every row.

DROP TABLE IF EXISTS `report_records`;

CREATE TABLE `report_records` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `category` enum('crop','livestock','fisheries') NOT NULL,
  `commodity` varchar(120) NOT NULL,
  `quantity` decimal(12,2) DEFAULT 0.00,
  `unit` varchar(40) DEFAULT '',
  `area_hectares` decimal(8,2) DEFAULT 0.00,
  `barangay` varchar(80) DEFAULT NULL,
  `notes` text DEFAULT NULL,
  `report_date` date DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=5 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO `report_records` (`id`, `category`, `commodity`, `quantity`, `unit`, `area_hectares`, `barangay`, `notes`, `report_date`, `created_at`) VALUES
  (1, 'crop', 'Rice', '4500.00', 'kg', '2.50', 'Poblacion', 'Wet season harvest (partial)', '2026-08-15', '2026-10-05 03:16:10'),
  (2, 'crop', 'Corn', '1200.00', 'kg', '1.20', 'Hipaya', 'White corn', '2026-08-20', '2026-10-05 03:16:10'),
  (3, 'livestock', 'Swine', '35.00', 'heads', '0.00', 'Kibungsod', 'Fatteners ready for sale', '2026-08-18', '2026-10-05 03:16:10'),
  (4, 'fisheries', 'Tilapia', '800.00', 'kg', '0.00', 'Maan-og', 'Fish cage harvest', '2026-08-22', '2026-10-05 03:16:10');
