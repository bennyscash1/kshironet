-- Administrative (שלישותי) confirmation and required-document tracking.
--
-- Both are SEPARATE TRACKING LAYERS. Invariant §0.3.5: confirming a soldier
-- administratively does NOT mutate roster_entries.status. The roster status says what
-- happened on the course; these tables say what happened in the paperwork afterwards.
-- Collapsing the two would make "passed" mean two different things depending on who is
-- asking, and would let a clerical action rewrite a training outcome.
--
-- Idempotent: the migrate runner re-applies every file on each run.

-- UNIQUE(roster_entry_id) already creates its index — no separate CREATE INDEX here.
CREATE TABLE IF NOT EXISTS roster_admin_confirmations (
  id SERIAL PRIMARY KEY,
  roster_entry_id INTEGER NOT NULL UNIQUE REFERENCES roster_entries(id) ON DELETE CASCADE,
  confirmed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  confirmed_by_role TEXT NOT NULL,
  note TEXT
);

-- Reference data: which documents a certification TYPE requires.
CREATE TABLE IF NOT EXISTS certification_required_documents (
  id SERIAL PRIMARY KEY,
  template_id INTEGER NOT NULL REFERENCES certification_templates(id) ON DELETE CASCADE,
  doc_type TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (template_id, doc_type)
);

CREATE INDEX IF NOT EXISTS idx_cert_req_docs_template
  ON certification_required_documents(template_id);

-- What was actually supplied, per assigned soldier. Drives the `doc` open task (§1.10).
CREATE TABLE IF NOT EXISTS roster_required_documents (
  id SERIAL PRIMARY KEY,
  roster_entry_id INTEGER NOT NULL REFERENCES roster_entries(id) ON DELETE CASCADE,
  doc_type TEXT NOT NULL,
  is_provided SMALLINT NOT NULL DEFAULT 0,
  provided_at TEXT,
  note TEXT,
  UNIQUE (roster_entry_id, doc_type)
);

CREATE INDEX IF NOT EXISTS idx_roster_req_docs_entry
  ON roster_required_documents(roster_entry_id);

-- Spec §3.2 / resolved question 4: prerequisites may be defined at the certification
-- TYPE level, not only on a single cycle. Reuse the existing table rather than adding a
-- second one — a nullable template_id, so every existing per-certification row keeps
-- working untouched.
ALTER TABLE certification_prerequisites
  ADD COLUMN IF NOT EXISTS template_id INTEGER REFERENCES certification_templates(id) ON DELETE CASCADE;

ALTER TABLE certification_prerequisites ALTER COLUMN certification_id DROP NOT NULL;

-- A prerequisite must belong to something: either one cycle or one type.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'cert_prereq_parent_present') THEN
    ALTER TABLE certification_prerequisites ADD CONSTRAINT cert_prereq_parent_present
      CHECK (certification_id IS NOT NULL OR template_id IS NOT NULL);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_cert_prereq_template
  ON certification_prerequisites(template_id);
