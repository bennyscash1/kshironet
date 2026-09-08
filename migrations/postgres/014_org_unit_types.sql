-- Organizational unit types, and the mechanism that COUNTS them from `roles`.
--
-- Spec §3.1.1: the number of units is never typed by a user. A requirement key reads
-- "12 per team", and the number of teams is COUNTED from the force structure at read
-- time. That is why `n` is not a column anywhere here — it is v_org_unit_counts.
--
-- Idempotent: the migrate runner re-applies every file on each run.

CREATE TABLE IF NOT EXISTS org_unit_types (
  id SERIAL PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  -- 'base'      counted directly from `roles` through org_unit_type_patterns
  -- 'composite' the sum of its members in org_unit_type_members
  kind TEXT NOT NULL DEFAULT 'base',
  sort_order INTEGER NOT NULL DEFAULT 0
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'org_unit_types_kind_allowed') THEN
    ALTER TABLE org_unit_types ADD CONSTRAINT org_unit_types_kind_allowed
      CHECK (kind IN ('base', 'composite'));
  END IF;
END $$;

-- How to find instances of a base unit type inside `roles`.
--
--   grain        what counts as ONE instance (the DISTINCT key)
--   match_target which column the pattern is applied to
--   pattern      a Postgres regex, applied with ~
CREATE TABLE IF NOT EXISTS org_unit_type_patterns (
  id SERIAL PRIMARY KEY,
  unit_type TEXT NOT NULL REFERENCES org_unit_types(code) ON DELETE CASCADE,
  grain TEXT NOT NULL,
  match_target TEXT NOT NULL,
  pattern TEXT NOT NULL,
  UNIQUE (unit_type, match_target, pattern)
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'org_unit_patterns_grain_allowed') THEN
    ALTER TABLE org_unit_type_patterns ADD CONSTRAINT org_unit_patterns_grain_allowed
      CHECK (grain IN ('battalion', 'company', 'department', 'squad'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'org_unit_patterns_target_allowed') THEN
    ALTER TABLE org_unit_type_patterns ADD CONSTRAINT org_unit_patterns_target_allowed
      CHECK (match_target IN ('company_kind', 'company_name', 'department', 'squad'));
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS org_unit_type_members (
  parent_code TEXT NOT NULL REFERENCES org_unit_types(code) ON DELETE CASCADE,
  child_code TEXT NOT NULL REFERENCES org_unit_types(code) ON DELETE CASCADE,
  PRIMARY KEY (parent_code, child_code)
);

-- ESCAPE HATCH — seeding path only.
--
-- Some unit types in the 6228 requirement key describe a structure that exists in no
-- workbook we have (a battalion whose force structure has not been imported, or a unit
-- concept no pattern can express). Without a fallback those requirements would compute
-- required = 0 and the tab would report NO GAPS for the very battalion the spec uses as
-- its worked example — a silent wrong answer, which is worse than a labelled one.
--
-- Three things keep §3.1.1's intent intact:
--   1. rows here are written ONLY by the importer / admin seeding route, never by the
--      gaps tab — the same lock as gap_requirement_keys.source = 'establishment';
--   2. it is a FALLBACK, never an override: a non-zero count from `roles` always wins,
--      so these numbers become dead weight the moment the real structure is imported;
--   3. v_org_unit_counts emits unit_count_source, so the UI can say which number it is
--      showing and never present a typed count as a counted one.
CREATE TABLE IF NOT EXISTS org_unit_manual_counts (
  battalion_id INTEGER NOT NULL REFERENCES battalions(id) ON DELETE CASCADE,
  unit_type TEXT NOT NULL REFERENCES org_unit_types(code) ON DELETE CASCADE,
  unit_count INTEGER NOT NULL,
  note TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (battalion_id, unit_type)
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'org_unit_manual_counts_non_negative') THEN
    ALTER TABLE org_unit_manual_counts ADD CONSTRAINT org_unit_manual_counts_non_negative
      CHECK (unit_count >= 0);
  END IF;
END $$;

INSERT INTO org_unit_types (code, name, kind, sort_order) VALUES
  ('company', 'פלוגה', 'base', 1),
  ('mefalag', 'מפל"ג', 'base', 2),
  ('machlaka', 'מחלקה', 'base', 3),
  ('kita', 'כיתה', 'base', 4),
  ('hq_company', 'חפ"ק פלוגתי', 'base', 5),
  ('medic_team', 'חוליה רפואית', 'base', 6),
  ('niud_kita', 'כיתת ניוד', 'base', 7),
  -- Present in the requirement key but NOT expressible from the workbooks we have.
  -- Left deliberately pattern-less: they resolve through org_unit_manual_counts and
  -- are labelled as such in the UI.
  ('team', 'צוות', 'base', 10),
  ('team_niud', 'צוות ניוד', 'base', 11),
  ('team_heavy', 'צוות תקיפה כבדה', 'base', 12),
  ('mihlol', 'מכלול', 'base', 13),
  ('hq_battalion', 'חפ"ק גדודי', 'base', 14),
  -- Not an entity in its own right: it is team ∪ team_niud. Modelling it as a composite
  -- rather than seeding rows for it is what stops the two from being double-counted.
  ('team_all', 'צוות כולל ניוד', 'composite', 15)
ON CONFLICT (code) DO NOTHING;

INSERT INTO org_unit_type_members (parent_code, child_code) VALUES
  ('team_all', 'team'),
  ('team_all', 'team_niud')
ON CONFLICT DO NOTHING;

-- Patterns derived from the ACTUAL department and squad labels in the workbooks.
-- 'company' matches on kind rather than on a negated name regex, so a company renamed
-- in the source cannot silently drop out of the count.
INSERT INTO org_unit_type_patterns (unit_type, grain, match_target, pattern) VALUES
  ('company', 'company', 'company_kind', '^rifle$'),
  ('mefalag', 'department', 'department', '^מפל"?ג'),
  ('machlaka', 'department', 'department', '^מחלקת'),
  ('kita', 'squad', 'squad', '^(כיתה|כיתת)'),
  ('hq_company', 'squad', 'squad', '^חפ"?ק'),
  ('medic_team', 'squad', 'squad', '^חולי+ה רפואית'),
  ('niud_kita', 'squad', 'squad', '^כיתת ניוד')
ON CONFLICT (unit_type, match_target, pattern) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Counting views.
--
-- CREATE OR REPLACE VIEW fails when a column list or type changes, and this file is
-- re-applied on every migrate run, so every view is dropped and recreated. Dependents
-- are dropped before dependencies via CASCADE.
-- ---------------------------------------------------------------------------

DROP VIEW IF EXISTS v_org_unit_counts CASCADE;
DROP VIEW IF EXISTS v_org_unit_counts_base CASCADE;

-- One row per (battalion × base unit type), counted straight from `roles`.
CREATE VIEW v_org_unit_counts_base AS
SELECT
  b.id AS battalion_id,
  t.code AS unit_type,
  COALESCE(c.n, 0)::int AS counted_from_roles
FROM battalions b
CROSS JOIN org_unit_types t
LEFT JOIN LATERAL (
  SELECT COUNT(DISTINCT
           CASE p.grain
             WHEN 'battalion' THEN co.battalion_id::text
             WHEN 'company' THEN co.id::text
             WHEN 'department' THEN co.id::text || '/' || r.department
             WHEN 'squad' THEN co.id::text || '/' || r.department || '/' || COALESCE(r.squad, '')
           END)::int AS n
  FROM org_unit_type_patterns p
  JOIN companies co ON co.battalion_id = b.id
  JOIN roles r ON r.company_id = co.id
  WHERE p.unit_type = t.code
    AND CASE p.match_target
          WHEN 'company_kind' THEN co.kind
          WHEN 'company_name' THEN co.name
          WHEN 'department' THEN r.department
          WHEN 'squad' THEN COALESCE(r.squad, '')
        END ~ p.pattern
) c ON TRUE
WHERE t.kind = 'base';

-- The number a requirement key multiplies by, plus where it came from.
CREATE VIEW v_org_unit_counts AS
-- Base types: a count from `roles` always wins; the manual number is only a fallback.
SELECT
  bs.battalion_id,
  bs.unit_type,
  CASE
    WHEN bs.counted_from_roles > 0 THEN bs.counted_from_roles
    ELSE COALESCE(m.unit_count, 0)
  END::int AS unit_count,
  CASE
    WHEN bs.counted_from_roles > 0 THEN 'roles'
    WHEN m.unit_count IS NOT NULL THEN 'manual'
    ELSE 'none'
  END AS unit_count_source
FROM v_org_unit_counts_base bs
LEFT JOIN org_unit_manual_counts m
  ON m.battalion_id = bs.battalion_id AND m.unit_type = bs.unit_type

UNION ALL

-- Composite types: the sum of their members, resolved one level deep.
SELECT
  b.id AS battalion_id,
  t.code AS unit_type,
  COALESCE(SUM(
    CASE
      WHEN bs.counted_from_roles > 0 THEN bs.counted_from_roles
      ELSE COALESCE(m.unit_count, 0)
    END
  ), 0)::int AS unit_count,
  CASE WHEN BOOL_OR(bs.counted_from_roles > 0) THEN 'roles' ELSE 'manual' END AS unit_count_source
FROM battalions b
CROSS JOIN org_unit_types t
JOIN org_unit_type_members mem ON mem.parent_code = t.code
JOIN v_org_unit_counts_base bs
  ON bs.battalion_id = b.id AND bs.unit_type = mem.child_code
LEFT JOIN org_unit_manual_counts m
  ON m.battalion_id = b.id AND m.unit_type = mem.child_code
WHERE t.kind = 'composite'
GROUP BY b.id, t.code;
