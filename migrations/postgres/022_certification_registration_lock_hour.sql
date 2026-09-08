-- An HOUR on the registration lock, alongside the existing date.
--
-- WHY A SEPARATE SMALLINT AND NOT AN ISO TIMESTAMP IN registration_lock_date
--
-- Widening the existing column to hold '2026-08-30T17:00:00+03:00' was the first
-- instinct, and it is the wrong move here for three concrete reasons:
--
--   1. Migration 021 put a CHECK on that column pinning it to '^\d{4}-\d{2}-\d{2}$'.
--      A timestamp would not merely be unusual, it would be REJECTED.
--   2. The whole enforcement path compares that column as TEXT — `today > lockDate` —
--      precisely so no timezone ever enters the comparison. An offset suffix breaks
--      that: '2026-10-25T02:00:00+03:00' and '2026-10-25T02:00:00+02:00' are one hour
--      apart in reality but sort as equal-then-by-offset, i.e. wrong, twice a year.
--      A value that compares wrong reads as "registration open" to every caller.
--   3. Display code splits the column on '-' (formatLockDate). A timestamp would not
--      throw there — it would silently render a mangled date.
--
-- So: the date column keeps its exact meaning and its constraint, and the hour rides
-- alongside in a column that CANNOT physically hold minutes. SMALLINT + CHECK 0..23 is
-- the "whole hours only" rule enforced at the storage layer, not just in Zod.
--
-- SEMANTICS — and this is the part that must not be guessed at later:
--
--   registration_lock_hour = H  →  registration closes AT H:00 Israel wall-clock on
--                                  registration_lock_date. `now >= moment` is locked.
--   registration_lock_hour NULL →  the pre-existing meaning is preserved EXACTLY:
--                                  open through the end of the lock date, i.e. closing
--                                  at 00:00 the following day. NULL is hour 24.
--
-- That equivalence is why this migration needs NO BACKFILL. Every lock already in the
-- table keeps the moment it had; nothing reopens or closes early on deploy. Leaving the
-- hour NULL is a meaningful state, not a missing one, so there is no DEFAULT either.
--
-- Timezone: Asia/Jerusalem, matching migration 021 and lib/utils/registration-lock.ts.
-- The hour is stored as a bare wall-clock hour with no offset, and the offset in force
-- on that particular date is resolved at read time — which is the only way a deadline
-- set in March is still 17:00 local after the DST switch in October.
--
-- Idempotent: the migrate runner re-applies every file on each run.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_name = 'certifications' AND column_name = 'registration_lock_hour'
  ) THEN
    ALTER TABLE certifications ADD COLUMN registration_lock_hour SMALLINT;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'certifications_registration_lock_hour_range'
  ) THEN
    ALTER TABLE certifications ADD CONSTRAINT certifications_registration_lock_hour_range
      CHECK (registration_lock_hour IS NULL
             OR (registration_lock_hour >= 0 AND registration_lock_hour <= 23));
  END IF;
END $$;

-- An hour without a date is not a deadline, it is a dangling value that the UI would
-- have nowhere to show and the lock check would ignore. Forbid the combination outright
-- rather than relying on every writer to normalize it.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'certifications_registration_lock_hour_needs_date'
  ) THEN
    -- Clean up first: nothing should match, but the constraint cannot be added if
    -- anything does, and a failed migration file blocks every later one.
    UPDATE certifications SET registration_lock_hour = NULL
     WHERE registration_lock_date IS NULL AND registration_lock_hour IS NOT NULL;

    ALTER TABLE certifications ADD CONSTRAINT certifications_registration_lock_hour_needs_date
      CHECK (registration_lock_hour IS NULL OR registration_lock_date IS NOT NULL);
  END IF;
END $$;
