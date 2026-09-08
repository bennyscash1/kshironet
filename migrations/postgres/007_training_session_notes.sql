-- Add an optional free-text notes field to training sessions (blocks).
-- Idempotent: the migrate runner re-applies every file on each run.

ALTER TABLE training_sessions ADD COLUMN IF NOT EXISTS notes TEXT;
