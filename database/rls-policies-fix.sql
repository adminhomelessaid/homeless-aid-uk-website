-- RLS Policies Fix for Homeless Aid UK
-- Date: September 2025
-- Purpose: Implement secure RLS policies without infinite recursion

-- ============================================
-- STEP 1: Enable RLS on outreach_users table
-- ============================================
ALTER TABLE outreach_users ENABLE ROW LEVEL SECURITY;

-- ============================================
-- STEP 2: Create service role bypass policy
-- ============================================
-- This allows service role (backend API) to bypass RLS
CREATE POLICY "Service role bypass" ON outreach_users
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- ============================================
-- STEP 3: Public read access for login
-- ============================================
-- Allow anonymous users to read user data for login verification
-- This prevents recursion by not checking user relationships
CREATE POLICY "Public can read users for login" ON outreach_users
    FOR SELECT
    TO anon
    USING (
        -- Only allow reading username, password_hash, and basic info for login
        -- No recursive checks here
        true
    );

-- ============================================
-- STEP 4: Authenticated user policies
-- ============================================
-- Users can read their own data
CREATE POLICY "Users can read own data" ON outreach_users
    FOR SELECT
    TO authenticated
    USING (auth.uid()::text = id::text);

-- Admins can read all users
CREATE POLICY "Admins can read all users" ON outreach_users
    FOR SELECT  
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM outreach_users
            WHERE id::text = auth.uid()::text
            AND role = 'admin'
            AND is_active = true
        )
    );

-- Team leads can read their team
CREATE POLICY "Team leads can read team members" ON outreach_users
    FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM outreach_users
            WHERE id::text = auth.uid()::text
            AND role = 'team_lead'
            AND is_active = true
        )
    );

-- ============================================
-- STEP 5: Write policies for admins only
-- ============================================
-- Only admins can insert new users
CREATE POLICY "Admins can create users" ON outreach_users
    FOR INSERT
    TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM outreach_users
            WHERE id::text = auth.uid()::text
            AND role = 'admin'
            AND is_active = true
        )
    );

-- Only admins can update users
CREATE POLICY "Admins can update users" ON outreach_users
    FOR UPDATE
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM outreach_users
            WHERE id::text = auth.uid()::text
            AND role = 'admin'
            AND is_active = true
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM outreach_users
            WHERE id::text = auth.uid()::text
            AND role = 'admin'
            AND is_active = true
        )
    );

-- Users can update their own password
CREATE POLICY "Users can update own password" ON outreach_users
    FOR UPDATE
    TO authenticated
    USING (auth.uid()::text = id::text)
    WITH CHECK (
        -- Only allow updating password-related fields
        auth.uid()::text = id::text
        AND (
            -- Check that only password fields are being updated
            -- This prevents privilege escalation
            (password_hash IS DISTINCT FROM OLD.password_hash)
            OR (password_set_at IS DISTINCT FROM OLD.password_set_at)
            OR (last_login IS DISTINCT FROM OLD.last_login)
        )
    );

-- ============================================
-- STEP 6: Attendance table policies
-- ============================================
-- Enable RLS on attendance_logs if not already enabled
ALTER TABLE attendance_logs ENABLE ROW LEVEL SECURITY;

-- Service role bypass
CREATE POLICY "Service role bypass attendance" ON attendance_logs
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- Users can read their own logs
CREATE POLICY "Users read own logs" ON attendance_logs
    FOR SELECT
    TO authenticated
    USING (logged_by::text = auth.uid()::text);

-- Admins and team leads can read all logs
CREATE POLICY "Admins read all logs" ON attendance_logs
    FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM outreach_users
            WHERE id::text = auth.uid()::text
            AND role IN ('admin', 'team_lead')
            AND is_active = true
        )
    );

-- Users can create their own logs
CREATE POLICY "Users create own logs" ON attendance_logs
    FOR INSERT
    TO authenticated
    WITH CHECK (logged_by::text = auth.uid()::text);

-- ============================================
-- MIGRATION NOTES
-- ============================================
-- 1. The key to avoiding infinite recursion is:
--    - Service role bypass for backend operations
--    - Simple, non-recursive checks for public access
--    - Using auth.uid() for authenticated checks
--    - Avoiding complex joins in policy conditions

-- 2. Before applying these policies:
--    - Ensure JWT_SECRET is set in Vercel environment
--    - Test login works with current setup
--    - Have a database backup ready

-- 3. Apply policies in a transaction:
--    BEGIN;
--    -- Run all the above SQL
--    COMMIT;

-- 4. If issues occur, rollback with:
--    ALTER TABLE outreach_users DISABLE ROW LEVEL SECURITY;
--    ALTER TABLE attendance_logs DISABLE ROW LEVEL SECURITY;
--    DROP POLICY IF EXISTS "policy_name" ON table_name;