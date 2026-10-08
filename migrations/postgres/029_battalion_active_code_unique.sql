-- An ACTIVE battalion number is unique across the whole army, not just within a brigade.
--
-- 026 gave battalions `UNIQUE (brigade_id, code)`, which is strictly weaker: it lets
-- brigade 226 and brigade 228 each hold a battalion 9308. Real IDF battalion numbers are
-- army-wide, so that state is not merely untidy — it is impossible in the domain, and the
-- schema should say so.
--
-- WHY PARTIAL, ON is_active = 1
-- Only ACTIVE battalions compete for a number. A battalion that is deactivated in one
-- brigade must be re-creatable in another with the same code, and two archived battalions
-- may perfectly well share a historical number. Restricting the index to active rows is
-- what keeps deactivate-then-recreate working.
--
-- `is_active` is SMALLINT 0/1 here, not a boolean — the convention `battalions` established
-- in 001_init.sql and the reason the predicate reads `= 1` rather than `IS TRUE`.
--
-- The existing UNIQUE (brigade_id, code) is deliberately LEFT IN PLACE. This index is
-- additive: the per-brigade constraint still gives the clearer error for the common case
-- ("you already have a 9308"), while this one catches the cross-brigade case.

-- Refuse loudly, and explain, rather than letting CREATE UNIQUE INDEX fail with a bare
-- "could not create unique index" that names no rows. Nothing here deletes or deactivates
-- anything to force the index through: duplicate active codes are a data question for a
-- person, not something a migration may resolve on its own.
DO $$
DECLARE
  offenders TEXT;
BEGIN
  SELECT string_agg(format('code %L in brigades %s', code, brigades), '; ')
    INTO offenders
    FROM (
      SELECT code, string_agg(brigade_id::text, ',' ORDER BY brigade_id) AS brigades
        FROM battalions
       WHERE is_active = 1
       GROUP BY code
      HAVING count(*) > 1
    ) dupes;

  IF offenders IS NOT NULL THEN
    RAISE EXCEPTION
      'cannot enforce army-wide unique active battalion codes: duplicates already exist (%). Deactivate or renumber one of each pair, then re-run. This migration will not change data to make itself pass.',
      offenders;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS battalions_active_code_unique
  ON battalions (code)
  WHERE is_active = 1;

COMMENT ON INDEX battalions_active_code_unique IS
  'Domain rule: an active IDF battalion number is unique across the entire army, so two ACTIVE battalions may never share a code even in different brigades. Partial on is_active = 1 so deactivated battalions are free to collide and a number can be reused after a battalion is stood down. Additive to battalions_brigade_code_key, which remains and covers the within-brigade case.';
