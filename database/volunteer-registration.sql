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

-- 8. Only some documents need a signature; the rest are reference reading
ALTER TABLE policies ADD COLUMN IF NOT EXISTS requires_signature boolean NOT NULL DEFAULT true;

-- 9. Managed teams: a team is a regular session (town + day) with any number of team leads
CREATE TABLE IF NOT EXISTS teams (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name varchar(60) UNIQUE NOT NULL,
  town varchar(60) NOT NULL,
  day varchar(12),
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS team_leads (
  team_id uuid NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES outreach_users(id) ON DELETE CASCADE,
  PRIMARY KEY (team_id, user_id)
);
ALTER TABLE teams DISABLE ROW LEVEL SECURITY;
ALTER TABLE team_leads DISABLE ROW LEVEL SECURITY;

INSERT INTO teams (name, town, day, sort_order) VALUES
  ('Bolton Monday', 'Bolton', 'Monday', 1), ('Bolton Tuesday', 'Bolton', 'Tuesday', 2), ('Bolton Wednesday', 'Bolton', 'Wednesday', 3),
  ('Bolton Thursday', 'Bolton', 'Thursday', 4), ('Bolton Friday', 'Bolton', 'Friday', 5), ('Bolton Saturday', 'Bolton', 'Saturday', 6),
  ('Bolton Sunday', 'Bolton', 'Sunday', 7), ('Bury Monday', 'Bury', 'Monday', 8), ('Bury Tuesday', 'Bury', 'Tuesday', 9),
  ('Glasgow Saturday', 'Glasgow', 'Saturday', 10), ('Liverpool Tuesday', 'Liverpool', 'Tuesday', 11),
  ('Manchester Thursday', 'Manchester', 'Thursday', 12), ('Manchester Friday', 'Manchester', 'Friday', 13), ('Manchester Saturday', 'Manchester', 'Saturday', 14),
  ('Oldham Thursday', 'Oldham', 'Thursday', 15), ('Wigan Wednesday', 'Wigan', 'Wednesday', 16), ('Other', 'Other', NULL, 17)
ON CONFLICT (name) DO NOTHING;

-- Old town-only choices no longer match a team; clear them so people pick their sessions.
UPDATE outreach_users SET team = NULL
WHERE team IS NOT NULL AND NOT EXISTS (SELECT 1 FROM teams t WHERE t.name = ANY (string_to_array(replace(outreach_users.team, ', ', ','), ',')));
