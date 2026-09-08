-- File attachments (images / PDF) for certifications. Only metadata lives here —
-- the bytes are stored in the private Supabase Storage bucket `certification-files`
-- (see lib/storage/certification-files.ts), keyed by `storage_path`.
-- Follows app conventions: SERIAL PKs, snake_case, TIMESTAMPTZ timestamps.
-- Idempotent: the migrate runner re-applies every file on each run.

CREATE TABLE IF NOT EXISTS certification_files (
  id SERIAL PRIMARY KEY,
  certification_id INTEGER NOT NULL REFERENCES certifications(id) ON DELETE CASCADE,
  -- Path inside the storage bucket: certifications/{certification_id}/{uuid}-{name}
  storage_path TEXT NOT NULL UNIQUE,
  original_name TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size_bytes BIGINT NOT NULL,
  -- Supabase auth user id (users.id) of the uploader, resolved server-side.
  uploaded_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_certification_files_certification
  ON certification_files(certification_id);
