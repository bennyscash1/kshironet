-- Scope battalions to a brigade. Phase 2 / Step 1, slice 1C.
--
-- Deliberately narrow: `brigade_id` lands on `battalions` and NOTHING else. The other 37
-- tenant-scoped tables, the composite foreign keys, RLS and the tenant context all stay in
-- the main Phase 2 plan (027-033).
--
-- WHY THIS NEEDS NO MIGRATION LEDGER
-- Re-scoping a UNIQUE constraint normally breaks any `INSERT ... ON CONFLICT (cols)` in an
-- immutable migration, because ON CONFLICT resolves its arbiter against a unique index on
-- exactly those columns. Verified for this one: no migration in 001-024 writes to
-- `battalions` at all — no INSERT, no UPDATE, no DELETE. The only `ON CONFLICT (code)` in
-- the migration set is 014_org_unit_types.sql:110, which targets `org_unit_types`, a
-- different table with its own `org_unit_types_code_key`. The single `ON CONFLICT (code)`
-- against battalions lives in scripts/seed.ts, and a script is editable — this slice
-- updates it. So dropping `battalions_code_key` destroys no arbiter and this file
-- re-applies cleanly.

ALTER TABLE battalions ADD COLUMN IF NOT EXISTS brigade_id INTEGER;

-- Adopt any pre-existing battalions into the single brigade.
--
-- Nullable-add then adopt then SET NOT NULL, rather than adding NOT NULL directly: the
-- direct form fails on a non-empty table, and this file re-runs on every migrate. On an
-- empty table every step below is a no-op. RAISE rather than inventing a brigade — a row
-- silently adopted into the wrong tenant is the worst outcome available here, and this
-- file is one implicit transaction so the exception rolls it back cleanly.
DO $$
DECLARE
  orphans BIGINT;
  target  INTEGER;
BEGIN
  SELECT count(*) INTO orphans FROM battalions WHERE brigade_id IS NULL;
  IF orphans = 0 THEN RETURN; END IF;

  SELECT id INTO target FROM brigades ORDER BY id LIMIT 1;
  IF target IS NULL THEN
    RAISE EXCEPTION
      'battalions has % row(s) with no brigade and no brigades row exists to adopt them into. Create the brigade first (see 025_brigades.sql).',
      orphans;
  END IF;

  -- More than one brigade means "the first one" is a guess, and a guess here is
  -- unrecoverable once brigade_id is NOT NULL.
  IF (SELECT count(*) FROM brigades) > 1 THEN
    RAISE EXCEPTION
      'battalions has % unscoped row(s) and % brigades exist — refusing to guess which brigade they belong to. Assign brigade_id explicitly, then re-run.',
      orphans, (SELECT count(*) FROM brigades);
  END IF;

  UPDATE battalions SET brigade_id = target WHERE brigade_id IS NULL;
  RAISE NOTICE 'adopted % battalion row(s) into brigade %', orphans, target;
END $$;

-- A no-op once attnotnull is already set, so this is free on every subsequent run.
ALTER TABLE battalions ALTER COLUMN brigade_id SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'battalions'::regclass AND conname = 'battalions_brigade_fk'
  ) THEN
    ALTER TABLE battalions ADD CONSTRAINT battalions_brigade_fk
      FOREIGN KEY (brigade_id) REFERENCES brigades(id) ON DELETE RESTRICT;
  END IF;
END $$;

-- Battalion code is unique WITHIN a brigade, not globally: two brigades will both have a
-- battalion numbered 1. Dropped and re-added rather than guarded on the constraint name,
-- for the reason 025 documents — a name-guarded ADD is skipped once the name exists, so
-- correcting a definition here would silently never reach a database that ran an earlier
-- version of this file.
--
-- brigade_id leads the key, so this index also serves as the tenant index for battalions;
-- no separate idx_battalions_brigade is needed.
ALTER TABLE battalions DROP CONSTRAINT IF EXISTS battalions_code_key;
ALTER TABLE battalions DROP CONSTRAINT IF EXISTS battalions_brigade_code_key;
ALTER TABLE battalions ADD  CONSTRAINT battalions_brigade_code_key UNIQUE (brigade_id, code);

-- The composite-FK anchor the later slices need.
--
-- Logically redundant (`id` is already the primary key, so this can never be violated) and
-- added now purely because a composite FOREIGN KEY (battalion_id, brigade_id) requires a
-- unique constraint on exactly that referenced column set. Adding it here means 029 does
-- not have to come back and touch `battalions` again.
--
-- It matters because FK enforcement BYPASSES row level security: a child row naming
-- another brigade's battalion passes both the RLS WITH CHECK and a single-column FK, so
-- only the composite form makes cross-brigade references structurally impossible.
ALTER TABLE battalions DROP CONSTRAINT IF EXISTS battalions_id_brigade_key;
ALTER TABLE battalions ADD  CONSTRAINT battalions_id_brigade_key UNIQUE (id, brigade_id);
