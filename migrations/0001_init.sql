CREATE TABLE IF NOT EXISTS battalions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  color_hex TEXT NOT NULL DEFAULT '#64748B',
  is_active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS certification_gap_rows (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  certification_name TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS certification_templates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
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
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS certifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  template_id INTEGER REFERENCES certification_templates(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  domain TEXT,
  start_date TEXT NOT NULL,
  end_date TEXT,
  location TEXT,
  total_slots INTEGER,
  registration_open INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'draft',
  notes TEXT,
  origin_request_id INTEGER,
  gap_row_id INTEGER REFERENCES certification_gap_rows(id) ON DELETE SET NULL,
  created_by_role TEXT NOT NULL DEFAULT 'brigade',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS certification_prerequisites (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  certification_id INTEGER NOT NULL REFERENCES certifications(id) ON DELETE CASCADE,
  description TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS certification_battalion_quotas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  certification_id INTEGER NOT NULL REFERENCES certifications(id) ON DELETE CASCADE,
  battalion_id INTEGER NOT NULL REFERENCES battalions(id) ON DELETE CASCADE,
  allocated_slots INTEGER NOT NULL DEFAULT 0,
  notes TEXT,
  UNIQUE (certification_id, battalion_id)
);

CREATE TABLE IF NOT EXISTS roster_entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  certification_id INTEGER NOT NULL REFERENCES certifications(id) ON DELETE CASCADE,
  battalion_id INTEGER NOT NULL REFERENCES battalions(id),
  full_name TEXT NOT NULL,
  personal_number TEXT NOT NULL,
  company_platoon TEXT,
  phone TEXT,
  commander_name TEXT,
  commander_phone TEXT,
  has_prior_certification INTEGER NOT NULL DEFAULT 0,
  prior_certification_details TEXT,
  meets_prerequisite INTEGER,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'registered',
  outcome_reason TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS battalion_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  battalion_id INTEGER NOT NULL REFERENCES battalions(id),
  requested_cert_type TEXT NOT NULL,
  quantity_needed INTEGER NOT NULL DEFAULT 1,
  reason TEXT,
  urgency TEXT NOT NULL DEFAULT 'normal',
  desired_date TEXT,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'opened',
  linked_certification_id INTEGER REFERENCES certifications(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL,
  target_role TEXT NOT NULL,
  entity_type TEXT,
  entity_id INTEGER,
  message TEXT NOT NULL,
  is_read INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS status_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  entity_type TEXT NOT NULL,
  entity_id INTEGER NOT NULL,
  old_status TEXT,
  new_status TEXT NOT NULL,
  changed_by_role TEXT NOT NULL,
  note TEXT,
  changed_at TEXT NOT NULL DEFAULT (datetime('now'))
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
