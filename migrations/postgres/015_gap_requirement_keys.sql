-- The "פערים" tab: subject families, the computation key, nominations, and the two views
-- that carry the arithmetic invariants.
--
-- Spec §3.1: required_count and gap_count are NEVER stored. They depend on counts across
-- other tables (roles, soldier_certifications, gap_requirement_keys), so a generated
-- column is impossible — a view it is. Storing them would let a stale number outlive the
-- structure it was derived from, which is exactly the failure this tab exists to end.
--
-- Idempotent: the migrate runner re-applies every file on each run.

-- Colour lives at FAMILY level only (§3.1.2). The per-certification shade is derived in
-- code from gap size, so adding a certification to a family needs no migration.
CREATE TABLE IF NOT EXISTS certification_families (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  ink TEXT NOT NULL,
  line TEXT NOT NULL,
  bg TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0
);

-- UNIQUE(name) above is load-bearing: without a real conflict target this seed would
-- append five more rows on every migrate run.
INSERT INTO certification_families (name, ink, line, bg, sort_order) VALUES
  ('רחפנים', '#0b7a4b', '#8fd9b6', '#eaf7f0', 1),
  ('נהיגה וניוד', '#1d4ed8', '#a5bcf5', '#ecf1fe', 2),
  ('נשק וחימוש', '#b45309', '#f0c489', '#fdf3e6', 3),
  ('רפואה', '#be123c', '#f3a6b8', '#fdeef2', 4),
  ('מכלול 750', '#6d28d9', '#c4aef2', '#f4eefe', 5)
ON CONFLICT (name) DO NOTHING;

ALTER TABLE certification_gap_rows
  ADD COLUMN IF NOT EXISTS family_id INTEGER REFERENCES certification_families(id);

-- Alias-resolved name used to join soldier_certifications. Display keeps
-- certification_name exactly as a human entered it.
ALTER TABLE certification_gap_rows
  ADD COLUMN IF NOT EXISTS canonical_cert_name TEXT;

-- The DEFAULT requirement source for this certification. The effective, per-battalion
-- choice lives on certification_gap_values below.
ALTER TABLE certification_gap_rows
  ADD COLUMN IF NOT EXISTS active_source TEXT NOT NULL DEFAULT 'establishment';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'gap_rows_active_source_allowed') THEN
    ALTER TABLE certification_gap_rows ADD CONSTRAINT gap_rows_active_source_allowed
      CHECK (active_source IN ('operational', 'establishment'));
  END IF;
END $$;

-- Each battalion chooses its own source. A single global column would mean one battalion
-- switching איבו to "צורך מבצעי" silently switched it for every other battalion too.
-- certification_gap_values already has PRIMARY KEY (row_id, battalion_id), so it is the
-- natural home. NULL = inherit the row default.
ALTER TABLE certification_gap_values ADD COLUMN IF NOT EXISTS active_source TEXT;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'gap_values_active_source_allowed') THEN
    ALTER TABLE certification_gap_values ADD CONSTRAINT gap_values_active_source_allowed
      CHECK (active_source IS NULL OR active_source IN ('operational', 'establishment'));
  END IF;
END $$;

-- Backfill the canonical name for rows that predate this column.
UPDATE certification_gap_rows gr
SET canonical_cert_name = COALESCE(
  (SELECT a.canonical_name
     FROM certification_aliases a
    WHERE a.alias = gr.certification_name
      AND a.kind <> 'quarantine'),
  gr.certification_name
)
WHERE gr.canonical_cert_name IS NULL;

-- The computation key: one row per addend of the requirement sum (§3.1.1).
-- required = Σ (qty × unit_count counted from `roles`).
--
-- source='establishment' rows are LOCKED — derived from the force structure, writable
-- only by the seeding path that writes `roles`. The API layer has no endpoint that
-- updates them, and the trigger below refuses anyway.
CREATE TABLE IF NOT EXISTS gap_requirement_keys (
  id SERIAL PRIMARY KEY,
  gap_row_id INTEGER NOT NULL REFERENCES certification_gap_rows(id) ON DELETE CASCADE,
  battalion_id INTEGER NOT NULL REFERENCES battalions(id) ON DELETE CASCADE,
  source TEXT NOT NULL,
  qty INTEGER NOT NULL,
  unit_type TEXT NOT NULL REFERENCES org_unit_types(code),
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (gap_row_id, battalion_id, source, sort_order)
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'gap_keys_source_allowed') THEN
    ALTER TABLE gap_requirement_keys ADD CONSTRAINT gap_keys_source_allowed
      CHECK (source IN ('operational', 'establishment'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'gap_keys_qty_non_negative') THEN
    ALTER TABLE gap_requirement_keys ADD CONSTRAINT gap_keys_qty_non_negative
      CHECK (qty >= 0);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_gap_keys_row_batt
  ON gap_requirement_keys(gap_row_id, battalion_id, source);

-- Defence in depth for the locked source (§3.1.1, test §5.0).
--
-- The UI disables the controls and the API has no route that writes these rows; this is
-- the third, independent guard, so that no stray query or future endpoint can move a
-- number that is supposed to be derived. The seeding path opts in explicitly with
--   SET LOCAL app.seeding = 'on'
-- inside its transaction, which scopes the exemption to that transaction alone.
CREATE OR REPLACE FUNCTION gap_keys_establishment_is_locked() RETURNS trigger AS $$
BEGIN
  IF COALESCE(current_setting('app.seeding', true), 'off') = 'on' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  IF TG_OP = 'INSERT' AND NEW.source = 'establishment' THEN
    RAISE EXCEPTION 'gap_requirement_keys: source=establishment is written by the seeding path only';
  END IF;

  IF TG_OP IN ('UPDATE', 'DELETE') AND OLD.source = 'establishment' THEN
    RAISE EXCEPTION 'gap_requirement_keys: source=establishment is read-only';
  END IF;

  RETURN COALESCE(NEW, OLD);
END $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_gap_keys_establishment_lock ON gap_requirement_keys;
CREATE TRIGGER trg_gap_keys_establishment_lock
  BEFORE INSERT OR UPDATE OR DELETE ON gap_requirement_keys
  FOR EACH ROW EXECUTE FUNCTION gap_keys_establishment_is_locked();

-- Candidates nominated against a gap (§3.3). Dual-mode: either a link to a real post in
-- the force structure, or free text.
--
-- Invariant §0.3.4: saving a nomination creates NO roster_entries. Note this table does
-- not reference roster_entries at all — sending to registration is a separate, explicit
-- action through the existing roster endpoint.
CREATE TABLE IF NOT EXISTS gap_nominations (
  id SERIAL PRIMARY KEY,
  gap_row_id INTEGER NOT NULL REFERENCES certification_gap_rows(id) ON DELETE CASCADE,
  battalion_id INTEGER NOT NULL REFERENCES battalions(id) ON DELETE CASCADE,
  certification_id INTEGER REFERENCES certifications(id) ON DELETE SET NULL,
  role_assignment_id INTEGER REFERENCES role_assignments(id) ON DELETE SET NULL,
  free_text_name TEXT,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by_role TEXT
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'gap_nominations_exactly_one_subject') THEN
    ALTER TABLE gap_nominations ADD CONSTRAINT gap_nominations_exactly_one_subject
      CHECK (
        (role_assignment_id IS NOT NULL AND free_text_name IS NULL)
        OR (role_assignment_id IS NULL AND free_text_name IS NOT NULL)
      );
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_gap_nominations_row_batt
  ON gap_nominations(gap_row_id, battalion_id);

-- ---------------------------------------------------------------------------
-- v_role_status — §2.3 manning status, in SQL.
--
-- Kept here rather than only in TypeScript so the canvas and the KPI cards cannot
-- disagree about whether a post is covered.
-- ---------------------------------------------------------------------------

DROP VIEW IF EXISTS v_role_status CASCADE;

CREATE VIEW v_role_status AS
WITH held AS (
  SELECT ra.role_id, ARRAY_AGG(sc.certification_name) AS certs
  FROM role_assignments ra
  JOIN soldier_certifications sc ON sc.personal_number = ra.personal_number
  GROUP BY ra.role_id
),
-- Drone coverage is POSITION-INDEPENDENT (§2.3): if anyone in the squad holds any drone
-- model, the drone requirement is satisfied for every post in that squad. This is squad
-- capability, not personal qualification — do not "fix" it to role level.
squad_drone AS (
  SELECT DISTINCT r.company_id, r.department, r.squad
  FROM roles r
  JOIN role_assignments ra ON ra.role_id = r.id
  JOIN soldier_certifications sc ON sc.personal_number = ra.personal_number
  JOIN drone_models dm ON dm.name = sc.certification_name
),
req AS (
  SELECT r.id AS role_id, btrim(u.txt) AS txt
  FROM roles r
  CROSS JOIN LATERAL (VALUES (r.req1), (r.req2), (r.req3)) AS u(txt)
  WHERE u.txt IS NOT NULL AND btrim(u.txt) <> ''
)
SELECT
  r.id AS role_id,
  r.company_id,
  co.battalion_id,
  r.department,
  r.squad,
  (ra.id IS NOT NULL) AS is_manned,
  CASE
    WHEN ra.id IS NULL THEN 'empty'
    WHEN EXISTS (
      SELECT 1
      FROM req
      WHERE req.role_id = r.id
        AND NOT (
          -- a generic drone token is met by squad-level coverage
          (req.txt IN ('רחפן', 'רחפנים')
            AND EXISTS (
              SELECT 1 FROM squad_drone sd
              WHERE sd.company_id = r.company_id
                AND sd.department = r.department
                -- IS NOT DISTINCT FROM, not =: a NULL squad must still match itself,
                -- and company_id/department already bound the comparison.
                AND sd.squad IS NOT DISTINCT FROM r.squad
            ))
          -- "A / B" alternation: holding either one satisfies the requirement
          OR COALESCE(h.certs, '{}'::text[]) && regexp_split_to_array(req.txt, '\s*/\s*')
        )
    ) THEN 'red'
    ELSE 'ok'
  END AS status
FROM roles r
JOIN companies co ON co.id = r.company_id
LEFT JOIN role_assignments ra ON ra.role_id = r.id
LEFT JOIN held h ON h.role_id = r.id;

-- ---------------------------------------------------------------------------
-- v_certification_gaps — the gap arithmetic, one row per (gap row × battalion).
--
-- Invariant §0.3.6: gap is MAX(0, required − held) PER ROW, then summed. The clamp is
-- applied inside the row here, so no caller can reconstruct an unclamped total from the
-- view's columns. On the reference fixture this is the difference between 116 and 111.
--
-- Invariant §0.3.7: surplus is its own column and no expression subtracts it from
-- anything. A battalion with three spare operators of one model has not thereby closed
-- three missing seats on another.
--
-- Invariant §0.3.3: the manually entered number travels alongside the computed one and
-- is never replaced by it.
--
-- Note MAX(0, x) is SQLite; in Postgres MAX is an aggregate, so this is GREATEST.
-- ---------------------------------------------------------------------------

DROP VIEW IF EXISTS v_certification_gaps CASCADE;

CREATE VIEW v_certification_gaps AS
WITH active AS (
  SELECT
    gr.id AS gap_row_id,
    b.id AS battalion_id,
    COALESCE(gv.active_source, gr.active_source) AS active_source
  FROM certification_gap_rows gr
  CROSS JOIN battalions b
  LEFT JOIN certification_gap_values gv
    ON gv.row_id = gr.id AND gv.battalion_id = b.id
  WHERE b.is_active = 1
),
req AS (
  SELECT
    a.gap_row_id,
    a.battalion_id,
    a.active_source,
    -- COALESCE goes INSIDE the SUM. Outside it, a single unmatched unit_type would NULL
    -- one addend and silently under-report the whole requirement.
    COALESCE(SUM(k.qty * COALESCE(uc.unit_count, 0)), 0)::int AS required_count,
    COUNT(k.id)::int AS key_line_count,
    COALESCE(BOOL_OR(uc.unit_count_source = 'manual'), FALSE) AS uses_manual_unit_count
  FROM active a
  LEFT JOIN gap_requirement_keys k
    ON k.gap_row_id = a.gap_row_id
   AND k.battalion_id = a.battalion_id
   AND k.source = a.active_source
  LEFT JOIN v_org_unit_counts uc
    ON uc.battalion_id = a.battalion_id
   AND uc.unit_type = k.unit_type
  GROUP BY a.gap_row_id, a.battalion_id, a.active_source
),
holders AS (
  -- held = soldier_certifications ∩ this battalion's role_assignments (§3.1.1).
  -- DISTINCT personal_number so one soldier counts once even across two posts.
  SELECT
    co.battalion_id,
    sc.certification_name,
    COUNT(DISTINCT sc.personal_number)::int AS held_count
  FROM soldier_certifications sc
  JOIN role_assignments ra ON ra.personal_number = sc.personal_number
  JOIN roles r ON r.id = ra.role_id
  JOIN companies co ON co.id = r.company_id
  GROUP BY co.battalion_id, sc.certification_name
)
SELECT
  req.gap_row_id,
  req.battalion_id,
  gr.certification_name,
  COALESCE(gr.canonical_cert_name, gr.certification_name) AS canonical_cert_name,
  gr.family_id,
  gr.sort_order,
  req.active_source,
  req.key_line_count,
  req.uses_manual_unit_count,
  req.required_count,
  COALESCE(h.held_count, 0)::int AS held_count,
  GREATEST(req.required_count - COALESCE(h.held_count, 0), 0)::int AS gap_count,
  GREATEST(COALESCE(h.held_count, 0) - req.required_count, 0)::int AS surplus_count,
  CASE
    WHEN req.required_count > COALESCE(h.held_count, 0) THEN 'gap'
    WHEN req.required_count < COALESCE(h.held_count, 0) THEN 'surplus'
    ELSE 'balanced'
  END AS gap_state,
  gv.gap_count AS manual_gap_count,
  gv.sent_count AS manual_sent_count,
  (gv.row_id IS NOT NULL) AS has_manual_value
FROM req
JOIN certification_gap_rows gr ON gr.id = req.gap_row_id
LEFT JOIN holders h
  ON h.battalion_id = req.battalion_id
 AND h.certification_name = COALESCE(gr.canonical_cert_name, gr.certification_name)
LEFT JOIN certification_gap_values gv
  ON gv.row_id = req.gap_row_id AND gv.battalion_id = req.battalion_id;
