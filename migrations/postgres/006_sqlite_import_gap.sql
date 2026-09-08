-- Schema reconciliation for the one-time SQLite -> Postgres data import.
-- Closes the gap between the source SQLite dump (certifications.db) and the app
-- schema so every source column has a destination. Idempotent / re-runnable:
-- every statement uses IF (NOT) EXISTS or is safe to repeat.
-- App conventions: SERIAL PKs, snake_case, dates as TEXT, TIMESTAMPTZ timestamps,
-- SMALLINT 0/1 flags (NOT boolean — repository SQL depends on this).

-- 1) training_unit_hours: present in the source, missing from the app schema.
--    Source: hours REAL -> NUMERIC. Preserves the source UNIQUE constraint and FKs.
CREATE TABLE IF NOT EXISTS training_unit_hours (
  id SERIAL PRIMARY KEY,
  training_id INTEGER NOT NULL REFERENCES trainings(id) ON DELETE CASCADE,
  day_date TEXT NOT NULL,
  battalion_id INTEGER NOT NULL REFERENCES battalions(id),
  hours NUMERIC NOT NULL,
  UNIQUE (training_id, day_date, battalion_id)
);
CREATE INDEX IF NOT EXISTS idx_training_unit_hours_training ON training_unit_hours(training_id);

-- 2) training_sessions: the source carries sub_framework + content, which the app
--    schema lacks. Add them so no source data is dropped (the app leaves
--    location/instructor_* NULL for imported rows).
ALTER TABLE training_sessions ADD COLUMN IF NOT EXISTS sub_framework TEXT;
ALTER TABLE training_sessions ADD COLUMN IF NOT EXISTS content TEXT;

--    Source start_time/end_time are nullable; the app declared them NOT NULL.
--    Relax so nullable source rows import losslessly.
ALTER TABLE training_sessions ALTER COLUMN start_time DROP NOT NULL;
ALTER TABLE training_sessions ALTER COLUMN end_time DROP NOT NULL;

-- 3) course_colors: the source has created_at; the app schema does not. Add it so
--    the timestamp is preserved on import.
ALTER TABLE course_colors ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
