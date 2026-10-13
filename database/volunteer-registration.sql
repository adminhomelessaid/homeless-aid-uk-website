-- Volunteer Registration migration. Safe to run once.
-- 1. Columns on outreach_users
ALTER TABLE outreach_users
  ADD COLUMN IF NOT EXISTS date_of_birth date,
  ADD COLUMN IF NOT EXISTS next_of_kin_name varchar(100),
  ADD COLUMN IF NOT EXISTS next_of_kin_phone varchar(30),
  ADD COLUMN IF NOT EXISTS mobile_phone varchar(30),
  ADD COLUMN IF NOT EXISTS team varchar(60),
  ADD COLUMN IF NOT EXISTS photo_data text,
  ADD COLUMN IF NOT EXISTS photo_updated_at timestamptz,
  ADD COLUMN IF NOT EXISTS volunteer_number integer;

CREATE SEQUENCE IF NOT EXISTS volunteer_number_seq START 1;

-- Backfill existing users in creation order, then default new ones
UPDATE outreach_users u
SET volunteer_number = s.n
FROM (
  SELECT id, row_number() OVER (ORDER BY created_at, id) AS n
  FROM outreach_users
) s
WHERE u.id = s.id AND u.volunteer_number IS NULL;

SELECT setval('volunteer_number_seq', COALESCE((SELECT MAX(volunteer_number) FROM outreach_users), 0) + 1, false);

ALTER TABLE outreach_users
  ALTER COLUMN volunteer_number SET DEFAULT nextval('volunteer_number_seq');

CREATE UNIQUE INDEX IF NOT EXISTS idx_outreach_users_volunteer_number ON outreach_users(volunteer_number);

-- 2. Policies
CREATE TABLE IF NOT EXISTS policies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug varchar(60) UNIQUE NOT NULL,
  title varchar(150) NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS policy_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  policy_id uuid NOT NULL REFERENCES policies(id) ON DELETE CASCADE,
  version integer NOT NULL,
  body_html text NOT NULL,
  change_note varchar(300),
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES outreach_users(id) ON DELETE SET NULL,
  UNIQUE (policy_id, version)
);

CREATE INDEX IF NOT EXISTS idx_policy_versions_policy ON policy_versions(policy_id, version DESC);

-- 3. Signatures
CREATE TABLE IF NOT EXISTS policy_signatures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES outreach_users(id) ON DELETE CASCADE,
  typed_name varchar(100) NOT NULL,
  signed_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  version_ids uuid[] NOT NULL,
  ip_address varchar(45),
  user_agent varchar(300)
);

CREATE INDEX IF NOT EXISTS idx_policy_signatures_user ON policy_signatures(user_id, signed_at DESC);

-- 4. Attendance logs must not block user deletion
ALTER TABLE attendance_logs DROP CONSTRAINT IF EXISTS attendance_logs_user_id_fkey;
ALTER TABLE attendance_logs
  ADD CONSTRAINT attendance_logs_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES outreach_users(id) ON DELETE SET NULL;

-- 5. Match the existing outreach_users setup: the API uses the anon key server-side, so RLS stays off
ALTER TABLE policies DISABLE ROW LEVEL SECURITY;
ALTER TABLE policy_versions DISABLE ROW LEVEL SECURITY;
ALTER TABLE policy_signatures DISABLE ROW LEVEL SECURITY;

-- 6. Teams are a comma-separated list now, which can exceed 60 characters
ALTER TABLE outreach_users ALTER COLUMN team TYPE text;

-- 7. Self sign-up with approval
ALTER TABLE outreach_users
  ADD COLUMN IF NOT EXISTS approval_status varchar(20) NOT NULL DEFAULT 'approved',
  ADD COLUMN IF NOT EXISTS approved_by uuid REFERENCES outreach_users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS approved_at timestamptz;
CREATE INDEX IF NOT EXISTS idx_outreach_users_approval ON outreach_users(approval_status);

-- 7. Self sign-up with approval
ALTER TABLE outreach_users
  ADD COLUMN IF NOT EXISTS approval_status varchar(20) NOT NULL DEFAULT 'approved',
  ADD COLUMN IF NOT EXISTS approved_by uuid REFERENCES outreach_users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS approved_at timestamptz;
CREATE INDEX IF NOT EXISTS idx_outreach_users_approval ON outreach_users(approval_status);
