-- Posting state and pending identity.
--
-- Two facts about the real source data that the first cut of the schema could not express:
--
-- 1. THE SOURCE HAS ITS OWN MANNING FLAG ("משובץ"), and it overrides name presence in BOTH
--    directions: 106 posts across the battalions record a soldier while flagged not-posted,
--    and 14 posts are flagged posted while recording nobody. Counting "has a name" as
--    manned therefore disagrees with every battalion's own spreadsheet. `is_posted` stores
--    that flag, and manning is derived from it.
--
-- 2. SOME PEOPLE HAVE NO PERSONAL NUMBER YET (9 on posts and in the bank). The personal
--    number is the join key for held certifications, the soldier lookup, and the one-way
--    integration from the certifications module. A placeholder value such as '000000' would
--    collide across soldiers and make those lookups return the WRONG person — silently. So
--    the column becomes nullable and the row is flagged `pending_pn` instead: the head-count
--    keeps them, and every path that needs identity refuses them.
--
-- The same reasoning covers a post that is flagged manned with nobody recorded: it counts
-- toward manning (the battalion counts it filled) but has no identity, so it is flagged
-- `pending_name` and is likewise not usable downstream.
--
-- Idempotent: the migrate runner re-applies every file on each run.

-- --- role_assignments ------------------------------------------------------

-- Was NOT NULL. A post can be officially manned while the name is still to be entered.
ALTER TABLE role_assignments ALTER COLUMN full_name DROP NOT NULL;
ALTER TABLE role_assignments ALTER COLUMN personal_number DROP NOT NULL;

-- The source's "משובץ" flag. 1 = this post is manned; 0 = a soldier is recorded against
-- the post but is not actually filling it.
ALTER TABLE role_assignments
  ADD COLUMN IF NOT EXISTS is_posted SMALLINT NOT NULL DEFAULT 1;

-- Identity is incomplete: no personal number, or no name at all.
ALTER TABLE role_assignments
  ADD COLUMN IF NOT EXISTS pending_pn SMALLINT NOT NULL DEFAULT 0;
ALTER TABLE role_assignments
  ADD COLUMN IF NOT EXISTS pending_name SMALLINT NOT NULL DEFAULT 0;

-- The flags must describe the row, or they are worse than no flags at all: code that
-- trusts `pending_pn` to mean "no personal number" would silently mis-handle a row where
-- the two disagree.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'role_assignments_pending_pn_consistent') THEN
    ALTER TABLE role_assignments ADD CONSTRAINT role_assignments_pending_pn_consistent
      CHECK ((pending_pn = 1) = (personal_number IS NULL));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'role_assignments_pending_name_consistent') THEN
    ALTER TABLE role_assignments ADD CONSTRAINT role_assignments_pending_name_consistent
      CHECK ((pending_name = 1) = (full_name IS NULL));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_role_assignments_pending
  ON role_assignments(pending_pn, pending_name);

-- --- bank_soldiers --------------------------------------------------------

ALTER TABLE bank_soldiers ALTER COLUMN personal_number DROP NOT NULL;
ALTER TABLE bank_soldiers
  ADD COLUMN IF NOT EXISTS pending_pn SMALLINT NOT NULL DEFAULT 0;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'bank_soldiers_pending_pn_consistent') THEN
    ALTER TABLE bank_soldiers ADD CONSTRAINT bank_soldiers_pending_pn_consistent
      CHECK ((pending_pn = 1) = (personal_number IS NULL));
  END IF;
END $$;

-- UNIQUE (company_id, personal_number) still holds for real numbers; Postgres treats
-- NULLs as distinct, so several pending-identity soldiers can coexist in one company —
-- which is precisely the behaviour a placeholder value would have destroyed.

-- --- v_role_status --------------------------------------------------------
--
-- Manning now follows `is_posted` rather than the presence of a name, and a fourth state
-- appears: 'pending', a post that is manned but whose occupant has no recorded identity.
-- It is deliberately NOT 'red' — we do not know which certifications that person holds,
-- and counting unknown as missing would overstate the certification gap.

DROP VIEW IF EXISTS v_role_status CASCADE;

CREATE VIEW v_role_status AS
WITH held AS (
  SELECT ra.role_id, ARRAY_AGG(sc.certification_name) AS certs
  FROM role_assignments ra
  JOIN soldier_certifications sc ON sc.personal_number = ra.personal_number
  WHERE ra.personal_number IS NOT NULL
  GROUP BY ra.role_id
),
-- Drone coverage is POSITION-INDEPENDENT (§2.3): anyone in the squad holding any model
-- satisfies the drone requirement for every post in it. Only posts that are actually
-- manned contribute coverage.
squad_drone AS (
  SELECT DISTINCT r.company_id, r.department, r.squad
  FROM roles r
  JOIN role_assignments ra ON ra.role_id = r.id AND ra.is_posted = 1
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
  (ra.id IS NOT NULL AND ra.is_posted = 1) AS is_manned,
  COALESCE(ra.pending_pn, 0) AS pending_pn,
  COALESCE(ra.pending_name, 0) AS pending_name,
  CASE
    -- No assignment, or a soldier recorded against a post they do not actually fill.
    WHEN ra.id IS NULL OR ra.is_posted = 0 THEN 'empty'
    -- Manned, but we cannot say by whom, so we cannot say what they hold.
    WHEN ra.pending_name = 1 OR ra.pending_pn = 1 THEN 'pending'
    WHEN EXISTS (
      SELECT 1
      FROM req
      WHERE req.role_id = r.id
        AND NOT (
          (req.txt IN ('רחפן', 'רחפנים')
            AND EXISTS (
              SELECT 1 FROM squad_drone sd
              WHERE sd.company_id = r.company_id
                AND sd.department = r.department
                AND sd.squad IS NOT DISTINCT FROM r.squad
            ))
          OR COALESCE(h.certs, '{}'::text[]) && regexp_split_to_array(req.txt, '\s*/\s*')
        )
    ) THEN 'red'
    ELSE 'ok'
  END AS status
FROM roles r
JOIN companies co ON co.id = r.company_id
LEFT JOIN role_assignments ra ON ra.role_id = r.id
LEFT JOIN held h ON h.role_id = r.id;
