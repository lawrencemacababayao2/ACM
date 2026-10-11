-- Migration: Fix animal health activity delimiter-less text
-- Split concatenated activity names into proper JSON arrays

-- Known activity names (longest first for matching)
-- Deworming, Castration, Vitamins, Antibiotic, Vaccination, Iron, Other

-- Step 1: Create a temporary table to hold the parsed activities
DROP TEMPORARY TABLE IF EXISTS temp_ahr_activities;
CREATE TEMPORARY TABLE temp_ahr_activities (
  id INT PRIMARY KEY,
  original_activity TEXT,
  parsed_activity JSON
);

-- Step 2: Insert records that need parsing
INSERT INTO temp_ahr_activities (id, original_activity, parsed_activity)
SELECT id, activity,
  CASE
    -- Already valid JSON array
    WHEN JSON_VALID(activity) AND JSON_TYPE(activity) = 'ARRAY' THEN activity
    -- Empty or null
    WHEN activity IS NULL OR TRIM(activity) = '' THEN JSON_ARRAY()
    -- Comma-separated values
    WHEN activity LIKE '%,%' THEN (
      SELECT JSON_ARRAYAGG(TRIM(part))
      FROM (
        SELECT TRIM(SUBSTRING_INDEX(SUBSTRING_INDEX(activity, ',', numbers.n), ',', -1)) AS part
        FROM (
          SELECT 1 AS n UNION ALL SELECT 2 UNION ALL SELECT 3 UNION ALL SELECT 4 UNION ALL SELECT 5 UNION ALL SELECT 6 UNION ALL SELECT 7
        ) numbers
        WHERE numbers.n <= 1 + (LENGTH(activity) - LENGTH(REPLACE(activity, ',', '')))
      ) parts
    )
    -- Delimiter-less text: split on known activity names (longest match first)
    ELSE (
      SELECT JSON_ARRAYAGG(activity_name)
      FROM (
        SELECT 'Deworming' AS activity_name UNION ALL
        SELECT 'Castration' UNION ALL
        SELECT 'Vitamins' UNION ALL
        SELECT 'Antibiotic' UNION ALL
        SELECT 'Vaccination' UNION ALL
        SELECT 'Iron' UNION ALL
        SELECT 'Other'
      ) activities
      WHERE LOCATE(activities.activity_name, animal_health_records.activity) > 0
      ORDER BY CHAR_LENGTH(activities.activity_name) DESC
    )
  END
FROM animal_health_records
WHERE activity IS NOT NULL
  AND TRIM(activity) != ''
  AND (
    NOT JSON_VALID(activity)
    OR JSON_TYPE(activity) != 'ARRAY'
  );

-- Step 3: Update the animal_health_records table with parsed activities
UPDATE animal_health_records ahr
JOIN temp_ahr_activities tmp ON ahr.id = tmp.id
SET ahr.activity = tmp.parsed_activity;

-- Step 4: Log rows that could not be split properly (unsplittable values)
SELECT id, original_activity
FROM temp_ahr_activities
WHERE JSON_LENGTH(parsed_activity) = 1
  AND JSON_UNQUOTE(JSON_EXTRACT(parsed_activity, '$[0]')) NOT IN ('Deworming', 'Castration', 'Iron', 'Vitamins', 'Antibiotic', 'Vaccination', 'Other')
  AND original_activity NOT IN ('Deworming', 'Castration', 'Iron', 'Vitamins', 'Antibiotic', 'Vaccination', 'Other');

-- Step 5: Clean up
DROP TEMPORARY TABLE IF EXISTS temp_ahr_activities;