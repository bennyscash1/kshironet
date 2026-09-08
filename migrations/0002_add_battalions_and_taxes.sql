CREATE TABLE IF NOT EXISTS certification_taxes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  certification_id INTEGER NOT NULL REFERENCES certifications(id) ON DELETE CASCADE,
  role_name TEXT NOT NULL,
  is_fulfilled INTEGER NOT NULL DEFAULT 0,
  notes TEXT
);
