-- Cancellable edit sessions for the force-structure canvas ("שניים לפנים").
--
-- WHY THIS TABLE EXISTS AT ALL: the canvas persists every drag the moment it happens —
-- `moveAssignment` / `placeBankOnRole` each commit their own transaction — so "מצב עריכה"
-- has never had an in-memory draft to throw away. Backing out of a session therefore means
-- writing the people layer back to what it was when the session opened, and that
-- pre-session state has to live somewhere durable while the user edits.
--
-- WHY THE SNAPSHOT IS NOT HELD BY THE BROWSER: the two move endpoints deliberately cannot
-- invent a person — they only relocate a record that already exists (see the schema notes
-- in lib/validation/force-structure.ts). A restore endpoint that accepted the occupancy
-- payload from the client would hand a battalion editor exactly the power those schemas
-- withhold: writing arbitrary names and personal numbers into `role_assignments`. So the
-- server captures the snapshot, the server keeps it, and the client only ever holds its id.
--
-- Idempotent: the migrate runner re-applies every file on each run.

CREATE TABLE IF NOT EXISTS force_structure_edit_snapshots (
  id SERIAL PRIMARY KEY,
  battalion_id INTEGER NOT NULL REFERENCES battalions(id) ON DELETE CASCADE,
  -- The user who opened the session. Checked on revert: one editor's cancel must not roll
  -- back a different editor's session, and an id alone is guessable.
  created_by_user TEXT NOT NULL,
  -- `battalion:CODE`, matching the audit convention used by gap_nominations.
  created_by_role TEXT,
  -- The whole people layer for the battalion at the moment edit mode opened: role
  -- occupancy keyed by role_id, plus the 120% bank. Requirement columns are NOT in here
  -- and never can be — a revert rewrites people, never the establishment (§0.3.1).
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_fs_edit_snapshots_batt_user
  ON force_structure_edit_snapshots(battalion_id, created_by_user);
