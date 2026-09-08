-- Monthly gap history for the trend chart (§1.6).
--
-- Created but DELIBERATELY UNWIRED: no job, no trigger, nothing writes this table in this
-- phase. Resolved question 3 defers the trend card, and §1.6 is explicit that the card is
-- to be HIDDEN entirely rather than rendered empty — an empty chart reads as "no gaps",
-- which is the opposite of the truth.
--
-- The table ships now so that when the job is written the history can start accumulating
-- without a schema change.
--
-- Idempotent: the migrate runner re-applies every file on each run.

CREATE TABLE IF NOT EXISTS certification_gap_snapshots (
  id SERIAL PRIMARY KEY,
  row_id INTEGER NOT NULL REFERENCES certification_gap_rows(id) ON DELETE CASCADE,
  battalion_id INTEGER NOT NULL REFERENCES battalions(id) ON DELETE CASCADE,
  gap_count INTEGER NOT NULL,
  held_count INTEGER NOT NULL DEFAULT 0,
  required_count INTEGER NOT NULL DEFAULT 0,
  surplus_count INTEGER NOT NULL DEFAULT 0,
  snapshot_month TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (row_id, battalion_id, snapshot_month)
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'gap_snapshots_month_format') THEN
    ALTER TABLE certification_gap_snapshots ADD CONSTRAINT gap_snapshots_month_format
      CHECK (snapshot_month ~ '^\d{4}-\d{2}$');
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_gap_snapshots_batt_month
  ON certification_gap_snapshots(battalion_id, snapshot_month);
