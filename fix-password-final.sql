-- Final password fix for BenAdmin
-- Run this in Supabase SQL Editor

-- Update BenAdmin with a working password hash
UPDATE outreach_users 
SET 
  password_hash = '$2a$12$/90znAC6z/ghKQN57gFWROzEYtCQbj2vDeMFRZMrYitvl406VhjC.',  -- Password: Password123!
  email_verified = true,
  is_active = true,
  updated_at = NOW()
WHERE username = 'BenAdmin';

-- Verify the update
SELECT 
  username, 
  full_name, 
  role, 
  is_active, 
  email_verified, 
  password_hash,
  updated_at
FROM outreach_users 
WHERE username = 'BenAdmin';