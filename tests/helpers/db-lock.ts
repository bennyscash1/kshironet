import type { Client } from "pg";

/**
 * Serialises the database-backed suites against each other.
 *
 * Several of them need to control GLOBAL state rather than just their own fixtures — the
 * guard in migration 027 is conditioned on
 * `count(*) FROM brigades WHERE is_active = 1`, so "how many brigades exist" is the thing
 * under test and cannot be scoped to a tagged subset. Others apply a migration file, which
 * takes ACCESS EXCLUSIVE locks.
 *
 * Run in parallel they deadlock: one suite holds uncommitted `brigades` rows while
 * another's `DELETE FROM brigades` waits for them, and the `beforeAll` hook times out.
 *
 * A transaction-scoped advisory lock makes them queue instead. It is released
 * automatically on COMMIT or ROLLBACK, so a suite that throws cannot wedge the next one —
 * which a table lock or a flag row could. This keeps `fileParallelism` on for the ~24
 * pure unit suites, which is where the wall-clock actually is.
 *
 * Call it as the FIRST statement after BEGIN, before touching any shared table.
 */
const KEY = 728_115; // arbitrary, shared by every suite that needs exclusivity

export async function lockDatabaseForTest(client: Client): Promise<void> {
  await client.query("SELECT pg_advisory_xact_lock($1)", [KEY]);
}
