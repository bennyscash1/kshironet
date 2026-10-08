-- Brigades: the tenant root. Phase 2 / Step 1, slice 1B.
--
-- This file is DELIBERATELY additive and self-contained. It creates one table, seeds one
-- settings key and installs one trigger. It adds no column to any existing table, changes
-- no existing constraint, and destroys no ON CONFLICT arbiter — so it re-applies cleanly
-- on every migrate run and needs no migration ledger.
--
-- Follows app conventions: SERIAL PK, snake_case, TIMESTAMPTZ timestamps, and is_active as
-- SMALLINT 0/1 (matching battalions.is_active in 001_init.sql, the table brigades will
-- scope). Every constraint is named explicitly and kept well under Postgres's 63-character
-- identifier limit — three constraints in this schema already exceed it and are silently
-- truncated in the catalog; this file does not add a fourth.
--
-- ============================================================================
-- THE SINGLE-BRIGADE GUARD — read this before flipping multi_brigade_isolation_ready
-- ============================================================================
-- A second brigade row in a system with no data isolation does not fail loudly. Every
-- domain table is still brigade-blind, so the two brigades' certifications, roster and
-- gap numbers merge silently: the visible symptom is WRONG NUMBERS on the פערים tab, not
-- an error. That is why the guard is a trigger in the database and not a check in the API
-- route — no code path, script or ad-hoc query can get around it.
--
-- `multi_brigade_isolation_ready` gates the creation of the SECOND brigade and nothing
-- else. The first brigade is always allowed. Flipping it to '1' is a deliberate act with
-- a checklist, not a convenience toggle. ALL of the following must be true first:
--
--   1. `brigade_id` present and NOT NULL on every tenant-scoped table.
--   2. Composite foreign keys in place, so a child row cannot name a parent in another
--      brigade (FK enforcement bypasses RLS, so policies alone cannot prevent this).
--   3. The application connects as a database role that is NOT the table owner and does
--      NOT have BYPASSRLS. As of this migration the app connects as `postgres`, which has
--      rolbypassrls = true, so every RLS policy would be silently ignored.
--   4. ROW LEVEL SECURITY enabled and forced on every tenant-scoped table, with SELECT,
--      INSERT, UPDATE and DELETE policies that fail closed when app.brigade_id is unset.
--   5. `security_invoker = true` on all four views (v_org_unit_counts_base,
--      v_org_unit_counts, v_role_status, v_certification_gaps). Without it they execute as
--      their owner and bypass every policy. v_certification_gaps reads v_org_unit_counts,
--      so both ends of that chain need it.
--   6. The cross-brigade isolation tests passing — including the negative assertions that
--      brigade A's context sees zero of brigade B's rows for select, insert, update and
--      delete, and that an unset context sees nothing at all.
--
-- Until then this table exists so a super admin can name the brigade the existing data
-- belongs to, and that is all it is for.

CREATE TABLE IF NOT EXISTS brigades (
  id SERIAL PRIMARY KEY,
  -- What the super admin types, e.g. '228-אלון'. The application trims before writing;
  -- the constraints below are the backstop, not the primary validation.
  name TEXT NOT NULL,
  -- Soft deactivation only. There is no delete path: a brigade's data must remain
  -- attributable, and there will be data soon.
  is_active SMALLINT NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Nullable with no ON DELETE, matching the users.approved_by precedent in 004_users.sql.
  created_by UUID
);

-- Constraints are declared here rather than inline in CREATE TABLE, and are dropped and
-- re-added rather than guarded with IF NOT EXISTS, for one reason: CREATE TABLE IF NOT
-- EXISTS is skipped entirely once the table exists, and a name-guarded ADD CONSTRAINT is
-- skipped once the NAME exists — so with either idiom, correcting a constraint's
-- DEFINITION in this file would silently never reach a database that already ran an
-- earlier version of it. Drop-then-add makes the file the single source of truth. The
-- runner sends each file as one multi-statement simple query, which Postgres wraps in an
-- implicit transaction, so there is no window in which these constraints are absent.
ALTER TABLE brigades DROP CONSTRAINT IF EXISTS brigades_name_key;
ALTER TABLE brigades ADD  CONSTRAINT brigades_name_key UNIQUE (name);

-- `name ~ '[^[:space:]]'` — at least one non-whitespace character.
--
-- NOT `length(btrim(name)) > 0`: single-argument btrim() strips only SPACES, so a name of
-- tabs or newlines would pass it while Zod's .trim() (JavaScript semantics, all
-- whitespace) rejects the same value. That mismatch would leave the database backstop
-- weaker than the validation in front of it, which defeats the point of having it.
ALTER TABLE brigades DROP CONSTRAINT IF EXISTS brigades_name_not_blank;
ALTER TABLE brigades ADD  CONSTRAINT brigades_name_not_blank CHECK (name ~ '[^[:space:]]');

ALTER TABLE brigades DROP CONSTRAINT IF EXISTS brigades_is_active_bool;
ALTER TABLE brigades ADD  CONSTRAINT brigades_is_active_bool CHECK (is_active IN (0, 1));

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'brigades'::regclass AND conname = 'brigades_created_by_fk'
  ) THEN
    ALTER TABLE brigades ADD CONSTRAINT brigades_created_by_fk
      FOREIGN KEY (created_by) REFERENCES users(id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_brigades_active ON brigades(is_active);

-- ON CONFLICT DO NOTHING is load-bearing, exactly as in 017_system_settings.sql: this file
-- re-runs on every migrate, and DO UPDATE would silently revert the flag to '0' after
-- somebody had deliberately turned it on.
INSERT INTO system_settings (key, value, description) VALUES
  ('multi_brigade_isolation_ready', '0',
   'האם בידוד הנתונים בין חטיבות הושלם. כל עוד הערך 0 — ניתן ליצור חטיבה אחת בלבד')
ON CONFLICT (key) DO NOTHING;

-- Defence in depth for the single-brigade window.
--
-- Same shape as gap_keys_establishment_is_locked() in 015_gap_requirement_keys.sql, which
-- is this schema's precedent for a trigger that reads a setting to lock a table. The
-- COALESCE(..., '0') is the fail-closed idiom: a missing or unreadable setting means
-- "not ready", never "go ahead".
--
-- Raised with a custom SQLSTATE so the API route can recognise this one failure precisely
-- and answer in Hebrew, instead of matching on message text or leaking SQL to the client.
CREATE OR REPLACE FUNCTION brigades_single_until_isolation_ready() RETURNS trigger AS $$
DECLARE
  ready TEXT;
  existing BIGINT;
BEGIN
  SELECT value INTO ready FROM system_settings WHERE key = 'multi_brigade_isolation_ready';
  IF COALESCE(ready, '0') = '1' THEN
    RETURN NEW;
  END IF;

  SELECT count(*) INTO existing FROM brigades;
  IF existing > 0 THEN
    RAISE EXCEPTION
      'brigades: a second brigade requires multi_brigade_isolation_ready=1 (see migrations/postgres/025_brigades.sql)'
      USING ERRCODE = 'KS001';
  END IF;

  RETURN NEW;
END $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_brigades_single_until_ready ON brigades;
CREATE TRIGGER trg_brigades_single_until_ready
  BEFORE INSERT ON brigades
  FOR EACH ROW EXECUTE FUNCTION brigades_single_until_isolation_ready();
