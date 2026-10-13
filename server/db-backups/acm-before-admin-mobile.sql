-- MariaDB dump 10.19  Distrib 10.4.32-MariaDB, for Win64 (AMD64)
--
-- Host: 127.0.0.1    Database: acm
-- ------------------------------------------------------
-- Server version	10.4.32-MariaDB

/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8mb4 */;
/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;
/*!40103 SET TIME_ZONE='+00:00' */;
/*!40014 SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0 */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;

--
-- Current Database: `acm`
--

CREATE DATABASE /*!32312 IF NOT EXISTS*/ `acm` /*!40100 DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci */;

USE `acm`;

--
-- Table structure for table `about_cards`
--

DROP TABLE IF EXISTS `about_cards`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `about_cards` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `icon` varchar(40) NOT NULL DEFAULT 'leaf',
  `title` varchar(255) NOT NULL,
  `text` text DEFAULT NULL,
  `points` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`points`)),
  `sort_order` int(11) NOT NULL DEFAULT 0,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=4 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `about_cards`
--

LOCK TABLES `about_cards` WRITE;
/*!40000 ALTER TABLE `about_cards` DISABLE KEYS */;
INSERT INTO `about_cards` VALUES (1,'building','History','The Municipal Agriculture Office of Medina was established to carry out the municipality\'s agricultural extension mandate under the Local Government Code, coordinating with provincial and national agencies to bring farm and fishery support directly to Medina\'s barangays.',NULL,0,'2026-10-04 19:16:10','2026-10-04 19:16:10'),(2,'target','Purpose','To improve the productivity, income, and resilience of farming, fishing, and livestock-raising households in Medina through accessible programs, technical guidance, and timely information.',NULL,1,'2026-10-04 19:16:10','2026-10-04 19:16:10'),(3,'clipboard','Responsibilities','','[\"Extension services for crop, livestock, and fisheries\", \"Distribution of certified seeds and farm inputs\", \"Veterinary and animal health services\", \"Agricultural surveys and farm registration\", \"Community training and cooperative support\"]',2,'2026-10-04 19:16:10','2026-10-04 19:16:10');
/*!40000 ALTER TABLE `about_cards` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `animal_health_records`
--

DROP TABLE IF EXISTS `animal_health_records`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `animal_health_records` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `record_date` date NOT NULL,
  `barangay` varchar(80) NOT NULL,
  `farmer_name` varchar(160) NOT NULL,
  `beneficiary_id` int(11) DEFAULT NULL,
  `activity` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL CHECK (json_valid(`activity`)),
  `medicine_used` varchar(160) NOT NULL,
  `species` varchar(64) NOT NULL COMMENT 'Species from the report config list',
  `age_value` smallint(5) unsigned NOT NULL,
  `age_unit` varchar(16) NOT NULL COMMENT 'Age unit from the report config list',
  `no_of_heads` int(10) unsigned NOT NULL,
  `treated_by` varchar(80) NOT NULL COMMENT 'Name from the staff list',
  `created_by` int(11) NOT NULL,
  `request_id` int(11) DEFAULT NULL,
  `source` enum('manual','request') NOT NULL DEFAULT 'manual',
  `notes` text DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_ahr_request` (`request_id`),
  KEY `fk_ahr_beneficiary` (`beneficiary_id`),
  KEY `fk_ahr_created_by` (`created_by`),
  KEY `idx_ahr_date` (`record_date`),
  KEY `idx_ahr_barangay` (`barangay`),
  KEY `idx_ahr_species` (`species`),
  KEY `idx_ahr_treated_by` (`treated_by`),
  CONSTRAINT `fk_ahr_beneficiary` FOREIGN KEY (`beneficiary_id`) REFERENCES `beneficiaries` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_ahr_created_by` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`),
  CONSTRAINT `fk_ahr_request` FOREIGN KEY (`request_id`) REFERENCES `requests` (`id`) ON DELETE SET NULL,
  CONSTRAINT `chk_ahr_age` CHECK (`age_value` > 0),
  CONSTRAINT `chk_ahr_heads` CHECK (`no_of_heads` > 0)
) ENGINE=InnoDB AUTO_INCREMENT=155 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `animal_health_records`
--

LOCK TABLES `animal_health_records` WRITE;
/*!40000 ALTER TABLE `animal_health_records` DISABLE KEYS */;
INSERT INTO `animal_health_records` VALUES (1,'2026-10-02','South Poblacion','Ana S. Dela Cruz',NULL,'[\"Deworming\"]','Ivermectin 3.15%','Carabao',24,'months',2,'MAO Administrator',1,NULL,'manual','Routine round during the planting season.','2026-10-05 09:09:16','2026-10-05 21:53:18'),(2,'2026-10-04','North Poblacion','Ramon B. Lantoy',NULL,'[\"Deworming\",\"Iron\"]','Ivermectin 3.15%, Vitamin B12','Carabao',36,'months',1,'MAO Administrator',1,NULL,'manual','Weak animal brought in for follow-up.','2026-10-05 09:09:16','2026-10-07 07:01:28'),(154,'2026-10-09','Bulwa','asdasd',NULL,'[\"Castration\",\"asd\"]','asdasd','Other',2,'weeks',3,'asdasd',1,NULL,'manual','asd','2026-10-08 20:51:15','2026-10-08 22:04:24');
/*!40000 ALTER TABLE `animal_health_records` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `announcements`
--

DROP TABLE IF EXISTS `announcements`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `announcements` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `title` varchar(200) NOT NULL,
  `body` text NOT NULL,
  `target_type` enum('all','farmer','fisherfolk','livestock_owner') NOT NULL DEFAULT 'all',
  `target_beneficiary_types` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL CHECK (json_valid(`target_beneficiary_types`)),
  `send_sms` tinyint(1) NOT NULL DEFAULT 0,
  `status` enum('draft','published') NOT NULL DEFAULT 'draft',
  `published_at` datetime DEFAULT NULL,
  `type` enum('announcement','program','training','general') NOT NULL DEFAULT 'announcement',
  `sms_sent` tinyint(1) NOT NULL DEFAULT 0,
  `notified` tinyint(1) NOT NULL DEFAULT 0,
  `created_by` int(11) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `fk_ann_creator` (`created_by`),
  CONSTRAINT `fk_ann_creator` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB AUTO_INCREMENT=14 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `announcements`
--

LOCK TABLES `announcements` WRITE;
/*!40000 ALTER TABLE `announcements` DISABLE KEYS */;
INSERT INTO `announcements` VALUES (1,'Fertilizer Voucher Distribution','Registered farmers may claim their fertilizer vouchers at the Municipal Agriculture Office starting Monday. Bring a valid ID and your farmer registry number.','farmer','[\"farmer\"]',1,'published','2026-10-05 03:16:10','announcement',0,0,1,'2026-10-04 19:16:10','2026-10-04 19:18:18'),(2,'Free Rabies Vaccination for Swine/Poultry','The MAO will conduct free vaccination drive on July 30 at the municipal gym. Interested livestock owners should pre-register.','livestock_owner','[\"livestock_owner\"]',1,'published','2026-10-05 03:16:10','program',0,0,1,'2026-10-04 19:16:10','2026-10-04 19:16:10'),(11,'test','test program','all','[\"farmer\",\"fisherfolk\",\"livestock_owner\"]',0,'published','2026-10-05 03:26:30','announcement',0,1,1,'2026-10-04 19:26:30','2026-10-04 19:26:30'),(12,'xcvxv','cxvxc','all','[\"all\"]',0,'published','2026-10-09 08:27:09','announcement',0,1,1,'2026-10-09 00:27:09','2026-10-09 00:27:09'),(13,'test title','test','farmer','[\"farmer\"]',1,'published','2026-10-09 09:48:56','announcement',1,1,1,'2026-10-09 01:48:17','2026-10-09 01:48:57');
/*!40000 ALTER TABLE `announcements` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `beneficiaries`
--

DROP TABLE IF EXISTS `beneficiaries`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `beneficiaries` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `user_id` int(11) DEFAULT NULL,
  `beneficiary_type` varchar(40) DEFAULT NULL,
  `rsbsa_number` varchar(60) DEFAULT NULL,
  `rsbsa_normalized` varchar(60) DEFAULT NULL,
  `rsbsa_match_id` int(11) DEFAULT NULL,
  `first_name` varchar(80) NOT NULL,
  `middle_name` varchar(80) DEFAULT NULL,
  `last_name` varchar(80) NOT NULL,
  `gender` enum('male','female') DEFAULT NULL,
  `birthday` date DEFAULT NULL,
  `suffix` varchar(20) DEFAULT NULL,
  `name_key` varchar(340) DEFAULT NULL,
  `contact_number` varchar(20) NOT NULL,
  `mobile_normalized` varchar(20) DEFAULT NULL,
  `province` varchar(80) DEFAULT NULL,
  `barangay` varchar(80) DEFAULT NULL,
  `purok` varchar(80) DEFAULT NULL,
  `category` enum('farmer','fisherfolk','livestock_owner') NOT NULL DEFAULT 'farmer',
  `farm_location` varchar(255) DEFAULT NULL,
  `area_hectares` decimal(8,2) DEFAULT NULL,
  `livelihood` varchar(120) DEFAULT NULL,
  `status` enum('pending','verified','rejected') NOT NULL DEFAULT 'pending',
  `profile_pic` mediumtext DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `claimed_rsbsa_number` varchar(60) GENERATED ALWAYS AS (if(`user_id` is null,NULL,`rsbsa_number`)) VIRTUAL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_beneficiaries_claimed_rsbsa` (`claimed_rsbsa_number`),
  UNIQUE KEY `uq_beneficiaries_rsbsa_normalized` (`rsbsa_normalized`),
  UNIQUE KEY `uq_beneficiaries_mobile_normalized` (`mobile_normalized`),
  UNIQUE KEY `uq_beneficiaries_name_birthday` (`name_key`,`birthday`),
  KEY `fk_ben_user` (`user_id`),
  KEY `fk_ben_rsbsa_match` (`rsbsa_match_id`),
  CONSTRAINT `fk_ben_rsbsa_match` FOREIGN KEY (`rsbsa_match_id`) REFERENCES `beneficiaries` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_ben_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB AUTO_INCREMENT=7 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `beneficiaries`
--

LOCK TABLES `beneficiaries` WRITE;
/*!40000 ALTER TABLE `beneficiaries` DISABLE KEYS */;
INSERT INTO `beneficiaries` VALUES (2,NULL,NULL,NULL,NULL,NULL,'Juan',NULL,'Delacruz',NULL,NULL,NULL,'juan||delacruz|','09182223344','09182223344',NULL,'Hipaya',NULL,'fisherfolk',NULL,NULL,'Fish cage','verified',NULL,'2026-10-04 19:16:10',NULL),(4,NULL,'farmer','123123123122223','123123123122223',NULL,'Lawrence','Cagas','Macababayao','male','2008-12-04','','lawrence|cagas|macababayao|','09262879243','09262879243','Misamis Oriental','Cabug','Purok 1','farmer',NULL,NULL,NULL,'verified',NULL,'2026-10-08 02:39:56',NULL),(6,NULL,'farmer','233333333333333',NULL,NULL,'Lawrence',NULL,'Cagas','male','2008-12-02','',NULL,'09232879243',NULL,'Misamis Oriental','Cabug','Purok 3','farmer',NULL,NULL,NULL,'verified',NULL,'2026-10-08 20:48:23',NULL);
/*!40000 ALTER TABLE `beneficiaries` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `carousel_slides`
--

DROP TABLE IF EXISTS `carousel_slides`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `carousel_slides` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `title` varchar(255) NOT NULL,
  `subtitle` varchar(500) DEFAULT NULL,
  `category` varchar(60) NOT NULL DEFAULT 'Agriculture',
  `image_url` varchar(500) DEFAULT NULL,
  `link` varchar(500) DEFAULT NULL,
  `sort_order` int(11) NOT NULL DEFAULT 0,
  `status` enum('active','inactive') NOT NULL DEFAULT 'active',
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=6 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `carousel_slides`
--

LOCK TABLES `carousel_slides` WRITE;
/*!40000 ALTER TABLE `carousel_slides` DISABLE KEYS */;
INSERT INTO `carousel_slides` VALUES (1,'Rice farming across Medina\'s lowland barangays',NULL,'Rice','https://images.unsplash.com/photo-1500382017468-9049fed747ef?w=1600&q=80&auto=format&fit=crop',NULL,1,'active','2026-10-04 19:16:10','2026-10-04 19:16:10'),(2,'Vegetable farming support and technical visits',NULL,'Crops','https://images.unsplash.com/photo-1518977676601-b53f82aba655?w=1600&q=80&auto=format&fit=crop',NULL,2,'active','2026-10-04 19:16:10','2026-10-04 19:16:10'),(3,'Fisheries development for coastal communities',NULL,'Fisheries','https://images.unsplash.com/photo-1544551763-46a013bb70d5?w=1600&q=80&auto=format&fit=crop',NULL,3,'active','2026-10-04 19:16:10','2026-10-04 19:16:10'),(4,'Agricultural trainings and community seminars',NULL,'Training','http://localhost:3001/uploads/1791492908122-32a850494971.jpg',NULL,4,'active','2026-10-04 19:16:10','2026-10-08 20:55:10'),(5,'Distribution of certified seeds and farm inputs',NULL,'Services','https://images.unsplash.com/photo-1625246333195-78d9c38ad449?w=1600&q=80&auto=format&fit=crop',NULL,5,'active','2026-10-04 19:16:10','2026-10-04 19:16:10');
/*!40000 ALTER TABLE `carousel_slides` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `contact_info`
--

DROP TABLE IF EXISTS `contact_info`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `contact_info` (
  `id` tinyint(3) unsigned NOT NULL DEFAULT 1,
  `heading` varchar(120) DEFAULT '',
  `title` varchar(120) DEFAULT '',
  `address` varchar(255) DEFAULT '',
  `hours` varchar(120) DEFAULT '',
  `phone` varchar(40) DEFAULT '',
  `email` varchar(120) DEFAULT '',
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `contact_info`
--

LOCK TABLES `contact_info` WRITE;
/*!40000 ALTER TABLE `contact_info` DISABLE KEYS */;
INSERT INTO `contact_info` VALUES (1,'Get in Touch','Contact the MAO','Poblacion, Medina, Misamis Oriental','MondayΓÇôFriday, 8:00 AM ΓÇô 5:00 PM','09177196318','frederickdocdoc6@gmail.com','2026-10-04 19:16:10');
/*!40000 ALTER TABLE `contact_info` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `faqs`
--

DROP TABLE IF EXISTS `faqs`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `faqs` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `question` varchar(255) NOT NULL,
  `answer` text NOT NULL,
  `keywords` varchar(255) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=7 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `faqs`
--

LOCK TABLES `faqs` WRITE;
/*!40000 ALTER TABLE `faqs` DISABLE KEYS */;
INSERT INTO `faqs` VALUES (1,'What are the office hours of the Municipal Agriculture Office?','The MAO of Medina is open Monday to Friday, 8:00 AM to 5:00 PM, at the Municipal Agriculture Office compound.','hours open schedule time office','2026-10-04 19:16:10'),(2,'How do I register as a beneficiary?','You can register through visiting the Municipal Agriculture Office with a valid ID.','register registration beneficiary how to apply','2026-10-04 19:16:10'),(4,'How can I request agricultural equipment?','Open the AgriConnect Medina app, go to Requests, tap New Request, choose Equipment, fill in the details, and submit. MAO will review and schedule your request.','equipment request tractor how','2026-10-04 19:16:10'),(5,'Do you provide free seedlings and seeds?','Yes. The MAO distributes certified seeds and seedlings under its programs, subject to availability and verified beneficiary status.','seeds seedlings free distribute','2026-10-04 19:16:10'),(6,'How do I know if my request is approved?','You can monitor your request status in the AgriConnect Medina app under the Requests tab. You will also receive an SMS when the status changes.','status request approved monitor sms','2026-10-04 19:16:10');
/*!40000 ALTER TABLE `faqs` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `idempotency_keys`
--

DROP TABLE IF EXISTS `idempotency_keys`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `idempotency_keys` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `key` varchar(128) NOT NULL,
  `user_id` int(11) NOT NULL,
  `route` varchar(255) NOT NULL,
  `request_hash` char(64) NOT NULL,
  `status` enum('in_progress','completed') NOT NULL DEFAULT 'in_progress',
  `status_code` smallint(6) DEFAULT NULL,
  `response_body` mediumtext DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `updated_at` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_idempotency` (`key`,`user_id`,`route`),
  KEY `idx_idempotency_created` (`created_at`)
) ENGINE=InnoDB AUTO_INCREMENT=36 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `idempotency_keys`
--

LOCK TABLES `idempotency_keys` WRITE;
/*!40000 ALTER TABLE `idempotency_keys` DISABLE KEYS */;
INSERT INTO `idempotency_keys` VALUES (1,'32a11fe0-0944-4e1b-9725-74526d7f6654',1,'POST /api/beneficiaries','a7a0c4e6952572e821ab65c7e1192837d6d9ca913422e4bef15edca0b9f20b95','completed',201,'{\"id\":4}','2026-10-08 10:39:56','2026-10-08 10:39:56'),(2,'87f9aaaa-100d-4d59-a83d-39af2bfe12e8',1,'POST /api/beneficiaries','e5e78dc4ee04b99dee0e8c516210f1e7babba0f985e6d0024b8844c341b2be7f','completed',201,'{\"id\":5}','2026-10-08 10:47:50','2026-10-08 10:47:50'),(3,'618c1652-8209-4009-98f6-08699f83eb78',1,'POST /api/users','053b4865fd5d168c1a79fca4c69918f34aa1db64f65ed6260ff96bcba88567f9','completed',201,'{\"id\":46,\"first_name\":\"sdfsd\",\"middle_name\":null,\"last_name\":\"sdfsdf\",\"email\":\"cagaslawrence44@gmail.com\",\"mobile_number\":\"09262879243\",\"role\":\"admin\",\"is_active\":1,\"created_at\":\"2026-10-08 12:41:34\",\"last_active_at\":null}','2026-10-08 12:41:33','2026-10-08 12:41:34'),(4,'6374a455-8f2f-43bf-a4f6-118825bd2047',1,'POST /api/programs','05a670e18b9b36198fd62cec6407495aec0adde16f23cf836936afc3c7bdfe49','completed',201,'{\"id\":8,\"target_beneficiary_types\":[\"public\"],\"sms_recipients\":0,\"app_recipients\":0,\"push_recipients\":0}','2026-10-08 13:48:07','2026-10-08 13:48:07'),(7,'676c4150-2427-4c36-be14-50131a320398',1,'POST /api/programs','6cb3166e2f81ac04aa2bec81b98848a8697c397e2cb68c92feb298c200d8ece5','completed',201,'{\"id\":9,\"target_beneficiary_types\":[\"farmer\"],\"sms_recipients\":0,\"app_recipients\":2,\"push_recipients\":0}','2026-10-09 04:46:22','2026-10-09 04:46:22'),(8,'49a60adf-34db-44fd-b16d-a89c72a308ce',1,'POST /api/beneficiaries','6ea583e6bfb9975a49bef62733db7108dc1c611205ce5164e4cc34e7f6955de3','completed',201,'{\"id\":6}','2026-10-09 04:48:23','2026-10-09 04:48:23'),(9,'98e23c68-bead-4852-9f6f-d11ab8f7abf1',1,'POST /api/reports/animal-health','b96f71dc46a825acc95349b99a7b4f467dee93166dad5a19199cf46ecb2253d5','completed',201,'{\"id\":154}','2026-10-09 04:51:15','2026-10-09 04:51:15'),(10,'081110e0-8ce0-4200-822c-242d4cd69303',1,'PUT /api/carousel/4','51291bc3d4030f6d729a110845dd1d9f53b70a9b4b736bb6d855a0da9da16e41','completed',200,'{\"ok\":true}','2026-10-09 04:53:36','2026-10-09 04:53:36'),(11,'112fe02d-5691-434a-bf3f-774b44a09ddf',1,'PUT /api/carousel/4','dc54752141b006c05f6ef1194fdce23b1dd7f93210d03e452a141ba81dfde467','completed',200,'{\"ok\":true}','2026-10-09 04:55:10','2026-10-09 04:55:10'),(12,'0d1e452a-f313-426d-852a-7206af340cc9',1,'PUT /api/beneficiaries/6','4ea133f3838667ca86c2ee77dac71930daa550e0ae079a442256d03040ff0f38','completed',200,'{\"ok\":true}','2026-10-09 05:00:12','2026-10-09 05:00:12'),(13,'aee3af68-baa6-40f0-adb3-c04a26762f8a',1,'PUT /api/faqs/2','db5b1e086967a143033c84962eae5fec951d8907bdb23670928b51ea7d862ea0','completed',200,'{\"ok\":true}','2026-10-09 05:06:14','2026-10-09 05:06:14'),(14,'25d9803c-d1f1-4655-8c3a-a88a818bd4d6',1,'PUT /api/reports/animal-health/154','701784839ed40b8bed93334ddbb32d84b22d5009e763499d7c872135b9a6d784','completed',200,'{\"ok\":true,\"id\":154}','2026-10-09 06:04:24','2026-10-09 06:04:24'),(15,'be6a31d2-f40b-4fc5-9745-a975ab5f2e47',1,'POST /api/trainings','f62d549bf93dd5281a449fc822ed9ff2e974ccf54f6ca8696b4ac4484ddbc54c','completed',201,'{\"id\":11,\"target_beneficiary_types\":[\"farmer\"],\"sms_recipients\":0,\"app_recipients\":2,\"push_recipients\":0}','2026-10-09 06:23:35','2026-10-09 06:23:35'),(16,'3bf73faf-f387-4009-a82b-d9a59190c716',1,'POST /api/programs','cbe0174a2881350993f2d85a27f2f0a0d4022000dc6126d9abb7ae18aae3c796','completed',201,'{\"id\":10,\"target_beneficiary_types\":[\"fisherfolk\"],\"sms_recipients\":0,\"app_recipients\":1,\"push_recipients\":0}','2026-10-09 07:55:16','2026-10-09 07:55:16'),(17,'98bb08d4-4728-41fd-8bb8-732ded3c9023',1,'PUT /api/programs/10','4fc45c1a56d372efa85e507605a62c121546da295410dfcd33ddaaae1828a7be','completed',200,'{\"ok\":true,\"target_beneficiary_types\":[\"fisherfolk\"],\"sms_recipients\":0,\"app_recipients\":0}','2026-10-09 07:55:57','2026-10-09 07:55:57'),(18,'62c11bb6-190a-4da2-a5ac-393d2248eb84',1,'POST /api/programs','f604bce4e3edd3b9d74274a18f77a0c49ee2d9dacde8b183450f6c90b88bb1fb','completed',201,'{\"id\":11,\"target_beneficiary_types\":[\"farmer\"],\"sms_recipients\":0,\"app_recipients\":0}','2026-10-09 08:11:46','2026-10-09 08:11:46'),(19,'2dfcaeab-9e56-42ad-8362-7e03e8ab4f57',1,'PUT /api/programs/11','05cc441555a61038001949bb735b4392be0b10ef8829cddf99fdec015969e8bd','completed',200,'{\"ok\":true,\"target_beneficiary_types\":[\"farmer\"],\"sms_recipients\":0,\"app_recipients\":2,\"push_recipients\":0}','2026-10-09 08:11:59','2026-10-09 08:11:59'),(20,'98c08df6-4391-4a51-8794-92d5aac2084f',1,'PUT /api/programs/11','05cc441555a61038001949bb735b4392be0b10ef8829cddf99fdec015969e8bd','completed',200,'{\"ok\":true,\"target_beneficiary_types\":[\"farmer\"],\"sms_recipients\":0,\"app_recipients\":0}','2026-10-09 08:13:03','2026-10-09 08:13:03'),(21,'8990ef23-e1e4-46ac-a22c-2514e0847678',1,'PUT /api/programs/11','38b675eba7a26f26bda666e9e3db5e3d7a6faa3bd3d231b6d451c67810ec1b89','completed',200,'{\"ok\":true,\"target_beneficiary_types\":[\"farmer\"],\"sms_recipients\":0,\"app_recipients\":0}','2026-10-09 08:13:11','2026-10-09 08:13:11'),(22,'b0822161-bf60-4118-9245-0c60a1f57de9',1,'PUT /api/programs/11','38b675eba7a26f26bda666e9e3db5e3d7a6faa3bd3d231b6d451c67810ec1b89','completed',200,'{\"ok\":true,\"target_beneficiary_types\":[\"farmer\"],\"sms_recipients\":0,\"app_recipients\":0}','2026-10-09 08:16:22','2026-10-09 08:16:22'),(23,'c5eda88e-576f-47bd-aca7-a1e32aee64c1',1,'PUT /api/programs/11','fc3eed8f53b484e94d8c3fd34bd96ab693aacca34c77a602ff8ae8e1f4ec2870','completed',200,'{\"ok\":true,\"target_beneficiary_types\":[\"farmer\"],\"sms_recipients\":0,\"app_recipients\":0}','2026-10-09 08:18:53','2026-10-09 08:18:53'),(24,'fabd9907-3e88-4e13-a1bc-50e7ab836000',1,'POST /api/programs','36b5bed8fd08776527228e07ffac340e017e79d3bba70f04841d877b76b48dfa','completed',201,'{\"id\":12,\"target_beneficiary_types\":[\"public\"],\"sms_recipients\":0,\"app_recipients\":0,\"push_recipients\":0}','2026-10-09 08:20:53','2026-10-09 08:20:54'),(25,'f1c034ec-023c-4b18-8e82-7d62b7755b5e',1,'POST /api/trainings','fe2c84d0a22cd377413976f4d02b6ad590efdcbdf2a8b61eefb92f3038c84192','completed',201,'{\"id\":12,\"target_beneficiary_types\":[\"public\"],\"sms_recipients\":0,\"app_recipients\":0,\"push_recipients\":0}','2026-10-09 08:21:39','2026-10-09 08:21:39'),(26,'9ce127d2-edb1-4422-9573-cd3f8d0c3ff2',1,'PUT /api/trainings/12','fe2c84d0a22cd377413976f4d02b6ad590efdcbdf2a8b61eefb92f3038c84192','completed',200,'{\"ok\":true,\"target_beneficiary_types\":[\"public\"],\"sms_recipients\":0,\"app_recipients\":0}','2026-10-09 08:22:17','2026-10-09 08:22:17'),(27,'37f10752-0625-4fe8-933f-4e3a7dfa1603',1,'POST /api/announcements','54441e1e635f9dd1c2969353d723acdff2c57bac11322811ffe23681ecaa2f04','completed',201,'{\"id\":12,\"ok\":true,\"target_beneficiary_types\":[\"all\"],\"sms_recipients\":0,\"app_recipients\":2,\"push_recipients\":0}','2026-10-09 08:27:09','2026-10-09 08:27:09'),(28,'7b682de2-7bb6-41b8-b77d-3c50df3100ce',1,'POST /api/announcements','b15dfbfb03cac3d2aaaad4f54a29ceb8b039b07b7dcb522b1cf5f8a8f1ea648d','completed',201,'{\"id\":13,\"ok\":true,\"target_beneficiary_types\":[\"farmer\"],\"sms_recipients\":0,\"app_recipients\":0}','2026-10-09 09:48:17','2026-10-09 09:48:17'),(29,'c4373bb3-0f4a-4315-8cd4-82f5e622f350',1,'PUT /api/announcements/13','cb57b1d3368a4bfa38996b3419878d28dae2511a2095c3dd1099bd9933157001','completed',200,'{\"ok\":true,\"target_beneficiary_types\":[\"farmer\"],\"sms_recipients\":1,\"app_recipients\":0,\"push_recipients\":0}','2026-10-09 09:48:56','2026-10-09 09:48:57'),(30,'614dc409-82f8-4644-8f27-37469dd977c8',1,'POST /api/programs','3173e14a3a68f88f356aa4fd9d21794aef14d6de40e30213d211d4e96ffc6aa9','completed',201,'{\"id\":13,\"target_beneficiary_types\":[\"farmer\"],\"sms_recipients\":1,\"app_recipients\":0,\"push_recipients\":0}','2026-10-09 09:57:34','2026-10-09 09:57:35'),(33,'40fabd14-94df-4214-ba80-3906ecaafa0a',1,'POST /api/trainings','7dbf3b82524712136af37d234c1f6862724ce80cfbc6035eae6ac9c81c75642a','completed',201,'{\"id\":14,\"target_beneficiary_types\":[\"farmer\"],\"sms_recipients\":1,\"app_recipients\":0,\"push_recipients\":0}','2026-10-09 11:07:02','2026-10-09 11:07:03'),(34,'276c283e-0c7d-41a2-8407-b09c2bf54379',1,'POST /api/programs','985c8dce72f8c15792a9984dfa5ddf7bcee2e3ce3adfd4dd307b8b153559c04f','completed',201,'{\"id\":14,\"target_beneficiary_types\":[\"farmer\"],\"sms_recipients\":1,\"app_recipients\":0,\"push_recipients\":0}','2026-10-09 11:08:58','2026-10-09 11:08:59'),(35,'b5ec2785-9ea4-4f6b-baad-6ca3a5e4e3a7',1,'PUT /api/trainings/14','3cad0832dbfe7979d3c027de3af1a091d22a83efddd3101f7d27e32c5878046c','completed',200,'{\"ok\":true,\"target_beneficiary_types\":[\"farmer\"],\"sms_recipients\":0,\"app_recipients\":0}','2026-10-09 11:26:21','2026-10-09 11:26:22');
/*!40000 ALTER TABLE `idempotency_keys` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `notifications`
--

DROP TABLE IF EXISTS `notifications`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `notifications` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `beneficiary_id` int(11) DEFAULT NULL,
  `phone` varchar(20) DEFAULT NULL,
  `type` varchar(30) NOT NULL DEFAULT 'sms',
  `subject` varchar(200) DEFAULT '',
  `subject_bis` varchar(200) DEFAULT NULL,
  `message` text NOT NULL,
  `message_bis` text DEFAULT NULL,
  `status` enum('sent','log','failed') NOT NULL DEFAULT 'sent',
  `gateway_ref` varchar(255) DEFAULT NULL,
  `notification_type` enum('announcement','program','training','request_status') NOT NULL DEFAULT 'announcement',
  `announcement_id` int(11) DEFAULT NULL,
  `request_id` int(11) DEFAULT NULL,
  `sent_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_notif_type` (`notification_type`),
  KEY `idx_notif_request` (`request_id`),
  KEY `fk_notif_beneficiary` (`beneficiary_id`),
  KEY `fk_notif_announcement` (`announcement_id`),
  CONSTRAINT `fk_notif_announcement` FOREIGN KEY (`announcement_id`) REFERENCES `announcements` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_notif_beneficiary` FOREIGN KEY (`beneficiary_id`) REFERENCES `beneficiaries` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_notif_request` FOREIGN KEY (`request_id`) REFERENCES `requests` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=42 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `notifications`
--

LOCK TABLES `notifications` WRITE;
/*!40000 ALTER TABLE `notifications` DISABLE KEYS */;
INSERT INTO `notifications` VALUES (5,NULL,'09171234567','app','ACM: test','ACM: test','test\ntest program','Bag-ong pahibalo\ntest\ntest program','log',NULL,'announcement',11,NULL,'2026-10-04 19:26:30'),(12,NULL,'09171234567','sms','Training: Test Published SMS Training','Pagbansay: Test Published SMS Training','Test Published SMS Training - publish + sms smoke test\nSchedule: Dec 1, 2026, 8:00 AM ΓÇô 5:00 PM\nVenue: MAO Office\nFor more details, please go to the AgriConnect mobile app.','Test Published SMS Training - publish + sms smoke test\nIskedyul: Dec 1, 2026, 8:00 AM ΓÇô 5:00 PM\nLugar: MAO Office\nPara sa dugang detalye, adto sa AgriConnect mobile app.','sent','{\"status\":200,\"message\":\"SMS successfully queued for delivery.\",\"message_id\":\"iSms-RkPYFX\",\"message_status_link\":\"https://sms.iprogtech.com/api/v1/sms_messages/status?api_token=12345\\u0026message_id=iSms-RkPYFX\",\"message_status_request_mode','training',NULL,NULL,'2026-10-07 09:13:22'),(13,2,'09182223344','sms','Training: Test Published SMS Training','Pagbansay: Test Published SMS Training','Test Published SMS Training - publish + sms smoke test\nSchedule: Dec 1, 2026, 8:00 AM ΓÇô 5:00 PM\nVenue: MAO Office\nFor more details, please go to the AgriConnect mobile app.','Test Published SMS Training - publish + sms smoke test\nIskedyul: Dec 1, 2026, 8:00 AM ΓÇô 5:00 PM\nLugar: MAO Office\nPara sa dugang detalye, adto sa AgriConnect mobile app.','sent','{\"status\":500,\"message\":[\"Smart/TNT networks do not accept shared sender names. Please get your own sender name approved at https://www.iprogsms.com/sender-names/new to support all networks.\"]}','training',NULL,NULL,'2026-10-07 09:13:22'),(14,NULL,'09213334455','sms','Training: Test Published SMS Training','Pagbansay: Test Published SMS Training','Test Published SMS Training - publish + sms smoke test\nSchedule: Dec 1, 2026, 8:00 AM ΓÇô 5:00 PM\nVenue: MAO Office\nFor more details, please go to the AgriConnect mobile app.','Test Published SMS Training - publish + sms smoke test\nIskedyul: Dec 1, 2026, 8:00 AM ΓÇô 5:00 PM\nLugar: MAO Office\nPara sa dugang detalye, adto sa AgriConnect mobile app.','sent','{\"status\":500,\"message\":[\"Smart/TNT networks do not accept shared sender names. Please get your own sender name approved at https://www.iprogsms.com/sender-names/new to support all networks.\"]}','training',NULL,NULL,'2026-10-07 09:13:22'),(15,NULL,'09171234567','sms','Training: Test Draft Training','Pagbansay: Test Draft Training','Test Draft Training - draft smoke test\nSchedule: Nov 5, 2026, 9:00 AM ΓÇô 12:00 PM\nVenue: Test Venue\nFor more details, please go to the AgriConnect mobile app.','Test Draft Training - draft smoke test\nIskedyul: Nov 5, 2026, 9:00 AM ΓÇô 12:00 PM\nLugar: Test Venue\nPara sa dugang detalye, adto sa AgriConnect mobile app.','sent','{\"status\":200,\"message\":\"SMS successfully queued for delivery.\",\"message_id\":\"iSms-kLgyyr\",\"message_status_link\":\"https://sms.iprogtech.com/api/v1/sms_messages/status?api_token=12345\\u0026message_id=iSms-kLgyyr\",\"message_status_request_mode','training',NULL,NULL,'2026-10-07 09:13:47'),(16,2,'09182223344','sms','Training: Test Draft Training','Pagbansay: Test Draft Training','Test Draft Training - draft smoke test\nSchedule: Nov 5, 2026, 9:00 AM ΓÇô 12:00 PM\nVenue: Test Venue\nFor more details, please go to the AgriConnect mobile app.','Test Draft Training - draft smoke test\nIskedyul: Nov 5, 2026, 9:00 AM ΓÇô 12:00 PM\nLugar: Test Venue\nPara sa dugang detalye, adto sa AgriConnect mobile app.','sent','{\"status\":500,\"message\":[\"Smart/TNT networks do not accept shared sender names. Please get your own sender name approved at https://www.iprogsms.com/sender-names/new to support all networks.\"]}','training',NULL,NULL,'2026-10-07 09:13:47'),(17,NULL,'09171234567','app','Program: P2 smoke test program','Programa: P2 smoke test program','P2 smoke test program - \nSchedule: Thu, Oct 8, 2026, 12:28 PM\nFor more details, please go to the AgriConnect mobile app.','P2 smoke test program - \nIskedyul: Thu, Oct 8, 2026, 12:28 PM\nPara sa dugang detalye, adto sa AgriConnect mobile app.','log',NULL,'program',NULL,NULL,'2026-10-08 04:28:38'),(18,4,'09262879243','app','Program: P2 smoke test program','Programa: P2 smoke test program','P2 smoke test program - \nSchedule: Thu, Oct 8, 2026, 12:28 PM\nFor more details, please go to the AgriConnect mobile app.','P2 smoke test program - \nIskedyul: Thu, Oct 8, 2026, 12:28 PM\nPara sa dugang detalye, adto sa AgriConnect mobile app.','log',NULL,'program',NULL,NULL,'2026-10-08 04:28:38'),(19,NULL,'09346578976','app','Program: P2 smoke test program','Programa: P2 smoke test program','P2 smoke test program - \nSchedule: Thu, Oct 8, 2026, 12:28 PM\nFor more details, please go to the AgriConnect mobile app.','P2 smoke test program - \nIskedyul: Thu, Oct 8, 2026, 12:28 PM\nPara sa dugang detalye, adto sa AgriConnect mobile app.','log',NULL,'program',NULL,NULL,'2026-10-08 04:28:38'),(20,NULL,'09171234567','app','Training: P2 smoke test training','Pagbansay: P2 smoke test training','P2 smoke test training - \nSchedule: Thu, Oct 8, 2026, 12:28 PM\nFor more details, please go to the AgriConnect mobile app.','P2 smoke test training - \nIskedyul: Thu, Oct 8, 2026, 12:28 PM\nPara sa dugang detalye, adto sa AgriConnect mobile app.','log',NULL,'training',NULL,NULL,'2026-10-08 04:28:38'),(21,4,'09262879243','app','Training: P2 smoke test training','Pagbansay: P2 smoke test training','P2 smoke test training - \nSchedule: Thu, Oct 8, 2026, 12:28 PM\nFor more details, please go to the AgriConnect mobile app.','P2 smoke test training - \nIskedyul: Thu, Oct 8, 2026, 12:28 PM\nPara sa dugang detalye, adto sa AgriConnect mobile app.','log',NULL,'training',NULL,NULL,'2026-10-08 04:28:38'),(22,NULL,'09346578976','app','Training: P2 smoke test training','Pagbansay: P2 smoke test training','P2 smoke test training - \nSchedule: Thu, Oct 8, 2026, 12:28 PM\nFor more details, please go to the AgriConnect mobile app.','P2 smoke test training - \nIskedyul: Thu, Oct 8, 2026, 12:28 PM\nPara sa dugang detalye, adto sa AgriConnect mobile app.','log',NULL,'training',NULL,NULL,'2026-10-08 04:28:38'),(23,NULL,'09171234567','app','Program: SMOKE Program ΓÇö Rice Assistance','Programa: SMOKE Program ΓÇö Rice Assistance','SMOKE Program ΓÇö Rice Assistance - Public smoke-test program.\nSchedule: Tue, Oct 13, 2026, 1:38 PM\nVenue: MAO Office, Medina\nFor more details, please go to the AgriConnect mobile app.','SMOKE Program ΓÇö Rice Assistance - Public smoke-test program.\nIskedyul: Tue, Oct 13, 2026, 1:38 PM\nLugar: MAO Office, Medina\nPara sa dugang detalye, adto sa AgriConnect mobile app.','log',NULL,'program',NULL,NULL,'2026-10-08 05:38:14'),(24,4,'09262879243','app','Program: SMOKE Program ΓÇö Rice Assistance','Programa: SMOKE Program ΓÇö Rice Assistance','SMOKE Program ΓÇö Rice Assistance - Public smoke-test program.\nSchedule: Tue, Oct 13, 2026, 1:38 PM\nVenue: MAO Office, Medina\nFor more details, please go to the AgriConnect mobile app.','SMOKE Program ΓÇö Rice Assistance - Public smoke-test program.\nIskedyul: Tue, Oct 13, 2026, 1:38 PM\nLugar: MAO Office, Medina\nPara sa dugang detalye, adto sa AgriConnect mobile app.','log',NULL,'program',NULL,NULL,'2026-10-08 05:38:14'),(25,NULL,'09171234567','app','Training: SMOKE Repro Training','Pagbansay: SMOKE Repro Training','SMOKE Repro Training - repro\nSchedule: Fri, Oct 16, 2026, 1:39 PM\nVenue: Hall\nFor more details, please go to the AgriConnect mobile app.','SMOKE Repro Training - repro\nIskedyul: Fri, Oct 16, 2026, 1:39 PM\nLugar: Hall\nPara sa dugang detalye, adto sa AgriConnect mobile app.','log',NULL,'training',NULL,NULL,'2026-10-08 05:39:20'),(26,4,'09262879243','app','Training: SMOKE Repro Training','Pagbansay: SMOKE Repro Training','SMOKE Repro Training - repro\nSchedule: Fri, Oct 16, 2026, 1:39 PM\nVenue: Hall\nFor more details, please go to the AgriConnect mobile app.','SMOKE Repro Training - repro\nIskedyul: Fri, Oct 16, 2026, 1:39 PM\nLugar: Hall\nPara sa dugang detalye, adto sa AgriConnect mobile app.','log',NULL,'training',NULL,NULL,'2026-10-08 05:39:20'),(27,NULL,'09171234567','app','Program: SMOKE Program ΓÇö Rice Assistance','Programa: SMOKE Program ΓÇö Rice Assistance','SMOKE Program ΓÇö Rice Assistance - Public smoke-test program.\nSchedule: Tue, Oct 13, 2026, 1:40 PM\nVenue: MAO Office, Medina\nFor more details, please go to the AgriConnect mobile app.','SMOKE Program ΓÇö Rice Assistance - Public smoke-test program.\nIskedyul: Tue, Oct 13, 2026, 1:40 PM\nLugar: MAO Office, Medina\nPara sa dugang detalye, adto sa AgriConnect mobile app.','log',NULL,'program',NULL,NULL,'2026-10-08 05:40:23'),(28,4,'09262879243','app','Program: SMOKE Program ΓÇö Rice Assistance','Programa: SMOKE Program ΓÇö Rice Assistance','SMOKE Program ΓÇö Rice Assistance - Public smoke-test program.\nSchedule: Tue, Oct 13, 2026, 1:40 PM\nVenue: MAO Office, Medina\nFor more details, please go to the AgriConnect mobile app.','SMOKE Program ΓÇö Rice Assistance - Public smoke-test program.\nIskedyul: Tue, Oct 13, 2026, 1:40 PM\nLugar: MAO Office, Medina\nPara sa dugang detalye, adto sa AgriConnect mobile app.','log',NULL,'program',NULL,NULL,'2026-10-08 05:40:23'),(29,NULL,'09171234567','app','Program: gyhfg','Programa: gyhfg','gyhfg - fghfgh\nSchedule: Fri, Oct 9, 2026, 9:00 AM\nFor more details, please go to the AgriConnect mobile app.','gyhfg - fghfgh\nIskedyul: Fri, Oct 9, 2026, 9:00 AM\nPara sa dugang detalye, adto sa AgriConnect mobile app.','log',NULL,'program',NULL,NULL,'2026-10-08 20:46:22'),(30,4,'09262879243','app','Program: gyhfg','Programa: gyhfg','gyhfg - fghfgh\nSchedule: Fri, Oct 9, 2026, 9:00 AM\nFor more details, please go to the AgriConnect mobile app.','gyhfg - fghfgh\nIskedyul: Fri, Oct 9, 2026, 9:00 AM\nPara sa dugang detalye, adto sa AgriConnect mobile app.','log',NULL,'program',NULL,NULL,'2026-10-08 20:46:22'),(31,NULL,'09171234567','app','Training: dfgdfg','Pagbansay: dfgdfg','dfgdfg - dfgd\nSchedule: Fri, Oct 9, 2026, 6:00 AM\nVenue: dfgdfg\nFor more details, please go to the AgriConnect mobile app.','dfgdfg - dfgd\nIskedyul: Fri, Oct 9, 2026, 6:00 AM\nLugar: dfgdfg\nPara sa dugang detalye, adto sa AgriConnect mobile app.','log',NULL,'training',NULL,NULL,'2026-10-08 22:23:35'),(32,4,'09262879243','app','Training: dfgdfg','Pagbansay: dfgdfg','dfgdfg - dfgd\nSchedule: Fri, Oct 9, 2026, 6:00 AM\nVenue: dfgdfg\nFor more details, please go to the AgriConnect mobile app.','dfgdfg - dfgd\nIskedyul: Fri, Oct 9, 2026, 6:00 AM\nLugar: dfgdfg\nPara sa dugang detalye, adto sa AgriConnect mobile app.','log',NULL,'training',NULL,NULL,'2026-10-08 22:23:35'),(33,2,'09182223344','app','Program: dvfsd','Programa: dvfsd','dvfsd - sdfsdf\nSchedule: Fri, Oct 9, 2026, 7:00 AM\nVenue: sdfsdf\nFor more details, please go to the AgriConnect mobile app.','dvfsd - sdfsdf\nIskedyul: Fri, Oct 9, 2026, 7:00 AM\nLugar: sdfsdf\nPara sa dugang detalye, adto sa AgriConnect mobile app.','log',NULL,'program',NULL,NULL,'2026-10-08 23:55:16'),(34,NULL,'09171234567','app','Program: cxv','Programa: cxv','cxv - xcvxcv\nSchedule: Fri, Oct 9, 2026, 9:00 AM\nFor more details, please go to the AgriConnect mobile app.','cxv - xcvxcv\nIskedyul: Fri, Oct 9, 2026, 9:00 AM\nPara sa dugang detalye, adto sa AgriConnect mobile app.','log',NULL,'program',NULL,NULL,'2026-10-09 00:11:59'),(35,4,'09262879243','app','Program: cxv','Programa: cxv','cxv - xcvxcv\nSchedule: Fri, Oct 9, 2026, 9:00 AM\nFor more details, please go to the AgriConnect mobile app.','cxv - xcvxcv\nIskedyul: Fri, Oct 9, 2026, 9:00 AM\nPara sa dugang detalye, adto sa AgriConnect mobile app.','log',NULL,'program',NULL,NULL,'2026-10-09 00:11:59'),(36,2,'09182223344','app','ACM: xcvxv','ACM: xcvxv','xcvxv\ncxvxc','Bag-ong pahibalo\nxcvxv\ncxvxc','log',NULL,'announcement',12,NULL,'2026-10-09 00:27:09'),(37,4,'09262879243','app','ACM: xcvxv','ACM: xcvxv','xcvxv\ncxvxc','Bag-ong pahibalo\nxcvxv\ncxvxc','log',NULL,'announcement',12,NULL,'2026-10-09 00:27:09'),(38,4,'09262879243','sms','ACM: test title','ACM: test title','test title\ntest','Bag-ong pahibalo\ntest title\ntest','sent','{\"status\":200,\"message\":\"SMS successfully queued for delivery.\",\"message_id\":\"iSms-IRheTL\",\"message_status_link\":\"https://sms.iprogtech.com/api/v1/sms_messages/status?api_token=12345\\u0026message_id=iSms-IRheTL\",\"message_status_request_mode','announcement',13,NULL,'2026-10-09 01:48:56'),(39,4,'09262879243','sms','Program: program title','Programa: program title','program title - program desc\nSchedule: Sat, Oct 10, 2026, 9:00 AM\nVenue: MAO Office\nFor more details, please go to the AgriConnect mobile app.','program title - program desc\nIskedyul: Sat, Oct 10, 2026, 9:00 AM\nLugar: MAO Office\nPara sa dugang detalye, adto sa AgriConnect mobile app.','sent','{\"status\":200,\"message\":\"SMS successfully queued for delivery.\",\"message_id\":\"iSms-JbSuHM\",\"message_status_link\":\"https://sms.iprogtech.com/api/v1/sms_messages/status?api_token=12345\\u0026message_id=iSms-JbSuHM\",\"message_status_request_mode','program',NULL,NULL,'2026-10-09 01:57:34'),(40,4,'09262879243','sms','Training: seminar title','Pagbansay: seminar title','seminar title - desc\nSchedule: Fri, Oct 9, 2026, 1:10 AM\nVenue: MAO Office\nFor more details, please go to the AgriConnect mobile app.','seminar title - desc\nIskedyul: Fri, Oct 9, 2026, 1:10 AM\nLugar: MAO Office\nPara sa dugang detalye, adto sa AgriConnect mobile app.','sent','{\"status\":200,\"message\":\"SMS successfully queued for delivery.\",\"message_id\":\"iSms-iZ2okh\",\"message_status_link\":\"https://sms.iprogtech.com/api/v1/sms_messages/status?api_token=12345\\u0026message_id=iSms-iZ2okh\",\"message_status_request_mode','training',NULL,NULL,'2026-10-09 03:07:02'),(41,4,'09262879243','sms','Program: xvc','Programa: xvc','xvc - desc\nSchedule: Fri, Oct 9, 2026, 8:30 AM\nVenue: xvxcv\nFor more details, please go to the AgriConnect mobile app.','xvc - desc\nIskedyul: Fri, Oct 9, 2026, 8:30 AM\nLugar: xvxcv\nPara sa dugang detalye, adto sa AgriConnect mobile app.','sent','{\"status\":200,\"message\":\"SMS successfully queued for delivery.\",\"message_id\":\"iSms-dhUHh4\",\"message_status_link\":\"https://sms.iprogtech.com/api/v1/sms_messages/status?api_token=12345\\u0026message_id=iSms-dhUHh4\",\"message_status_request_mode','program',NULL,NULL,'2026-10-09 03:08:58');
/*!40000 ALTER TABLE `notifications` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `otp_codes`
--

DROP TABLE IF EXISTS `otp_codes`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `otp_codes` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `mobile_number` varchar(20) NOT NULL,
  `code` varchar(10) NOT NULL,
  `purpose` varchar(30) NOT NULL DEFAULT 'register',
  `attempts` tinyint(4) NOT NULL DEFAULT 0,
  `verified_at` datetime DEFAULT NULL,
  `superseded` tinyint(1) NOT NULL DEFAULT 0,
  `expires_at` datetime NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_otp_mobile` (`mobile_number`),
  KEY `idx_otp_created` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `otp_codes`
--

LOCK TABLES `otp_codes` WRITE;
/*!40000 ALTER TABLE `otp_codes` DISABLE KEYS */;
/*!40000 ALTER TABLE `otp_codes` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `program_benefits`
--

DROP TABLE IF EXISTS `program_benefits`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `program_benefits` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `program_id` int(11) NOT NULL,
  `benefit` text NOT NULL,
  `sort_order` int(11) NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`),
  KEY `program_id` (`program_id`),
  CONSTRAINT `program_benefits_ibfk_1` FOREIGN KEY (`program_id`) REFERENCES `programs` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=14 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `program_benefits`
--

LOCK TABLES `program_benefits` WRITE;
/*!40000 ALTER TABLE `program_benefits` DISABLE KEYS */;
INSERT INTO `program_benefits` VALUES (1,1,'Calculator assistance',0),(2,1,'Farm input package',1),(3,1,'Bottom area loan access',2),(4,2,'Fish cage starter kit',0),(5,2,'5,000 fingerlings',1),(10,8,'asdasd',0),(12,10,'sdfsf',0),(13,13,'benefit 1',0);
/*!40000 ALTER TABLE `program_benefits` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `programs`
--

DROP TABLE IF EXISTS `programs`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `programs` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `title` varchar(200) NOT NULL,
  `description` text DEFAULT NULL,
  `target_type` enum('all','farmer','fisherfolk','livestock_owner','public') NOT NULL DEFAULT 'farmer',
  `target_beneficiary_types` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL CHECK (json_valid(`target_beneficiary_types`)),
  `venue` varchar(255) DEFAULT NULL,
  `schedule` datetime DEFAULT NULL,
  `end_at` datetime DEFAULT NULL,
  `cancelled` tinyint(1) NOT NULL DEFAULT 0,
  `show_on_website` tinyint(1) NOT NULL DEFAULT 0,
  `category` varchar(40) DEFAULT NULL,
  `send_sms` tinyint(1) NOT NULL DEFAULT 0,
  `sms_sent` tinyint(1) NOT NULL DEFAULT 0,
  `notified` tinyint(1) NOT NULL DEFAULT 0,
  `status` enum('draft','published') NOT NULL DEFAULT 'draft',
  `published_at` datetime DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=15 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `programs`
--

LOCK TABLES `programs` WRITE;
/*!40000 ALTER TABLE `programs` DISABLE KEYS */;
INSERT INTO `programs` VALUES (1,'Rice Farmers Financial Assistance','Financial and farm-input assistance for rice farmers under the national program.','farmer','[\"farmer\"]','MAO Office, Medina','2026-09-25 09:00:00',NULL,0,0,NULL,0,0,0,'published','2026-10-05 03:16:10','2026-10-04 19:16:10','2026-10-04 19:16:10'),(2,'Fisherfolk Livelihood Support','Provision of fish cages and fingerlings to registered fisherfolk.','fisherfolk','[\"fisherfolk\"]','Municipal Hall, Medina','2026-10-02 08:00:00',NULL,0,0,NULL,0,0,0,'published','2026-10-05 03:16:10','2026-10-04 19:16:10','2026-10-04 19:16:10'),(8,'asdasd','asdasd','public','[\"public\"]','xvxvx','2026-10-08 07:15:00','2026-10-08 06:00:00',0,1,'crops',0,0,1,'published','2026-10-08 13:48:07','2026-10-08 05:48:07','2026-10-08 05:48:07'),(9,'gyhfg','fghfgh','farmer','[\"farmer\"]',NULL,'2026-10-09 09:00:00','2026-10-09 01:00:00',1,0,'general',0,0,1,'published','2026-10-09 04:46:22','2026-10-08 20:46:22','2026-10-08 20:46:37'),(10,'dvfsd','sdfsdf','fisherfolk','[\"fisherfolk\"]','sdfsdf','2026-10-10 07:00:00','2026-10-10 08:00:00',0,0,NULL,0,0,1,'published','2026-10-09 07:55:16','2026-10-08 23:55:16','2026-10-08 23:55:57'),(11,'cxv','xcvxcv','farmer','[\"farmer\"]','lunao','2026-10-09 09:00:00','2026-10-09 09:05:00',0,0,NULL,1,0,1,'published','2026-10-09 08:11:59','2026-10-09 00:11:46','2026-10-09 00:18:53'),(12,'sgdfg','fvxc','public','[\"public\"]','dfgdfg','2026-10-09 09:00:00','2026-10-09 10:00:00',0,1,NULL,0,0,1,'published','2026-10-09 08:20:53','2026-10-09 00:20:53','2026-10-09 00:20:54'),(13,'program title','program desc','farmer','[\"farmer\"]','MAO Office','2026-10-10 09:00:00','2026-10-10 16:30:00',0,0,NULL,1,1,1,'published','2026-10-09 09:57:34','2026-10-09 01:57:34','2026-10-09 01:57:35'),(14,'xvc','desc','farmer','[\"farmer\"]','xvxcv','2026-10-09 08:30:00','2026-10-10 16:30:00',0,0,NULL,1,1,1,'published','2026-10-09 11:08:58','2026-10-09 03:08:58','2026-10-09 03:08:59');
/*!40000 ALTER TABLE `programs` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `push_tokens`
--

DROP TABLE IF EXISTS `push_tokens`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `push_tokens` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `user_id` int(11) NOT NULL,
  `token` varchar(255) NOT NULL,
  `lang` varchar(8) NOT NULL DEFAULT 'bis',
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_push_token` (`token`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `push_tokens`
--

LOCK TABLES `push_tokens` WRITE;
/*!40000 ALTER TABLE `push_tokens` DISABLE KEYS */;
/*!40000 ALTER TABLE `push_tokens` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `report_option_values`
--

DROP TABLE IF EXISTS `report_option_values`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `report_option_values` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `list_name` varchar(64) NOT NULL,
  `value` varchar(80) NOT NULL,
  `sort_order` int(11) NOT NULL DEFAULT 0,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_rov_list_value` (`list_name`,`value`),
  KEY `idx_rov_list` (`list_name`,`sort_order`,`value`)
) ENGINE=InnoDB AUTO_INCREMENT=78 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `report_option_values`
--

LOCK TABLES `report_option_values` WRITE;
/*!40000 ALTER TABLE `report_option_values` DISABLE KEYS */;
INSERT INTO `report_option_values` VALUES (2,'species','Cattle',20,'2026-10-05 21:53:18'),(4,'species','Sheep',40,'2026-10-05 21:53:18'),(5,'species','Pig',50,'2026-10-05 21:53:18'),(6,'species','Chicken',60,'2026-10-05 21:53:18'),(7,'species','Duck',70,'2026-10-05 21:53:18'),(8,'species','Tilapia',80,'2026-10-05 21:53:18'),(10,'species','Horse',100,'2026-10-05 21:53:18'),(11,'staff','MAO Administrator',10,'2026-10-05 21:53:18'),(13,'staff','Unassigned',900,'2026-10-05 21:53:18'),(56,'species','Goat',20,'2026-10-05 22:36:05'),(60,'species','jg',110,'2026-10-06 19:30:39'),(74,'staff','yyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyy',910,'2026-10-07 06:56:19'),(76,'staff','Rina the Vet',920,'2026-10-07 06:56:19'),(77,'staff','asdasd',930,'2026-10-08 20:51:02');
/*!40000 ALTER TABLE `report_option_values` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `request_status_log`
--

DROP TABLE IF EXISTS `request_status_log`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `request_status_log` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `request_id` int(11) NOT NULL,
  `status` enum('pending','approved','scheduled','in_progress','completed','rejected') NOT NULL,
  `note` varchar(500) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_rql_request` (`request_id`),
  CONSTRAINT `fk_rql_request` FOREIGN KEY (`request_id`) REFERENCES `requests` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=7 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `request_status_log`
--

LOCK TABLES `request_status_log` WRITE;
/*!40000 ALTER TABLE `request_status_log` DISABLE KEYS */;
/*!40000 ALTER TABLE `request_status_log` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `requests`
--

DROP TABLE IF EXISTS `requests`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `requests` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `beneficiary_id` int(11) NOT NULL,
  `type` enum('service','equipment') NOT NULL,
  `subject` varchar(200) NOT NULL,
  `details` text DEFAULT NULL,
  `quantity` int(11) DEFAULT 1,
  `preferred_date` date DEFAULT NULL,
  `status` enum('pending','approved','scheduled','in_progress','completed','rejected') NOT NULL DEFAULT 'pending',
  `scheduled_for` date DEFAULT NULL,
  `admin_notes` text DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `fk_req_beneficiary` (`beneficiary_id`),
  CONSTRAINT `fk_req_beneficiary` FOREIGN KEY (`beneficiary_id`) REFERENCES `beneficiaries` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=7 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `requests`
--

LOCK TABLES `requests` WRITE;
/*!40000 ALTER TABLE `requests` DISABLE KEYS */;
INSERT INTO `requests` VALUES (3,2,'equipment','Hand Tractor','Requesting hand tractor for land preparation this season.',1,'2026-10-09','approved','2026-10-14','Tractor scheduled for morning shift.','2026-10-09 01:43:00','2026-10-09 01:43:00'),(4,4,'service','Rice Seed Assistance','Asking for certified rice seeds for 1 hectare.',4,'2026-10-09','pending',NULL,NULL,'2026-10-09 01:43:00','2026-10-09 01:43:00'),(5,2,'equipment','Irrigation Pump Repair','Water pump unit needs servicing before the dry-season planting.',1,'2026-10-09','in_progress',NULL,'Technician dispatched.','2026-10-09 01:43:00','2026-10-09 01:43:00'),(6,4,'service','Fertilizer Subsidy Inquiry','Asked about the schedule for the fertilizer distribution.',1,'2026-10-09','rejected',NULL,'Not on the verified farmers list for this batch.','2026-10-09 01:43:00','2026-10-09 01:43:00');
/*!40000 ALTER TABLE `requests` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `service_cards`
--

DROP TABLE IF EXISTS `service_cards`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `service_cards` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `service_key` varchar(60) NOT NULL,
  `icon` varchar(40) NOT NULL DEFAULT 'leaf',
  `title` varchar(255) NOT NULL,
  `short` varchar(500) NOT NULL,
  `intro` text DEFAULT NULL,
  `img` varchar(500) DEFAULT NULL,
  `points` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`points`)),
  `sort_order` int(11) NOT NULL DEFAULT 0,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `service_key` (`service_key`)
) ENGINE=InnoDB AUTO_INCREMENT=5 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `service_cards`
--

LOCK TABLES `service_cards` WRITE;
/*!40000 ALTER TABLE `service_cards` DISABLE KEYS */;
INSERT INTO `service_cards` VALUES (1,'crop','sprout','Crop Production','Seed distribution, fertilizer assistance, farm consultations, and technical assistance.','Support for registered crop farmers, from planting to harvest.','https://images.unsplash.com/photo-1500382017468-9049fed747ef?w=900&q=80&auto=format&fit=crop','[{\"title\": \"Seed distribution\", \"desc\": \"Certified rice, corn, and vegetable seeds released on a scheduled basis per barangay.\"}, {\"title\": \"Fertilizer assistance\", \"desc\": \"Subsidized fertilizer allocations tied to farm size and crop type.\"}, {\"title\": \"Farm consultations\", \"desc\": \"One-on-one guidance from agricultural technologists on soil, pest, and crop issues.\"}, {\"title\": \"Technical assistance\", \"desc\": \"On-site visits for planting, spacing, and harvest planning support.\"}]',0,'2026-10-04 19:16:10','2026-10-04 19:16:10'),(2,'vet','stethoscope','Veterinary Services','Animal vaccination, consultation, disease prevention, and animal treatment.','Health services for livestock and poultry raised by MAO beneficiaries.','https://images.unsplash.com/photo-1500595046743-cd271d694d30?w=900&q=80&auto=format&fit=crop','[{\"title\": \"Animal vaccination\", \"desc\": \"Scheduled vaccination rounds for carabao, cattle, goats, and poultry by barangay.\"}, {\"title\": \"Consultation\", \"desc\": \"Veterinary staff available for health checks and treatment advice.\"}, {\"title\": \"Disease prevention\", \"desc\": \"Deworming drives and monitoring to prevent outbreaks before they spread.\"}, {\"title\": \"Animal treatment\", \"desc\": \"Direct treatment for sick or injured livestock referred by owners.\"}]',1,'2026-10-04 19:16:10','2026-10-04 19:16:10'),(3,'fisheries','fish','Fisheries Services','Fingerling distribution, fisheries assistance, and pond management.','Support for registered fisherfolk and small-scale aquaculture operators.','https://images.unsplash.com/photo-1544551763-46a013bb70d5?w=900&q=80&auto=format&fit=crop','[{\"title\": \"Fingerling distribution\", \"desc\": \"Tilapia and other fingerlings released to registered pond and cage operators.\"}, {\"title\": \"Fisheries assistance\", \"desc\": \"Gear, boat repair, and registration support for municipal fisherfolk.\"}, {\"title\": \"Pond management\", \"desc\": \"Guidance on water quality, stocking density, and harvest timing.\"}]',2,'2026-10-04 19:16:10','2026-10-04 19:16:10'),(4,'extension','graduation','Agricultural Extension','Trainings, seminars, farmer education, and field demonstrations.','Education and field-based learning for farming and fishing households.','https://images.unsplash.com/photo-1552664730-d307ca884978?w=900&q=80&auto=format&fit=crop','[{\"title\": \"Trainings\", \"desc\": \"Skills-based sessions on production techniques and farm recordkeeping.\"}, {\"title\": \"Seminars\", \"desc\": \"Cooperative management, market access, and financial literacy sessions.\"}, {\"title\": \"Farmer education\", \"desc\": \"Ongoing learning tracks for both new and experienced farmers.\"}, {\"title\": \"Field demonstrations\", \"desc\": \"Live demonstrations of new techniques on model farm plots.\"}]',3,'2026-10-04 19:16:10','2026-10-04 19:16:10');
/*!40000 ALTER TABLE `service_cards` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `stats_cards`
--

DROP TABLE IF EXISTS `stats_cards`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `stats_cards` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `icon` varchar(40) NOT NULL DEFAULT 'leaf',
  `value` varchar(100) NOT NULL,
  `label` varchar(150) NOT NULL,
  `sort_order` int(11) NOT NULL DEFAULT 0,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=4 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `stats_cards`
--

LOCK TABLES `stats_cards` WRITE;
/*!40000 ALTER TABLE `stats_cards` DISABLE KEYS */;
INSERT INTO `stats_cards` VALUES (1,'layers','4','Services Offered',0,'2026-10-04 19:16:10','2026-10-04 19:16:10'),(2,'users','3,240+','Registered Beneficiaries',1,'2026-10-04 19:16:10','2026-10-04 19:16:10'),(3,'trending','19','Partner Barangays',2,'2026-10-04 19:16:10','2026-10-04 19:16:10');
/*!40000 ALTER TABLE `stats_cards` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `training_benefits`
--

DROP TABLE IF EXISTS `training_benefits`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `training_benefits` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `training_id` int(11) NOT NULL,
  `benefit` text NOT NULL,
  `sort_order` int(11) NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`),
  KEY `training_id` (`training_id`),
  CONSTRAINT `training_benefits_ibfk_1` FOREIGN KEY (`training_id`) REFERENCES `trainings` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=5 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `training_benefits`
--

LOCK TABLES `training_benefits` WRITE;
/*!40000 ALTER TABLE `training_benefits` DISABLE KEYS */;
INSERT INTO `training_benefits` VALUES (3,14,'makauyab',0),(4,14,'makaasawa',1);
/*!40000 ALTER TABLE `training_benefits` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `trainings`
--

DROP TABLE IF EXISTS `trainings`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `trainings` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `title` varchar(200) NOT NULL,
  `description` text DEFAULT NULL,
  `target_type` enum('all','farmer','fisherfolk','livestock_owner','public') NOT NULL DEFAULT 'all',
  `target_beneficiary_types` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL CHECK (json_valid(`target_beneficiary_types`)),
  `venue` varchar(200) DEFAULT NULL,
  `event_date` date DEFAULT NULL,
  `start_time` time DEFAULT NULL,
  `end_time` time DEFAULT NULL,
  `schedule` datetime DEFAULT NULL,
  `end_at` datetime DEFAULT NULL,
  `show_on_website` tinyint(1) NOT NULL DEFAULT 0,
  `category` varchar(40) DEFAULT NULL,
  `send_sms` tinyint(1) NOT NULL DEFAULT 0,
  `sms_sent` tinyint(1) NOT NULL DEFAULT 0,
  `notified` tinyint(1) NOT NULL DEFAULT 0,
  `status` enum('upcoming','completed','cancelled') NOT NULL DEFAULT 'upcoming',
  `publish_status` enum('draft','published') NOT NULL DEFAULT 'published',
  `published_at` datetime DEFAULT NULL,
  `created_by` int(11) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=15 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `trainings`
--

LOCK TABLES `trainings` WRITE;
/*!40000 ALTER TABLE `trainings` DISABLE KEYS */;
INSERT INTO `trainings` VALUES (1,'Organic Farming Seminar','Two-day seminar on organic vegetable production and composting.','all','[\"all\"]','MAO Training Hall, Medina','2026-09-10','08:00:00','17:00:00','2026-09-10 08:00:00',NULL,0,NULL,0,0,0,'upcoming','published','2026-10-05 03:16:10',NULL,'2026-10-04 19:16:10','2026-10-07 09:30:53'),(2,'Pest Management Workshop','Hands-on training on integrated pest management for rice and corn.','all','[\"all\"]','Brgy. Hall, Poblacion','2026-09-24','09:00:00','16:00:00','2026-09-24 09:00:00',NULL,0,NULL,0,0,0,'upcoming','published','2026-10-05 03:16:10',NULL,'2026-10-04 19:16:10','2026-10-07 09:30:53'),(11,'dfgdfg','dfgd','farmer','[\"farmer\"]','dfgdfg','2026-10-09','06:00:00',NULL,'2026-10-09 06:00:00',NULL,0,NULL,0,0,1,'upcoming','published','2026-10-09 06:23:35',1,'2026-10-08 22:23:35','2026-10-08 22:23:35'),(12,'xcvxcv','xcvxc','public','[\"public\"]','xcvxc','2026-10-09','09:00:00',NULL,'2026-10-09 09:00:00',NULL,1,NULL,0,0,1,'upcoming','published','2026-10-09 08:21:39',1,'2026-10-09 00:21:39','2026-10-09 00:21:39'),(14,'seminar title','desc','farmer','[\"farmer\"]','MAO Office','2026-10-10','01:10:00','01:10:00','2026-10-10 01:10:00','2026-10-17 14:00:00',0,NULL,1,1,1,'upcoming','published','2026-10-09 11:07:02',1,'2026-10-09 03:07:02','2026-10-09 03:26:21');
/*!40000 ALTER TABLE `trainings` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `translations`
--

DROP TABLE IF EXISTS `translations`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `translations` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `source_text` text NOT NULL,
  `lang` varchar(10) NOT NULL DEFAULT 'bis',
  `translated` text NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_src_lang` (`lang`,`source_text`(191))
) ENGINE=InnoDB AUTO_INCREMENT=59 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `translations`
--

LOCK TABLES `translations` WRITE;
/*!40000 ALTER TABLE `translations` DISABLE KEYS */;
INSERT INTO `translations` VALUES (1,'History','bis','Kasaysayan','2026-10-08 03:25:05','2026-10-08 03:25:05'),(2,'The Municipal Agriculture Office of Medina was established to carry out the municipality\'s agricultural extension mandate under the Local Government Code, coordinating with provincial and national agencies to bring farm and fishery support directly to Medina\'s barangays.','bis','Ang Munisipal nga Opisina sa Agrikultura sa Medina gitukod aron ipatuman ang mandato sa agrikultural nga ekstensyon sa munisipyo ubos sa Local Government Code, nga nakigkoordinar sa mga probinsyal ug nasyonal nga ahensya aron madala ang suporta sa uma ug pangisda diretso sa mga barangay sa Medina.','2026-10-08 03:25:05','2026-10-08 03:25:05'),(3,'Purpose','bis','Katuyoan','2026-10-08 03:25:05','2026-10-08 03:25:05'),(4,'To improve the productivity, income, and resilience of farming, fishing, and livestock-raising households in Medina through accessible programs, technical guidance, and timely information.','bis','Aron mapaayo ang produktibidad, kita, ug kakayahan sa mga panimalay nga nag-uma, nagapangisda, ug nagatiman sa mga hayop sa Medina pinaagi sa mga accessible nga programa, teknikal nga giya, ug husto nga impormasyon.','2026-10-08 03:25:05','2026-10-08 03:25:05'),(5,'Responsibilities','bis','Mga Responsibilidad','2026-10-08 03:25:05','2026-10-08 03:25:05'),(6,'Extension services for crop, livestock, and fisheries','bis','Mga serbisyo sa ekstensyon para sa tanom, hayop, ug pangisda','2026-10-08 03:25:05','2026-10-08 03:25:05'),(7,'Distribution of certified seeds and farm inputs','bis','Pag-apod-apod sa mga sertipikadong binhi ug mga input sa uma','2026-10-08 03:25:05','2026-10-08 03:25:05'),(8,'Veterinary and animal health services','bis','Serbisyo sa beterinaryo ug kahimsog sa hayop','2026-10-08 03:25:05','2026-10-08 03:25:05'),(9,'Agricultural surveys and farm registration','bis','Mga agrikultural nga surbey ug rehistrasyon sa uma','2026-10-08 03:25:05','2026-10-08 03:25:05'),(10,'Community training and cooperative support','bis','Pagtudlo sa komunidad ug suporta sa kooperatiba','2026-10-08 03:25:05','2026-10-08 03:25:05'),(11,'Services Offered','bis','Mga Serbisyo nga Gi-offer','2026-10-08 03:25:05','2026-10-08 03:25:05'),(12,'Registered Beneficiaries','bis','Narehistrong mga Benepisyaryo','2026-10-08 03:25:05','2026-10-08 03:25:05'),(13,'Partner Barangays','bis','Mga Partner nga Barangay','2026-10-08 03:25:05','2026-10-08 03:25:05'),(14,'Crop Production','bis','Produksyon sa Tanom','2026-10-08 03:25:05','2026-10-08 03:25:05'),(15,'Seed distribution, fertilizer assistance, farm consultations, and technical assistance.','bis','Pag-apod-apod sa binhi, tabang sa abono, konsultasyon sa uma, ug teknikal nga tabang.','2026-10-08 03:25:05','2026-10-08 03:25:05'),(16,'Veterinary Services','bis','Serbisyo sa Beterinaryo','2026-10-08 03:25:05','2026-10-08 03:25:05'),(17,'Animal vaccination, consultation, disease prevention, and animal treatment.','bis','Pagbakuna sa hayop, konsultasyon, paglikay sa sakit, ug pagtambal sa hayop.','2026-10-08 03:25:05','2026-10-08 03:25:05'),(18,'Fisheries Services','bis','Serbisyo sa Pangisda','2026-10-08 03:25:05','2026-10-08 03:25:05'),(19,'Fingerling distribution, fisheries assistance, and pond management.','bis','Pag-apod-apod sa fingerling, tabang sa pangisda, ug pagdumala sa pond.','2026-10-08 03:25:05','2026-10-08 03:25:05'),(20,'Agricultural Extension','bis','Agrikultural nga Ekstensyon','2026-10-08 03:25:05','2026-10-08 03:25:05'),(21,'Trainings, seminars, farmer education, and field demonstrations.','bis','Mga training, seminar, edukasyon sa mag-uuma, ug field demonstrations.','2026-10-08 03:25:05','2026-10-08 03:25:05'),(22,'Faster service delivery','bis','Mas paspas nga paghatud sa serbisyo','2026-10-08 03:25:05','2026-10-08 03:25:05'),(23,'File requests and check schedules online instead of waiting in line.','bis','Mag-file og mga hangyo ug tan-awon ang mga iskedyul online imbis nga maghulat sa linya.','2026-10-08 03:25:05','2026-10-08 03:25:05'),(24,'Centralized information','bis','Sentralisadong impormasyon','2026-10-08 03:25:05','2026-10-08 03:25:05'),(25,'Programs, services, and requirements in one consistent place.','bis','Mga programa, serbisyo, ug mga kinahanglanon sa usa ka konsistent nga lugar.','2026-10-08 03:25:05','2026-10-08 03:25:05'),(26,'Real-time announcements','bis','Real-time nga mga anunsyo','2026-10-08 03:25:05','2026-10-08 03:25:05'),(27,'Know about releases, drives, and deadlines as soon as they\'re posted.','bis','Mahibal-an ang bahin sa mga pagpagawas, mga drive, ug mga deadline sa dihang kini ipahibalo.','2026-10-08 03:25:05','2026-10-08 03:25:05'),(28,'Easy access to programs','bis','Sayun nga pag-access sa mga programa','2026-10-08 03:25:05','2026-10-08 03:25:05'),(29,'Browse eligibility and schedules before applying at the office.','bis','Tan-awa ang eligibility ug mga iskedyul sa wala pa mag-aplay sa opisina.','2026-10-08 03:25:05','2026-10-08 03:25:05'),(30,'Digital beneficiary management','bis','Digital nga pagdumala sa benepisyaryo','2026-10-08 03:25:05','2026-10-08 03:25:05'),(31,'Your records and application history stay tied to one account.','bis','Ang imong mga rekord ug kasaysayan sa aplikasyon nakatali sa usa ka account.','2026-10-08 03:25:12','2026-10-08 03:25:12'),(32,'Better communication','bis','Mas maayo nga komunikasyon','2026-10-08 03:25:12','2026-10-08 03:25:12'),(33,'A direct, documented channel between the MAO and beneficiaries.','bis','Usa ka direkta, dokumentadong channel tali sa MAO ug mga benepisyaryo.','2026-10-08 03:25:12','2026-10-08 03:25:12'),(34,'Get in Touch','bis','Makig-uban','2026-10-08 03:25:12','2026-10-08 03:25:12'),(35,'Contact the MAO','bis','Kontaka ang MAO','2026-10-08 03:25:12','2026-10-08 03:25:12'),(36,'Poblacion, Medina, Misamis Oriental','bis','Poblacion, Medina, Misamis Oriental','2026-10-08 03:25:12','2026-10-08 03:25:12'),(37,'MondayΓÇôFriday, 8:00 AM ΓÇô 5:00 PM','bis','LunesΓÇôBiyernes, 8:00 AM ΓÇô 5:00 PM','2026-10-08 03:25:12','2026-10-08 03:25:12'),(38,'Fisheries','bis','Pangisda','2026-10-08 03:25:12','2026-10-08 03:25:12'),(39,'Fisheries development for coastal communities','bis','Pagpalambo sa pangisda para sa mga coastal communities','2026-10-08 03:25:12','2026-10-08 03:25:12'),(40,'How do I know if my request is approved?','bis','Unsaon nako paghibalo kung ang akong hangyo aprobado na?','2026-10-08 03:25:12','2026-10-08 03:25:12'),(41,'You can monitor your request status in the AgriConnect Medina app under the Requests tab. You will also receive an SMS when the status changes.','bis','Makahimo ka sa pagmonitor sa estado sa imong hangyo sa AgriConnect Medina app sa ilawom sa Requests tab. Makadawat ka usab og SMS kung mag-usab ang estado.','2026-10-08 03:25:12','2026-10-08 03:25:12'),(42,'Do you provide free seedlings and seeds?','bis','Nagaahat ba kamo og libre nga mga punla ug mga liso?','2026-10-08 03:25:12','2026-10-08 03:25:12'),(43,'Yes. The MAO distributes certified seeds and seedlings under its programs, subject to availability and verified beneficiary status.','bis','Oo. Ang MAO nag-apod-apod og mga sertipikadong liso ug punla ilawom sa iyang mga programa, depende sa pagk disponibilidad ug nakumpirmang estado sa benepisyaryo.','2026-10-08 03:25:12','2026-10-08 03:25:12'),(44,'How can I request agricultural equipment?','bis','Unsaon nako paghangyo og mga kagamitan sa agrikultura?','2026-10-08 03:25:12','2026-10-08 03:25:12'),(45,'Open the AgriConnect Medina app, go to Requests, tap New Request, choose Equipment, fill in the details, and submit. MAO will review and schedule your request.','bis','Ablihi ang AgriConnect Medina app, adto sa Requests, i-tap ang New Request, pilia ang Equipment, pun-a ang mga detalye, ug isumite. Susihon sa MAO ang imong hangyo ug i-schedule kini.','2026-10-08 03:25:12','2026-10-08 03:25:12'),(46,'What are the requirements for the Rice Farmers Financial Assistance?','bis','Unsa ang mga kinahanglanon para sa Financial Assistance sa mga Mag-uuma sa Humay?','2026-10-08 03:25:12','2026-10-08 03:25:12'),(47,'Bring a valid government ID, proof of farming (e.g., lease agreement or farm certification from the barangay), and your farmer registry number.','bis','Dala ang valid nga government ID, ebidensya sa pag-uma (sama sa lease agreement o farm certification gikan sa barangay), ug ang imong farmer registry number.','2026-10-08 03:25:12','2026-10-08 03:25:12'),(48,'How do I register as a beneficiary?','bis','Unsaon nako pagparehistro isip benepisyaryo?','2026-10-08 03:25:12','2026-10-08 03:25:12'),(49,'You can register through the AgriConnect Medina mobile app, or visit the Municipal Agriculture Office with a valid ID. Your application will be verified by MAO personnel.','bis','Makahimo ka sa pagparehistro pinaagi sa AgriConnect Medina mobile app, o bisitaha ang Municipal Agriculture Office uban ang valid ID. Ang imong aplikasyon susihon sa mga personnel sa MAO.','2026-10-08 03:25:12','2026-10-08 03:25:12'),(50,'What are the office hours of the Municipal Agriculture Office?','bis','Unsa ang mga oras sa opisina sa Municipal Agriculture Office?','2026-10-08 03:25:12','2026-10-08 03:25:12'),(51,'The MAO of Medina is open Monday to Friday, 8:00 AM to 5:00 PM, at the Municipal Agriculture Office compound.','bis','Ang MAO sa Medina bukas Lunes hangtod Biyernes, 8:00 AM hangtod 5:00 PM, sa compound sa Municipal Agriculture Office.','2026-10-08 03:25:12','2026-10-08 03:25:12'),(52,'Chat with Kabo, the AI assistant','bis','Makig-chat kang Kabo, ang AI assistant','2026-10-08 03:25:12','2026-10-08 03:25:12'),(53,'Training','bis','Pagsanay','2026-10-08 03:25:14','2026-10-08 03:25:14'),(54,'Agricultural trainings and community seminars','bis','Mga pagsanay sa agrikultura ug mga seminar sa komunidad','2026-10-08 03:25:14','2026-10-08 03:25:14'),(55,'Rice','bis','Humay','2026-10-08 03:25:14','2026-10-08 03:25:14'),(56,'Rice farming across Medina\'s lowland barangays','bis','Pagpanguma sa humay sa mga lowland barangay sa Medina','2026-10-08 03:25:14','2026-10-08 03:25:14'),(57,'Crops','bis','Mga Tanom','2026-10-08 03:25:22','2026-10-08 03:25:22'),(58,'Vegetable farming support and technical visits','bis','Suporta sa pag-uma sa mga utanon ug teknikal nga pagbisita','2026-10-08 03:25:22','2026-10-08 03:25:22');
/*!40000 ALTER TABLE `translations` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `users`
--

DROP TABLE IF EXISTS `users`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `users` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `first_name` varchar(80) DEFAULT NULL,
  `middle_name` varchar(80) DEFAULT NULL,
  `last_name` varchar(80) DEFAULT NULL,
  `email` varchar(150) DEFAULT NULL,
  `email_normalized` varchar(255) DEFAULT NULL,
  `mobile_number` varchar(20) DEFAULT NULL,
  `mobile_normalized` varchar(20) DEFAULT NULL,
  `password_hash` varchar(255) NOT NULL,
  `role` enum('admin','super_admin','technician','beneficiary') NOT NULL DEFAULT 'beneficiary',
  `is_active` tinyint(1) NOT NULL DEFAULT 1,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `last_active_at` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `email` (`email`),
  UNIQUE KEY `mobile_number` (`mobile_number`),
  UNIQUE KEY `uq_users_email_normalized` (`email_normalized`),
  UNIQUE KEY `uq_users_mobile_normalized` (`mobile_normalized`)
) ENGINE=InnoDB AUTO_INCREMENT=47 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `users`
--

LOCK TABLES `users` WRITE;
/*!40000 ALTER TABLE `users` DISABLE KEYS */;
INSERT INTO `users` VALUES (1,'MAO',NULL,'Administrator','admin@mao.gov.ph','admin@mao.gov.ph',NULL,NULL,'$2a$10$xPp75tMDJr6uTWvxILTKEuBin6gODxn0nWSG4mPAFWkoSaetvKWdW','super_admin',1,'2026-10-04 19:16:10','2026-10-08 13:40:23'),(2,NULL,NULL,NULL,'ana@example.com','ana@example.com',NULL,NULL,'$2a$10$TGqMESefq7a48wBlAcnnKuUWi/jEogxjKGl6DXlKKbYIHakiG/.Vq','beneficiary',1,'2026-10-04 19:16:10',NULL),(46,'sdfsd',NULL,'sdfsdf','cagaslawrence44@gmail.com',NULL,'09262879243',NULL,'$2a$10$kcrq1C4XlIa8EtUL3c76puXckpveRgacwPpIvdRb6Z5ySCwvK8UWy','admin',1,'2026-10-08 04:41:34',NULL);
/*!40000 ALTER TABLE `users` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `why_cards`
--

DROP TABLE IF EXISTS `why_cards`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `why_cards` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `icon` varchar(40) NOT NULL DEFAULT 'leaf',
  `title` varchar(255) NOT NULL,
  `description` text DEFAULT NULL,
  `sort_order` int(11) NOT NULL DEFAULT 0,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=7 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `why_cards`
--

LOCK TABLES `why_cards` WRITE;
/*!40000 ALTER TABLE `why_cards` DISABLE KEYS */;
INSERT INTO `why_cards` VALUES (1,'zap','Faster service delivery','File requests and check schedules online instead of waiting in line.',0,'2026-10-04 19:16:10','2026-10-04 19:16:10'),(2,'layers','Centralized information','Programs, services, and requirements in one consistent place.',1,'2026-10-04 19:16:10','2026-10-04 19:16:10'),(3,'megaphone','Real-time announcements','Know about releases, drives, and deadlines as soon as they\'re posted.',2,'2026-10-04 19:16:10','2026-10-04 19:16:10'),(4,'clipboard','Easy access to programs','Browse eligibility and schedules before applying at the office.',3,'2026-10-04 19:16:10','2026-10-04 19:16:10'),(5,'user-check','Digital beneficiary management','Your records and application history stay tied to one account.',4,'2026-10-04 19:16:10','2026-10-04 19:16:10'),(6,'message','Better communication','A direct, documented channel between the MAO and beneficiaries.',5,'2026-10-04 19:16:10','2026-10-04 19:16:10');
/*!40000 ALTER TABLE `why_cards` ENABLE KEYS */;
UNLOCK TABLES;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2026-10-09 12:14:30
