-- Bring the battalions id sequence back in line with the table.
--
-- `battalions_id_seq` sits far ahead of the data (last_value 205 against an empty table)
-- because earlier seeding, deletion and rolled-back test transactions all consumed values —
-- Postgres does not return a sequence value when a transaction rolls back. The next
-- battalion would otherwise be created as id 206.
--
-- WHY THIS IS SAFE TO RE-RUN FOREVER
-- The runner re-applies every migration on every run, so this file will execute again long
-- after real battalions exist. The target is computed FROM THE TABLE — MAX(id) + 1 — rather
-- than hardcoded, and is then clamped so the sequence can only ever be RAISED. With rows
-- present it does nothing unless the sequence has fallen behind the data.
--
-- Hardcoding 1 would be correct exactly once and would hand out duplicate ids on every run
-- after that. Computing MAX(id) + 1 WITHOUT the clamp was correct until rows were deleted,
-- at which point it began recycling ids — see the rule below.
--
-- `is_called = false` means the NEXT nextval() returns the value set, not the one after it,
-- so an empty table yields id 1 rather than id 2. Verified: with the sequence already at
-- last_value=1/is_called=false and an empty table, this leaves it untouched.
--
-- The sequence name is resolved with pg_get_serial_sequence rather than written literally,
-- so this keeps working if the column is ever redefined and the sequence renamed.
--
-- No battalion row is deleted, truncated or renumbered here. Only the sequence moves.

-- THIS RESET MAY ONLY RAISE THE SEQUENCE, NEVER LOWER IT.
--
-- The runner has no ledger and re-applies every migration on every run, so this statement
-- executes again on every future migrate — long after real rows exist. The original form,
--   setval(seq, COALESCE(MAX(id),0) + 1, false)
-- recomputed unconditionally, which meant that after rows were DELETED it would move the
-- sequence back DOWN and start recycling primary keys.
--
-- Recycling ids is not merely untidy here. Six audit columns store the actor as the text
-- `battalion:<id>` with no foreign key (certifications.created_by_role,
-- notifications.target_role, status_history.changed_by_role, gap_nominations.created_by_role,
-- roster_admin_confirmations.confirmed_by_role, force_structure_edit_snapshots.created_by_role).
-- A reissued id silently attaches a deleted entity's audit history to a new one, and nothing
-- in the schema would flag it.
--
DO $$
DECLARE
  seq        TEXT := pg_get_serial_sequence('battalions', 'id');
  cur_last   BIGINT;
  cur_called BOOLEAN;
  cur_next   BIGINT;
  want_next  BIGINT;
BEGIN
  -- Read last_value AND is_called straight off the sequence relation.
  --
  -- It has to be both, and it has to be this source. `pg_sequences` and
  -- pg_sequence_last_value() expose last_value but NOT is_called, and without is_called the
  -- next value cannot be derived: last_value = 1 means "the next row gets 1" when is_called
  -- is false, and "the next row gets 2" when it is true. Guessing the wrong one either skips
  -- an id or hands out a duplicate. currval() is not an option either — it throws unless
  -- nextval has already been called in this very session, which it has not.
  EXECUTE format('SELECT last_value, is_called FROM %s', seq) INTO cur_last, cur_called;
  cur_next := cur_last + CASE WHEN cur_called THEN 1 ELSE 0 END;

  SELECT COALESCE(MAX(id), 0) + 1 INTO want_next FROM battalions;

  -- ONLY EVER RAISE. If the sequence is already at or beyond where the data needs it, this
  -- does nothing at all — not even a same-value setval.
  IF want_next > cur_next THEN
    -- is_called = false so the very next row receives exactly `want_next`, with no id
    -- skipped between here and there.
    PERFORM setval(seq, want_next, false);
  END IF;
END $$;
