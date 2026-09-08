-- Influencing factors (גורם משפיע): events/periods that affect battalion focus or
-- availability without necessarily moving soldiers (e.g. an exercise). Rendered on
-- the calendar in a fixed gray color (no per-course color). A factor can affect
-- multiple units via the join table.
-- App conventions: SERIAL PKs, snake_case, dates as TEXT, TIMESTAMPTZ timestamps.

CREATE TABLE IF NOT EXISTS influencing_factors (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  start_date TEXT NOT NULL,
  end_date TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS influencing_factor_battalions (
  influencing_factor_id INTEGER NOT NULL REFERENCES influencing_factors(id) ON DELETE CASCADE,
  battalion_id INTEGER NOT NULL REFERENCES battalions(id),
  PRIMARY KEY (influencing_factor_id, battalion_id)
);

CREATE INDEX IF NOT EXISTS idx_influencing_factors_start_date ON influencing_factors(start_date);
CREATE INDEX IF NOT EXISTS idx_infl_factor_battalions_factor ON influencing_factor_battalions(influencing_factor_id);
