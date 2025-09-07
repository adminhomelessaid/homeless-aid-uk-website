-- Add Day column to attendance_logs table
-- Execute this in Supabase SQL Editor

-- Add the day column
ALTER TABLE attendance_logs 
ADD COLUMN event_day TEXT;

-- Add index for day-based filtering
CREATE INDEX idx_attendance_logs_day ON attendance_logs (event_day);

-- Update existing records to have the day based on event_date
UPDATE attendance_logs 
SET event_day = CASE EXTRACT(DOW FROM event_date)
    WHEN 0 THEN 'Sunday'
    WHEN 1 THEN 'Monday' 
    WHEN 2 THEN 'Tuesday'
    WHEN 3 THEN 'Wednesday'
    WHEN 4 THEN 'Thursday'
    WHEN 5 THEN 'Friday'
    WHEN 6 THEN 'Saturday'
END;

-- Update the export view to include the new day column
DROP VIEW IF EXISTS attendance_logs_export;
CREATE VIEW attendance_logs_export AS
SELECT 
    created_at as timestamp,
    event_date as date,
    event_day as day,
    event_name,
    event_location as location,
    event_town as town,
    people_served,
    outreach_name,
    notes,
    id
FROM attendance_logs
ORDER BY created_at DESC;

-- Grant permissions for the new column
GRANT SELECT ON attendance_logs_export TO anon;

-- Verify the changes
SELECT 
    event_date,
    event_day,
    event_name,
    event_town
FROM attendance_logs 
ORDER BY created_at DESC
LIMIT 5;