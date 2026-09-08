-- Battalion request → designated soldiers, and a per-allocation registration lock.
-- Follows app conventions: SERIAL PKs, snake_case, TIMESTAMPTZ timestamps (no
-- triggers), NULL for "unlimited"/"no lock". Idempotent: the migrate runner
-- re-applies every file on each run.

-- Soldiers a battalion designates on a request. When the brigade opens a
-- certification from the request, these are auto-inserted into the roster as
-- reserve (is_reserve = 1, outside the regular allocation).
CREATE TABLE IF NOT EXISTS battalion_request_soldiers (
  id SERIAL PRIMARY KEY,
  request_id INTEGER NOT NULL REFERENCES battalion_requests(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  personal_number TEXT,
  phone TEXT,
  battalion_id INTEGER REFERENCES battalions(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_request_soldiers_request ON battalion_request_soldiers(request_id);

-- Deadline after which the battalion can no longer register/edit trainees for a
-- given allocation. NULL = no lock.
ALTER TABLE certification_battalion_quotas
  ADD COLUMN IF NOT EXISTS registration_lock_at TIMESTAMPTZ;
