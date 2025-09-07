-- Fix RLS policies for outreach_users table
-- Run this in Supabase SQL Editor

-- 1. Drop the problematic policies
DROP POLICY IF EXISTS "Admin can manage users" ON outreach_users;
DROP POLICY IF EXISTS "Users can view own profile" ON outreach_users;
DROP POLICY IF EXISTS "Allow login lookup" ON outreach_users;

-- 2. Disable RLS temporarily to allow authentication to work
ALTER TABLE outreach_users DISABLE ROW LEVEL SECURITY;

-- 3. Reset BenAdmin password while RLS is disabled
UPDATE outreach_users 
SET 
  password_hash = '$2a$12$N1SejDQO2xI3xKs8Y4z5F.p9FYxUjFVXm9m5Q0MKcV5XLu6N7jpGW',  -- Password: Password123!
  email_verified = true,
  is_active = true,
  updated_at = NOW()
WHERE username = 'BenAdmin';

-- Verify the update
SELECT username, full_name, role, is_active, email_verified, password_hash IS NOT NULL as has_password
FROM outreach_users 
WHERE username = 'BenAdmin';