-- Per-record color for certifications and trainings, chosen inline in their forms
-- and rendered on the calendar. Nullable: legacy rows fall back to a computed color.

ALTER TABLE certifications ADD COLUMN IF NOT EXISTS color_hex TEXT;
ALTER TABLE trainings ADD COLUMN IF NOT EXISTS color_hex TEXT;
