-- Renumber brigade 277 to 2, and bring the brigades sequence back in line.
--
-- Brigade 226 was created with id 277 purely from sequence churn: rolled-back test
-- transactions consumed 2..276 and Postgres does not return those values. The id is
-- internal, but it is cheap to fix now and impossible to fix later — every row added from
-- here on makes it more expensive.
--
-- ATOMICITY
-- The whole item runs as ONE statement: a single DO block. The migration runner also sends
-- each file as one multi-statement simple query, which Postgres wraps in an implicit
-- transaction, so the file is atomic either way. An explicit BEGIN is deliberately NOT
-- written here — inside the runner's implicit transaction it would emit
-- "there is already a transaction in progress" on every run.
--
-- FOREIGN KEYS, derived from pg_constraint rather than assumed:
--   battalions.brigade_id      -> brigades(id)  ON UPDATE NO ACTION, ON DELETE RESTRICT
--   users.active_brigade_id    -> brigades(id)  ON UPDATE NO ACTION, ON DELETE NO ACTION
-- Neither has ON UPDATE CASCADE and NEITHER IS DEFERRABLE, so `SET CONSTRAINTS ... DEFERRED`
-- is not available — it only works on constraints declared DEFERRABLE, and these are not.
-- Dependent rows therefore have to be moved explicitly, in an order that never leaves a
-- row pointing at a brigade that does not exist.
--
-- `battalions` is the hard case: its brigade_id is NOT NULL, so its rows cannot be parked
-- anywhere while the parent id moves. With no CASCADE, no deferral, and a standing rule
-- against dropping constraints or deleting rows, there is no ordering that moves them. If
-- any exist this migration ABORTS and says so, rather than inventing a way through.
-- `users.active_brigade_id` is nullable, so those rows can be parked and restored.
--
-- public_id is NOT touched. It is the URL-facing identifier and is already in use; only the
-- internal serial id moves.

DO $$
DECLARE
  blocking   BIGINT;
  parked     UUID[];
BEGIN
  -- Idempotency guard. Both conditions are a clean no-op, not an error: after a successful
  -- run there is no brigade 277 and there IS a brigade 2, so every later run stops here.
  IF NOT EXISTS (SELECT 1 FROM brigades WHERE id = 277) THEN
    RAISE NOTICE '031: no brigade with id 277 — nothing to do';
    RETURN;
  END IF;
  IF EXISTS (SELECT 1 FROM brigades WHERE id = 2) THEN
    RAISE NOTICE '031: a brigade with id 2 already exists — refusing to merge, nothing to do';
    RETURN;
  END IF;

  -- battalions.brigade_id is NOT NULL and its FK has no ON UPDATE CASCADE, so its rows
  -- cannot be moved without either dropping the constraint or deleting them. Both are
  -- forbidden, so stop and let a person decide.
  SELECT count(*) INTO blocking FROM battalions WHERE brigade_id = 277;
  IF blocking > 0 THEN
    RAISE EXCEPTION
      '031: % battalion row(s) reference brigade 277. battalions.brigade_id is NOT NULL and battalions_brigade_fk has no ON UPDATE CASCADE and is not deferrable, so they cannot be moved without dropping a constraint or deleting rows — neither of which this migration will do. Renumber manually or leave brigade 277 as it is.',
      blocking;
  END IF;

  -- users.active_brigade_id is nullable: remember who pointed at 277, park them, move the
  -- parent, then restore. Capturing the ids first is what makes the restore exact rather
  -- than "everyone who is currently null".
  SELECT array_agg(id) INTO parked FROM users WHERE active_brigade_id = 277;
  UPDATE users SET active_brigade_id = NULL WHERE active_brigade_id = 277;

  UPDATE brigades SET id = 2 WHERE id = 277;

  IF parked IS NOT NULL THEN
    UPDATE users SET active_brigade_id = 2 WHERE id = ANY(parked);
  END IF;

  RAISE NOTICE '031: brigade 277 renumbered to 2 (% user selection(s) restored)',
    COALESCE(array_length(parked, 1), 0);
END $$;

-- Same reasoning as 030. Resolved via pg_get_serial_sequence rather than hardcoded, and
-- kept separate from the renumber block above on purpose — it is correct whether or not the
-- renumber did anything.
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
  seq        TEXT := pg_get_serial_sequence('brigades', 'id');
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

  SELECT COALESCE(MAX(id), 0) + 1 INTO want_next FROM brigades;

  -- ONLY EVER RAISE. If the sequence is already at or beyond where the data needs it, this
  -- does nothing at all — not even a same-value setval.
  IF want_next > cur_next THEN
    -- is_called = false so the very next row receives exactly `want_next`, with no id
    -- skipped between here and there.
    PERFORM setval(seq, want_next, false);
  END IF;
END $$;
