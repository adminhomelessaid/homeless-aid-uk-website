-- Homeless Aid UK - Attendance Logs Table Schema
-- Execute this SQL in your Supabase SQL editor

-- Create attendance_logs table
CREATE TABLE IF NOT EXISTS attendance_logs (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Event details
    event_date DATE NOT NULL,
    event_name TEXT NOT NULL,
    event_location TEXT NOT NULL,
    event_town TEXT NOT NULL,
    
    -- Attendance data
    people_served INTEGER NOT NULL CHECK (people_served >= 0 AND people_served <= 500),
    notes TEXT DEFAULT '',
    
    -- Volunteer information
    outreach_name TEXT NOT NULL,
    logged_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Prevent duplicate entries for same event/date/volunteer
    UNIQUE(event_date, event_name, event_town, outreach_name)
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_attendance_logs_date ON attendance_logs (event_date DESC);
CREATE INDEX IF NOT EXISTS idx_attendance_logs_town ON attendance_logs (event_town);
CREATE INDEX IF NOT EXISTS idx_attendance_logs_volunteer ON attendance_logs (outreach_name);
CREATE INDEX IF NOT EXISTS idx_attendance_logs_created_at ON attendance_logs (created_at DESC);

-- Create a composite index for common queries
CREATE INDEX IF NOT EXISTS idx_attendance_logs_date_town ON attendance_logs (event_date DESC, event_town);

-- Row Level Security (RLS) - Enable security
ALTER TABLE attendance_logs ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Allow all authenticated users to read attendance logs
CREATE POLICY IF NOT EXISTS "Allow authenticated read access" 
ON attendance_logs FOR SELECT 
USING (true);

-- RLS Policy: Allow all authenticated users to insert attendance logs
CREATE POLICY IF NOT EXISTS "Allow authenticated insert access" 
ON attendance_logs FOR INSERT 
WITH CHECK (true);

-- Create a view for easy CSV export with all necessary columns
CREATE OR REPLACE VIEW attendance_logs_export AS
SELECT 
    created_at as timestamp,
    event_date as date,
    event_name,
    event_location as location,
    event_town as town,
    people_served,
    outreach_name,
    notes,
    id
FROM attendance_logs
ORDER BY created_at DESC;

-- Grant permissions to the anon role (your API key)
GRANT SELECT, INSERT ON attendance_logs TO anon;
GRANT SELECT ON attendance_logs_export TO anon;

-- Sample data for testing (optional - remove after testing)
INSERT INTO attendance_logs (
    event_date, 
    event_name, 
    event_location, 
    event_town, 
    people_served, 
    outreach_name, 
    notes
) VALUES 
    (CURRENT_DATE, 'Test Street Kitchen', 'Test Location', 'Bolton', 15, 'Test Volunteer', 'Database integration test')
ON CONFLICT (event_date, event_name, event_town, outreach_name) DO NOTHING;

-- Verify table creation
SELECT 
    'Table created successfully' as status,
    COUNT(*) as sample_records
FROM attendance_logs;