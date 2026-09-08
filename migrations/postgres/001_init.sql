-- AsmachtaLink schema (Postgres / Supabase)
-- Converted from local SQLite migrations

CREATE TABLE IF NOT EXISTS battalions (
  id SERIAL PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  color_hex TEXT NOT NULL DEFAULT '#64748B',
  is_active SMALLINT NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS certification_gap_rows (
  id SERIAL PRIMARY KEY,
  certification_name TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS certification_templates (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  domain TEXT,
  default_location TEXT,
  default_slots INTEGER,
  default_notes TEXT,
  gap_row_id INTEGER REFERENCES certification_gap_rows(id) ON DELETE SET NULL,
  checkin_details TEXT,
  duration_text TEXT,
  trainee_ratio TEXT,
  ammo_required TEXT,
  requirements_text TEXT,
  equipment_text TEXT,
  contacts_text TEXT,
  color_hex TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS certifications (
  id SERIAL PRIMARY KEY,
  template_id INTEGER REFERENCES certification_templates(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  domain TEXT,
  start_date TEXT NOT NULL,
  end_date TEXT,
  location TEXT,
  total_slots INTEGER,
  registration_open SMALLINT NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'draft',
  notes TEXT,
  origin_request_id INTEGER,
  gap_row_id INTEGER REFERENCES certification_gap_rows(id) ON DELETE SET NULL,
  created_by_role TEXT NOT NULL DEFAULT 'brigade',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS certification_prerequisites (
  id SERIAL PRIMARY KEY,
  certification_id INTEGER NOT NULL REFERENCES certifications(id) ON DELETE CASCADE,
  description TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS certification_battalion_quotas (
  id SERIAL PRIMARY KEY,
  certification_id INTEGER NOT NULL REFERENCES certifications(id) ON DELETE CASCADE,
  battalion_id INTEGER NOT NULL REFERENCES battalions(id) ON DELETE CASCADE,
  allocated_slots INTEGER NOT NULL DEFAULT 0,
  notes TEXT,
  UNIQUE (certification_id, battalion_id)
);

CREATE TABLE IF NOT EXISTS certification_taxes (
  id SERIAL PRIMARY KEY,
  certification_id INTEGER NOT NULL REFERENCES certifications(id) ON DELETE CASCADE,
  role_name TEXT NOT NULL,
  is_fulfilled SMALLINT NOT NULL DEFAULT 0,
  notes TEXT
);

CREATE TABLE IF NOT EXISTS roster_entries (
  id SERIAL PRIMARY KEY,
  certification_id INTEGER NOT NULL REFERENCES certifications(id) ON DELETE CASCADE,
  battalion_id INTEGER NOT NULL REFERENCES battalions(id),
  full_name TEXT NOT NULL,
  personal_number TEXT NOT NULL,
  company_platoon TEXT,
  phone TEXT,
  commander_name TEXT,
  commander_phone TEXT,
  has_prior_certification SMALLINT NOT NULL DEFAULT 0,
  prior_certification_details TEXT,
  meets_prerequisite SMALLINT,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'registered',
  outcome_reason TEXT,
  is_reserve SMALLINT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS battalion_requests (
  id SERIAL PRIMARY KEY,
  battalion_id INTEGER NOT NULL REFERENCES battalions(id),
  requested_cert_type TEXT NOT NULL,
  quantity_needed INTEGER NOT NULL DEFAULT 1,
  reason TEXT,
  urgency TEXT NOT NULL DEFAULT 'normal',
  desired_date TEXT,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'opened',
  linked_certification_id INTEGER REFERENCES certifications(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS notifications (
  id SERIAL PRIMARY KEY,
  type TEXT NOT NULL,
  target_role TEXT NOT NULL,
  entity_type TEXT,
  entity_id INTEGER,
  message TEXT NOT NULL,
  is_read SMALLINT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS status_history (
  id SERIAL PRIMARY KEY,
  entity_type TEXT NOT NULL,
  entity_id INTEGER NOT NULL,
  old_status TEXT,
  new_status TEXT NOT NULL,
  changed_by_role TEXT NOT NULL,
  note TEXT,
  changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS course_colors (
  name TEXT PRIMARY KEY,
  color_hex TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS certification_gap_values (
  row_id INTEGER NOT NULL REFERENCES certification_gap_rows(id) ON DELETE CASCADE,
  battalion_id INTEGER NOT NULL REFERENCES battalions(id) ON DELETE CASCADE,
  gap_count INTEGER NOT NULL DEFAULT 0,
  sent_count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (row_id, battalion_id)
);

CREATE INDEX IF NOT EXISTS idx_certifications_status ON certifications(status);
CREATE INDEX IF NOT EXISTS idx_certifications_start_date ON certifications(start_date);
CREATE INDEX IF NOT EXISTS idx_roster_certification ON roster_entries(certification_id);
CREATE INDEX IF NOT EXISTS idx_roster_battalion ON roster_entries(battalion_id);
CREATE INDEX IF NOT EXISTS idx_requests_battalion ON battalion_requests(battalion_id);
CREATE INDEX IF NOT EXISTS idx_notifications_target ON notifications(target_role);
