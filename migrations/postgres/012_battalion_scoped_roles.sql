-- Battalion-scoped roles: viewer_battalion (צפייה גדודי) and editor_battalion (עריכה גדודי).
--
-- These are ADDITIVE. The existing global roles (super_admin / editor / viewer) keep their
-- system-wide behaviour untouched; only the two new roles carry a battalion_id and are
-- filtered to it.
--
--   role: super_admin | editor | viewer | viewer_battalion | editor_battalion
--   battalion_id: NULL for every global role; REQUIRED for the two scoped roles.
--
-- Idempotent: the migrate runner re-applies every file on each run.

-- The battalion a scoped user is limited to. NULL for global/admin roles.
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS battalion_id INTEGER REFERENCES battalions(id);

-- Free-text signup indications: what the user typed about their role/battalion when
-- registering. Shown to the admin as an INDICATION ONLY — never read for authorization.
ALTER TABLE users ADD COLUMN IF NOT EXISTS requested_role_text TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS requested_battalion_text TEXT;

CREATE INDEX IF NOT EXISTS idx_users_battalion ON users(battalion_id);

-- `role` was previously unconstrained TEXT. Pin it to the five known values (all three
-- pre-existing values preserved) so a typo can never silently create a role that no
-- permission branch recognises.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'users_role_allowed') THEN
    ALTER TABLE users ADD CONSTRAINT users_role_allowed
      CHECK (role IN ('super_admin', 'editor', 'viewer', 'viewer_battalion', 'editor_battalion'));
  END IF;
END $$;

-- A scoped role without a battalion would be a user scoped to nothing; a global role with
-- a battalion would imply a limit that the permission layer does not apply. Forbid both.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'users_battalion_scope_valid') THEN
    ALTER TABLE users ADD CONSTRAINT users_battalion_scope_valid
      CHECK (
        (role IN ('viewer_battalion', 'editor_battalion') AND battalion_id IS NOT NULL)
        OR (role NOT IN ('viewer_battalion', 'editor_battalion') AND battalion_id IS NULL)
      );
  END IF;
END $$;
