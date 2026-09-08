-- Constrains roster_entries.status to the nine values the application knows about.
--
-- WHY THIS EXISTS. The "פילוח הסמכות" report used to count every roster row as a
-- completion regardless of its status. The fix makes completion an explicit allow-list in
-- lib/roster/completion.ts, where anything unrecognized is "not completed" — so an odd
-- value can no longer be mistaken for a pass. This constraint closes the other half: it
-- stops such a value being written in the first place, which is what would otherwise turn
-- a soldier into a permanent "סטטוס לא ידוע" row on every report.
--
-- NO BACKFILL, AND DELIBERATELY SO. The column is already NOT NULL DEFAULT 'registered'
-- and an audit of the live data found zero NULL, empty or unrecognized values, so there is
-- nothing to normalize. Had there been any, the correct repair would have been to set them
-- to a NON-completing status — never to 'passed', which would invent training that did not
-- happen. The guard below refuses to add the constraint rather than silently rewriting
-- anybody's outcome.
--
-- Idempotent: safe to re-run, and a no-op once the constraint exists.

DO $$
DECLARE
  offending INTEGER;
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'roster_entries'::regclass
       AND conname = 'roster_entries_status_allowed'
  ) THEN
    RAISE NOTICE 'roster_entries_status_allowed already present — nothing to do';
    RETURN;
  END IF;

  SELECT COUNT(*) INTO offending
    FROM roster_entries
   WHERE status IS NULL
      OR status NOT IN ('registered', 'pending_approval', 'approved', 'rejected',
                        'participated', 'did_not_participate', 'did_not_report',
                        'passed', 'failed');

  IF offending > 0 THEN
    RAISE EXCEPTION
      'roster_entries has % row(s) with an unrecognized status. Normalize them to a NON-completing value (e.g. ''registered'') by hand and re-run; this migration will not guess an outcome.',
      offending;
  END IF;

  ALTER TABLE roster_entries ADD CONSTRAINT roster_entries_status_allowed
    CHECK (status IN ('registered', 'pending_approval', 'approved', 'rejected',
                      'participated', 'did_not_participate', 'did_not_report',
                      'passed', 'failed'));
END $$;
