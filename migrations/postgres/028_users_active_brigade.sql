-- Super-admin brigade switching. Phase 2 / Step 1, slice 1F.
--
-- Two additions, both narrow:
--   * users.active_brigade_id  — which brigade a super admin is currently acting in
--   * brigades.public_id       — an opaque id for URLs
--
-- Deliberately NOT here: users.brigade_id, requested_brigade_id, the role model rewrite,
-- and any change to users_role_allowed or users_battalion_scope_valid. Those belong
-- together in migration 032 with the registration flow — splitting a CHECK away from the
-- roles it constrains is how it ends up describing a state that no longer exists.
--
-- ---------------------------------------------------------------------------
-- active_brigade_id IS MEANINGFUL FOR super_admin AND NO OTHER ROLE
-- ---------------------------------------------------------------------------
-- For every other role it is unused: not consulted, not written, not fallen back on. No
-- CHECK enforces that here, because the constraint belongs with the role model in 032 —
-- until then it is an application rule, and lib/auth/active-brigade.ts is the single place
-- that reads the column.
--
-- WHY THIS CAN LAND BEFORE ROW LEVEL SECURITY
-- For a super admin, brigade selection is NOT a security boundary — they are authorised
-- across every brigade by definition, so filtering their view by the selected brigade is a
-- convenience and application-level filtering is sufficient for it. For every other role
-- brigade scoping IS a security boundary and must wait for RLS (migrations 033-035). This
-- pattern must not be copied to another role before then.

ALTER TABLE users ADD COLUMN IF NOT EXISTS active_brigade_id INTEGER;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'users'::regclass AND conname = 'users_active_brigade_fk'
  ) THEN
    -- No ON DELETE, matching the users.battalion_id and users.approved_by precedents in
    -- 012 and 004: a brigade with users pointing at it should refuse to be deleted rather
    -- than silently detach them. Brigades are deactivated, never deleted, in any case.
    ALTER TABLE users ADD CONSTRAINT users_active_brigade_fk
      FOREIGN KEY (active_brigade_id) REFERENCES brigades(id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_users_active_brigade ON users(active_brigade_id);

-- ---------------------------------------------------------------------------
-- brigades.public_id — the id that appears in /admin/brigades/<public_id>
-- ---------------------------------------------------------------------------
-- Surrogate keys stay SERIAL (the house style, 34 of 44 tables) and remain what every
-- foreign key references. This is purely the URL-facing identifier.
--
-- Opaque on purpose. The serial ids are enumerable and carry noise — the second brigade in
-- this database is id 277 because rolled-back test transactions consumed the sequence, and
-- a URL should not expose that. gen_random_uuid() is built into Postgres 13+ and needs no
-- extension; pivot_report_widgets (010) already uses it, so this is the existing idiom.
ALTER TABLE brigades ADD COLUMN IF NOT EXISTS public_id UUID;

-- Backfill before NOT NULL, so the column can be added to a table that already has rows.
UPDATE brigades SET public_id = gen_random_uuid() WHERE public_id IS NULL;

ALTER TABLE brigades ALTER COLUMN public_id SET DEFAULT gen_random_uuid();
ALTER TABLE brigades ALTER COLUMN public_id SET NOT NULL;

-- Dropped and re-added rather than name-guarded: a name-guarded ADD is skipped once the
-- name exists, so correcting this definition later would silently never reach a database
-- that ran an earlier version of this file. The runner sends each file as one
-- multi-statement simple query, which Postgres wraps in an implicit transaction, so there
-- is no window in which the constraint is absent.
ALTER TABLE brigades DROP CONSTRAINT IF EXISTS brigades_public_id_key;
ALTER TABLE brigades ADD  CONSTRAINT brigades_public_id_key UNIQUE (public_id);
