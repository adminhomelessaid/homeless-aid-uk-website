-- Outreach User Management System Schema
-- Execute this in Supabase SQL Editor

-- 1. Create outreach_users table
CREATE TABLE outreach_users (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  username VARCHAR(50) UNIQUE NOT NULL,
  email VARCHAR(100) UNIQUE NOT NULL,
  full_name VARCHAR(100) NOT NULL,
  password_hash VARCHAR(255), -- NULL until user sets password
  role VARCHAR(20) NOT NULL CHECK (role IN ('admin', 'team_lead', 'volunteer')),
  is_active BOOLEAN DEFAULT true,
  email_verified BOOLEAN DEFAULT false,
  invitation_token VARCHAR(255) UNIQUE, -- For email verification/password setup
  invitation_sent_at TIMESTAMP WITH TIME ZONE,
  password_set_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  last_login TIMESTAMP WITH TIME ZONE,
  created_by UUID REFERENCES outreach_users(id)
);

-- 2. Create indexes for performance
CREATE INDEX idx_outreach_users_username ON outreach_users(username);
CREATE INDEX idx_outreach_users_email ON outreach_users(email);
CREATE INDEX idx_outreach_users_invitation_token ON outreach_users(invitation_token);
CREATE INDEX idx_outreach_users_role ON outreach_users(role);
CREATE INDEX idx_outreach_users_active ON outreach_users(is_active);

-- 3. Update attendance_logs to reference users
ALTER TABLE attendance_logs 
ADD COLUMN user_id UUID REFERENCES outreach_users(id),
ADD COLUMN logged_by_role VARCHAR(20);

-- Create index for user relationships
CREATE INDEX idx_attendance_logs_user_id ON attendance_logs(user_id);

-- 4. Create audit log table for admin actions
CREATE TABLE outreach_user_audit (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  admin_user_id UUID NOT NULL REFERENCES outreach_users(id),
  target_user_id UUID REFERENCES outreach_users(id),
  action VARCHAR(50) NOT NULL, -- 'created', 'updated', 'deactivated', 'password_reset', etc.
  details JSONB,
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 5. Create RLS policies for security
ALTER TABLE outreach_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE outreach_user_audit ENABLE ROW LEVEL SECURITY;

-- Users can only see their own data unless they're admin/team_lead
CREATE POLICY "Users can view own profile" ON outreach_users
  FOR SELECT USING (auth.uid()::text = id::text OR role IN ('admin', 'team_lead'));

-- Only admins can create/update users
CREATE POLICY "Admin can manage users" ON outreach_users
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM outreach_users 
      WHERE id::text = auth.uid()::text 
      AND role = 'admin' 
      AND is_active = true
    )
  );

-- Audit log access
CREATE POLICY "Admin can view audit log" ON outreach_user_audit
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM outreach_users 
      WHERE id::text = auth.uid()::text 
      AND role = 'admin' 
      AND is_active = true
    )
  );

-- 6. Create updated_at trigger
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_outreach_users_updated_at 
  BEFORE UPDATE ON outreach_users 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 7. Create initial admin user (replace with your details)
-- You'll need to set a password for this user after creation
INSERT INTO outreach_users (
  username, 
  email, 
  full_name, 
  role, 
  is_active, 
  email_verified,
  password_set_at
) VALUES (
  'admin',
  'admin@homelessaid.co.uk',
  'System Administrator',
  'admin',
  true,
  true,
  NOW()
);

-- Note: You'll need to set a password for the admin user
-- This will be done through the password setup system

-- 8. Create helpful views
CREATE VIEW active_users AS
SELECT 
  id,
  username,
  email,
  full_name,
  role,
  created_at,
  last_login,
  CASE 
    WHEN password_hash IS NULL THEN 'Pending Setup'
    WHEN last_login > NOW() - INTERVAL '30 days' THEN 'Active'
    ELSE 'Inactive'
  END as status
FROM outreach_users 
WHERE is_active = true
ORDER BY role, full_name;

CREATE VIEW user_activity_summary AS
SELECT 
  u.id,
  u.full_name,
  u.role,
  COUNT(al.id) as total_logs,
  SUM(al.people_served) as total_people_served,
  MAX(al.created_at) as last_activity
FROM outreach_users u
LEFT JOIN attendance_logs al ON u.id = al.user_id
WHERE u.is_active = true
GROUP BY u.id, u.full_name, u.role
ORDER BY total_logs DESC;