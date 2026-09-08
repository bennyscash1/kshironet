-- Attach soldiers to a certification REQUEST, before any certification exists.
--
-- Request-stage soldiers live in the existing `roster_entries` table (no new soldiers
-- table): they carry `battalion_request_id` and a NULL `certification_id`. When the
-- brigade later opens a certification, the same row shape is already in place.
--
-- Every soldier field the request form collects already exists on `roster_entries`
-- (company_platoon, commander_name, commander_phone, has_prior_certification,
-- is_reserve, notes, phone, full_name, personal_number, battalion_id), so no new
-- soldier columns are added here — only the request link.
--
-- Idempotent: the migrate runner re-applies every file on each run.

ALTER TABLE roster_entries
  ADD COLUMN IF NOT EXISTS battalion_request_id INTEGER
    REFERENCES battalion_requests(id) ON DELETE CASCADE;

-- A request-stage soldier has no certification yet. Existing rows all keep their
-- certification_id, so no data is touched.
ALTER TABLE roster_entries ALTER COLUMN certification_id DROP NOT NULL;

-- Exactly one parent is required: a certification, a request, or both (a soldier
-- carried from a request into the certification it produced).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'roster_entries_parent_present'
  ) THEN
    ALTER TABLE roster_entries
      ADD CONSTRAINT roster_entries_parent_present
      CHECK (certification_id IS NOT NULL OR battalion_request_id IS NOT NULL);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_roster_battalion_request
  ON roster_entries(battalion_request_id);
