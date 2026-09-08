-- One registration lock date per CERTIFICATION, replacing the per-allocation deadline.
--
-- 008 put `registration_lock_at` on certification_battalion_quotas, so every battalion's
-- allocation carried its own deadline. In practice a certification closes registration on
-- one date for everybody — the per-battalion variant only cost screen space on the
-- הרשמה page and invited the two dates to disagree.
--
-- TEXT, not TIMESTAMPTZ: the app stores dates as TEXT 'yyyy-MM-dd' (certifications.
-- start_date / end_date do), and day granularity is what a registration deadline actually
-- has. ISO date text also compares lexicographically, so the lock check needs no timezone
-- conversion — see lib/utils/registration-lock.ts for the exact semantics (the lock date
-- itself is still open; the day after it is not).
--
-- The old column is DELIBERATELY LEFT IN PLACE. Nothing reads it for enforcement any more,
-- but dropping it would destroy the deadlines already recorded against it, and those are
-- the only record of what each battalion was told.
--
-- Idempotent: the migrate runner re-applies every file on each run.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_name = 'certifications' AND column_name = 'registration_lock_date'
  ) THEN
    ALTER TABLE certifications ADD COLUMN registration_lock_date TEXT;

    -- ONE-TIME CONSOLIDATION, and it runs inside this guard precisely so that re-applying
    -- the file never resurrects it. Without a backfill, every certification that was
    -- already locked would silently reopen the moment this deploy landed.
    --
    -- MIN, not MAX: taking the earliest deadline among the allocations can only close
    -- registration sooner than some battalion expected, never open one that had already
    -- closed. Between over- and under-restricting a deadline that has passed, the former is
    -- recoverable by an editor clearing the date and the latter is not.
    UPDATE certifications c
       SET registration_lock_date = src.lock_date
      FROM (
        SELECT certification_id,
               to_char(MIN(registration_lock_at) AT TIME ZONE 'Asia/Jerusalem', 'YYYY-MM-DD') AS lock_date
          FROM certification_battalion_quotas
         WHERE registration_lock_at IS NOT NULL
         GROUP BY certification_id
      ) src
     WHERE src.certification_id = c.id;
  END IF;
END $$;

-- The column feeds a lexicographic comparison, so a value that is not a plain ISO date
-- would not merely look wrong — it would compare wrong, and a malformed deadline reads as
-- "registration open" to every check that touches it.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'certifications_registration_lock_date_format'
  ) THEN
    ALTER TABLE certifications ADD CONSTRAINT certifications_registration_lock_date_format
      CHECK (registration_lock_date IS NULL OR registration_lock_date ~ '^\d{4}-\d{2}-\d{2}$');
  END IF;
END $$;
