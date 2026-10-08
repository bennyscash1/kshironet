-- Invert the isolation guard. Phase 2 / Step 1, slice 1E.
--
-- 025 blocked the SECOND BRIGADE, because nothing was brigade-scoped. 026 scoped
-- battalions (`brigade_id NOT NULL`, `UNIQUE (brigade_id, code)`, FK ON DELETE RESTRICT),
-- so brigades and battalions are genuinely isolated now and a second brigade is
-- legitimate. This file therefore removes that block and puts the block where the real
-- exposure is: entities that still have no `brigade_id` at all.
--
-- WHY THIS IS NOT THEORETICAL
-- Measured on this database with 2 brigades, 3 battalions and every domain table empty:
-- inserting ONE `certification_gap_rows` row produced 3 rows in `v_certification_gaps`
-- spanning BOTH brigades. `v_certification_gaps` does `CROSS JOIN battalions` with no
-- brigade predicate, so a single unscoped row is enough to merge two brigades' numbers,
-- silently, with no error anywhere. That is the failure this guard prevents.
--
-- WHAT IS BLOCKED, AND WHY ONLY THESE
-- Six tables, all of which are root entities that reach no brigade by any path:
--   certifications, certification_templates, certification_gap_rows,
--   trainings, influencing_factors, soldier_certifications
--
-- Deliberately NOT blocked, with reasons:
--   * Tables that reach a brigade through `battalion_id` (companies, roster_entries,
--     battalion_requests, quotas, gap values/keys/snapshots, training_sessions,
--     org_unit_manual_counts, roles, role_assignments, bank_soldiers, ...). Their parent
--     determines the brigade unambiguously, so there is nothing to protect against and
--     blocking them would stop correct work.
--   * Child tables of the blocked entities (certification_prerequisites,
--     certification_taxes, certification_files, certification_required_documents).
--     `replacePrerequisites` and `replaceTaxes` in lib/db/repositories/certifications.ts
--     are implemented as DELETE + INSERT, so EDITING an existing certification is a set of
--     inserts. Blocking those would block operating on existing rows, which this slice
--     explicitly permits. Blocking the parent is sufficient: no new certification can
--     exist to hang them off.
--   * notifications and status_history. Both are side effects written inside other
--     transactions — `ensureUser` raises a notification for a new signup, every roster and
--     certification status change records history. Blocking them would break signup and
--     every scoped status transition.
--   * course_colors, pivot_report_widgets, role_reference and the migration-seeded
--     reference tables. These are shared between brigades rather than merged into wrong
--     numbers; the consequence is documented in docs/MULTI_BRIGADE.md as a known state.
--
-- THE CONDITION IS DERIVED, NOT STORED
-- The block is active when (more than one ACTIVE brigade exists) AND
-- (multi_brigade_isolation_ready is off). No second settings key: a derived condition
-- cannot drift out of step with reality, and `multi_brigade_isolation_ready` keeps its
-- single meaning as the thing migration 034 flips after the §4.6 checklist passes.
--
-- Consequences that follow from the condition, both intentional:
--   * With ONE active brigade everything is writable exactly as before. Single-brigade
--     operation does not regress.
--   * DEACTIVATING the second brigade lifts the block, because the count is of ACTIVE
--     brigades. That is the intended escape hatch, and it is reversible.

-- ---------------------------------------------------------------------------
-- 1. Remove the 025 single-brigade block.
-- ---------------------------------------------------------------------------
-- A second brigade is legitimate now. Dropped rather than left inert so nothing later
-- assumes it is still there — migration 028 onwards must not rely on it.
DROP TRIGGER IF EXISTS trg_brigades_single_until_ready ON brigades;
DROP FUNCTION IF EXISTS brigades_single_until_isolation_ready();

-- ---------------------------------------------------------------------------
-- 2. The guard.
-- ---------------------------------------------------------------------------
-- Same shape as gap_keys_establishment_is_locked() in 015_gap_requirement_keys.sql: a
-- BEFORE trigger reading a setting, with COALESCE(..., '0') so that a missing or
-- unreadable setting means "not ready" rather than "go ahead".
--
-- Raised with a custom SQLSTATE and the table name attached, so the application can
-- recognise this exact condition and name the blocked entity in Hebrew without parsing
-- message text or leaking SQL. `USING TABLE = ...` surfaces as `err.table` in node-pg.
CREATE OR REPLACE FUNCTION unscoped_entity_write_is_blocked() RETURNS trigger AS $$
DECLARE
  ready         TEXT;
  active_count  BIGINT;
BEGIN
  SELECT value INTO ready FROM system_settings WHERE key = 'multi_brigade_isolation_ready';
  IF COALESCE(ready, '0') = '1' THEN
    RETURN NEW;
  END IF;

  SELECT count(*) INTO active_count FROM brigades WHERE is_active = 1;
  IF active_count <= 1 THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION
    '%: cannot create rows in a table with no brigade_id while % active brigades exist and multi_brigade_isolation_ready is off',
    TG_TABLE_NAME, active_count
    USING ERRCODE = 'KS002', TABLE = TG_TABLE_NAME;
END $$ LANGUAGE plpgsql;

-- BEFORE INSERT only. UPDATE and DELETE stay permitted: the block is on creating new
-- unscoped rows, never on operating on rows that already exist.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'certifications',
    'certification_templates',
    'certification_gap_rows',
    'trainings',
    'influencing_factors',
    'soldier_certifications'
  ] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_%s_unscoped_guard ON public.%I', t, t);
    EXECUTE format(
      'CREATE TRIGGER trg_%s_unscoped_guard BEFORE INSERT ON public.%I '
      'FOR EACH ROW EXECUTE FUNCTION unscoped_entity_write_is_blocked()', t, t);
  END LOOP;
END $$;
