-- Trainings module (הדרכות)
-- Follows the app conventions: SERIAL PKs, snake_case, dates/times as TEXT,
-- TIMESTAMPTZ timestamps (updated manually, no triggers).

CREATE TABLE IF NOT EXISTS trainings (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  domain TEXT,
  start_date TEXT NOT NULL,
  end_date TEXT,
  contact_name TEXT,
  contact_phone TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS training_sessions (
  id SERIAL PRIMARY KEY,
  training_id INTEGER NOT NULL REFERENCES trainings(id) ON DELETE CASCADE,
  battalion_id INTEGER NOT NULL REFERENCES battalions(id),
  session_date TEXT NOT NULL,
  start_time TEXT NOT NULL,
  end_time TEXT NOT NULL,
  location TEXT,
  instructor_name TEXT,
  instructor_phone TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_trainings_start_date ON trainings(start_date);
CREATE INDEX IF NOT EXISTS idx_training_sessions_training ON training_sessions(training_id);
CREATE INDEX IF NOT EXISTS idx_training_sessions_battalion ON training_sessions(battalion_id);
