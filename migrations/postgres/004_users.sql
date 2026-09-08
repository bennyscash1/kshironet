-- App-level users table for real per-user authorization (role + approval),
-- keyed by the Supabase Auth user id (auth.users.id, a UUID). Auth itself stays
-- in Supabase; this table only holds role/status so the pg layer can enforce it.
-- Follows app conventions: snake_case, TIMESTAMPTZ timestamps (no triggers).
--   role:   super_admin | editor | viewer   (default viewer)
--   status: pending | approved | rejected   (new signups default pending)

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY,
  email TEXT NOT NULL,
  full_name TEXT,
  role TEXT NOT NULL DEFAULT 'viewer',
  status TEXT NOT NULL DEFAULT 'pending',
  approved_by UUID REFERENCES users(id),
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_status ON users(status);

-- Backfill every EXISTING Supabase auth user as an approved viewer so nobody is
-- locked out when the access gate goes live. Idempotent via ON CONFLICT.
-- (New signups created after this migration get status='pending' by default.)
INSERT INTO users (id, email, full_name, role, status, created_at)
SELECT id,
       email,
       COALESCE(raw_user_meta_data ->> 'full_name', NULL),
       'viewer',
       'approved',
       created_at
FROM auth.users
ON CONFLICT (id) DO NOTHING;
