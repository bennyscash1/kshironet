-- "נדרש לינה" — an informational flag on a roster entry: does this soldier need lodging?
--
-- SMALLINT 0/1, NOT boolean, ON PURPOSE. Every other flag on `roster_entries`
-- (`has_prior_certification`, `is_reserve`, `meets_prerequisite`) is a SMALLINT, and the
-- application's SQL is written against that: `WHERE re.is_reserve = 0`,
-- `input.has_prior_certification ? 1 : 0`, and the row-to-entity types declare `number`.
-- The SQLite→Postgres conversion recorded this as a deliberate deviation rather than an
-- oversight (see scripts/migrate-from-sqlite.ts). A lone `boolean` column here would be
-- the odd one out and would need its own mapping branch on every read and write path, so
-- this matches the convention instead. `NOT NULL DEFAULT 0` is the same guarantee the task
-- asks for — every existing row backfills to false and no read path sees NULL.
--
-- PURELY INFORMATIONAL. It takes no part in seat occupancy, עתודה exclusion, quota math,
-- gap decrements or completion derivation, and appears in no allow-list or denominator.
--
-- Idempotent: safe to re-run, and a no-op once the column exists.

ALTER TABLE roster_entries
  ADD COLUMN IF NOT EXISTS requires_lodging SMALLINT NOT NULL DEFAULT 0;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'roster_entries'::regclass
       AND conname = 'roster_entries_requires_lodging_bool'
  ) THEN
    -- The column carries a boolean, so only 0 and 1 are meaningful. Without this a stray
    -- 2 would be truthy in TypeScript and silently read as "lodging required".
    ALTER TABLE roster_entries ADD CONSTRAINT roster_entries_requires_lodging_bool
      CHECK (requires_lodging IN (0, 1));
  END IF;
END $$;
