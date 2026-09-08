-- Global key/value settings. There was no such table in the app before this.
--
-- Spec §1.7: the registration-close window is a shared parameter, not a constant repeated
-- at each call site — the green square's red frame and the calendar's urgency marker must
-- move together when it changes.
--
-- Values are TEXT and parsed by lib/db/repositories/system-settings.ts.
-- Idempotent: the migrate runner re-applies every file on each run.

CREATE TABLE IF NOT EXISTS system_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  description TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by TEXT
);

-- ON CONFLICT DO NOTHING is load-bearing, not decorative: this file re-runs on every
-- migrate, and DO UPDATE would silently revert whatever the brigade configured back to
-- the defaults below.
INSERT INTO system_settings (key, value, description) VALUES
  ('registration_close_days', '7',
   'סגירת רישום — כמה ימים לפני certifications.start_date נסגרת ההרשמה'),
  ('registration_close_warn_days', '3',
   'מתחת לכמה ימים לסגירה נוצרת התראה'),
  ('bank_capacity_pct', '120',
   'תקרת בנק כאחוז מ-COUNT(roles) של הפלוגה')
ON CONFLICT (key) DO NOTHING;
