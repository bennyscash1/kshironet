-- "שניים לפנים" — force-structure module.
--
-- The central invariant (spec §0.3.1): a post's requirements are STATIC REFERENCE DATA.
-- They must never be written, derived from, or made dependent on whoever occupies the
-- post. That is enforced structurally here by keeping two layers in separate tables with
-- separate write paths:
--
--   reference layer : companies · roles · role_reference   (seeding path only)
--   people layer    : role_assignments · bank_soldiers · soldier_certifications
--
-- Nothing in this file references certifications or roster_entries — the integration with
-- the certifications module is one-directional and lives in the application layer (§2.6).
--
-- App conventions: SERIAL PKs, snake_case, dates as TEXT 'yyyy-MM-dd', TIMESTAMPTZ
-- timestamps, SMALLINT 0/1 flags (NOT boolean — repository SQL depends on this).
-- Idempotent: the migrate runner re-applies every file on each run.

-- A company within a battalion. `kind` drives which reference establishment applies:
-- a rifle company has 99 posts across 4 departments, while the support company
-- ("מסייעת") has 139 across 7 and carries a third requirement column.
CREATE TABLE IF NOT EXISTS companies (
  id SERIAL PRIMARY KEY,
  battalion_id INTEGER NOT NULL REFERENCES battalions(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'rifle',
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (battalion_id, code)
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'companies_kind_allowed') THEN
    ALTER TABLE companies ADD CONSTRAINT companies_kind_allowed
      CHECK (kind IN ('rifle', 'support'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_companies_battalion ON companies(battalion_id);

-- STATIC REFERENCE DATA. Written ONLY by scripts/import-force-structure.ts and by
-- POST /api/force-structure/admin/roles. No assignment endpoint may touch this table,
-- and no transaction may write both this and role_assignments (spec §0.2, §5.1).
--
-- `squad` comes from the "◄ <name>" separator rows in the source workbooks. It is what
-- makes squad-level drone coverage computable (§2.3) — without it the drone requirement
-- cannot be evaluated at all, so the importer refuses a role that has none.
CREATE TABLE IF NOT EXISTS roles (
  id SERIAL PRIMARY KEY,
  company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  department TEXT NOT NULL,
  squad TEXT,
  serial TEXT NOT NULL,
  role_name TEXT NOT NULL,
  req1 TEXT,
  req2 TEXT,
  -- The support-company workbooks carry a THIRD requirement column. The spec omits it;
  -- dropping it would silently lose requirements for 417 posts.
  req3 TEXT,
  dept_sort INTEGER NOT NULL DEFAULT 0,
  squad_sort INTEGER NOT NULL DEFAULT 0,
  row_sort INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (company_id, serial)
);

CREATE INDEX IF NOT EXISTS idx_roles_company ON roles(company_id);
CREATE INDEX IF NOT EXISTS idx_roles_company_dept_squad ON roles(company_id, department, squad);
CREATE INDEX IF NOT EXISTS idx_roles_req1 ON roles(req1);
CREATE INDEX IF NOT EXISTS idx_roles_req2 ON roles(req2);

-- The establishment reference table (§2.2).
--
-- VALIDATION SOURCE ONLY. It carries no company and no squad, so it cannot itself
-- populate `roles`; the importer diffs the company workbooks against it and refuses to
-- write when the diff is non-empty (unless --force). This preserves §2.2's intent —
-- requirements are static reference data on a dedicated path — while being executable.
CREATE TABLE IF NOT EXISTS role_reference (
  id SERIAL PRIMARY KEY,
  company_kind TEXT NOT NULL,
  department TEXT NOT NULL,
  serial TEXT NOT NULL,
  role_name TEXT NOT NULL,
  req1 TEXT,
  req2 TEXT,
  req3 TEXT,
  provenance TEXT,
  UNIQUE (company_kind, serial)
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'role_reference_kind_allowed') THEN
    ALTER TABLE role_reference ADD CONSTRAINT role_reference_kind_allowed
      CHECK (company_kind IN ('rifle', 'support'));
  END IF;
END $$;

-- THE PEOPLE LAYER. Written by /api/force-structure/assignments only.
--
-- role_id is UNIQUE: a post holds at most one soldier. That is what lets a swap be a
-- two-row UPDATE rather than a delete-then-insert with an observable empty moment.
CREATE TABLE IF NOT EXISTS role_assignments (
  id SERIAL PRIMARY KEY,
  role_id INTEGER NOT NULL UNIQUE REFERENCES roles(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  personal_number TEXT NOT NULL,
  rank TEXT,
  phone TEXT,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_role_assignments_pn ON role_assignments(personal_number);

-- The 120% bank: soldiers in the company but not on the establishment.
--
-- The source workbooks hold free text here (leave status, pending discharge, and so on),
-- never a date, so the importer fills `note` and leaves `unavailable_until` NULL for
-- later manual entry.
CREATE TABLE IF NOT EXISTS bank_soldiers (
  id SERIAL PRIMARY KEY,
  company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  department TEXT,
  full_name TEXT NOT NULL,
  personal_number TEXT NOT NULL,
  rank TEXT,
  unavailable_until TEXT,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (company_id, personal_number)
);

CREATE INDEX IF NOT EXISTS idx_bank_soldiers_company ON bank_soldiers(company_id);
CREATE INDEX IF NOT EXISTS idx_bank_soldiers_pn ON bank_soldiers(personal_number);

-- Certifications a soldier HOLDS, keyed by personal number and independent of the
-- certifications module. `certification_name` is always the alias-resolved canonical
-- name so that `held` counts mean something; `raw_name` keeps what the source said.
CREATE TABLE IF NOT EXISTS soldier_certifications (
  id SERIAL PRIMARY KEY,
  personal_number TEXT NOT NULL,
  certification_name TEXT NOT NULL,
  raw_name TEXT,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  source TEXT NOT NULL DEFAULT 'manual',
  UNIQUE (personal_number, certification_name)
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'soldier_certs_source_allowed') THEN
    ALTER TABLE soldier_certifications ADD CONSTRAINT soldier_certs_source_allowed
      CHECK (source IN ('manual', 'import', 'certifications_module'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_soldier_certs_pn ON soldier_certifications(personal_number);
CREATE INDEX IF NOT EXISTS idx_soldier_certs_name ON soldier_certifications(certification_name);

-- The drone models (§2.3, §2.6). A configurable reference table rather than a hard-coded
-- TypeScript list, so a tenth model needs no code change.
--
-- These nine come from the reference sheet of the production workbooks, which answers
-- spec §6 q.6 (the original document said nine, the gap list showed eight). Note the gap
-- list also names a model that appears in NO workbook; it is deliberately NOT invented as
-- a tenth entry here — it gets a gap row with no drone_models match, pending a decision.
CREATE TABLE IF NOT EXISTS drone_models (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  sort_order INTEGER NOT NULL DEFAULT 0
);

INSERT INTO drone_models (name, sort_order) VALUES
  ('אווטה', 1),
  ('איבו', 2),
  ('עטלף', 3),
  ('בומרנג', 4),
  ('פולו', 5),
  ('כדור ברזל', 6),
  ('אלפא', 7),
  ('פלייקארט', 8),
  ('חמשוש', 9)
ON CONFLICT (name) DO NOTHING;

-- Name normalization, shared by the importer and the API write path so that a hand-typed
-- entry and an imported row land on the same canonical name.
--
-- kind='quarantine' marks a value that is not a certification at all: the production data
-- has people's names leaked into certification columns. Those are excluded from matching
-- and reported, rather than becoming phantom certifications with a permanent, unclosable
-- gap attached to them.
CREATE TABLE IF NOT EXISTS certification_aliases (
  alias TEXT PRIMARY KEY,
  canonical_name TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'synonym'
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'certification_aliases_kind_allowed') THEN
    ALTER TABLE certification_aliases ADD CONSTRAINT certification_aliases_kind_allowed
      CHECK (kind IN ('typo', 'spelling', 'synonym', 'quarantine'));
  END IF;
END $$;

-- Only unambiguous corrections are seeded here. Genuinely ambiguous values in the source
-- data (a bare weapon name where numbered variants also exist) are deliberately absent:
-- the importer reports them for a human decision instead of guessing.
INSERT INTO certification_aliases (alias, canonical_name, kind) VALUES
  ('אבטה', 'אווטה', 'typo'),
  ('פלייכארט', 'פלייקארט', 'spelling'),
  ('חבלן 01', 'חבלן', 'typo'),
  ('סמ״פ', 'סמ"פ', 'spelling'),
  ('משק תקיפה גדס"ר', 'מש"ק תקיפה', 'synonym'),
  ('קלע', 'קלע 5.56', 'synonym'),
  ('רונן', 'רונן', 'quarantine'),
  ('דויד', 'דויד', 'quarantine')
ON CONFLICT (alias) DO NOTHING;
