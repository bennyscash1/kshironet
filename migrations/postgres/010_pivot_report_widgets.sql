-- Saved widgets for the "פילוח הסמכות" pivot report. A widget is purely a saved
-- configuration (which battalions / certifications / date range to chart) — the counts
-- themselves are always computed live from roster_entries, never stored here.
--
-- Saved widgets are GLOBAL: every viewer sees all of them regardless of who created
-- them, so reads are never scoped by `created_by` (it is provenance only).
--
-- Idempotent: the migrate runner re-applies every file on each run.

CREATE TABLE IF NOT EXISTS pivot_report_widgets (
  -- gen_random_uuid() is built into Postgres 13+ (and Supabase), no extension needed.
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  -- { battalionIds: int[], certificationIds: int[], fromDate: 'yyyy-MM-dd',
  --   toDate: 'yyyy-MM-dd' | null } — validated by lib/validation/pivot.ts on write.
  config JSONB NOT NULL,
  -- Supabase auth user id (users.id) of the creator, resolved server-side.
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pivot_report_widgets_created_at
  ON pivot_report_widgets(created_at);
