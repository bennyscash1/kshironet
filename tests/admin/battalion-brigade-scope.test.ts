import { config } from "dotenv";
import { lockDatabaseForTest } from "../helpers/db-lock";
import { testClientConfig, testDatabaseUrl } from "../helpers/test-db";
import fs from "node:fs";
import path from "node:path";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

config({ path: ".env.local" });

/**
 * Battalion brigade-scoping, against a real database.
 *
 * Everything runs inside one transaction that is ROLLED BACK in afterAll, so the suite
 * writes nothing durable. It self-skips when no connection string is configured, following
 * tests/db/status-parity.test.ts.
 *
 * The two assertions that matter most:
 *   - a battalion code may repeat ACROSS brigades but not within one (the whole point of
 *     re-scoping battalions_code_key in 026), and
 *   - the seed script's deactivating sweep cannot reach another brigade's battalions.
 *     That sweep had no brigade predicate before this slice, which made it a silent
 *     cross-tenant data-loss bug the moment a second brigade existed.
 */

// LOCAL test database only. testDatabaseUrl() throws rather than skips if
// TEST_DATABASE_URL points anywhere non-loopback — see tests/helpers/test-db.ts.
const CONNECTION = testDatabaseUrl();
const hasDatabase = Boolean(CONNECTION);
const READY = "multi_brigade_isolation_ready";

let client: Client;
let brigadeA: number;
let brigadeB: number;

describe.skipIf(!hasDatabase)("battalions are scoped to a brigade", () => {
  beforeAll(async () => {
    client = new Client(testClientConfig(CONNECTION!));
    await client.connect();
    await client.query("BEGIN");
    // Queue behind any other database-backed suite — see tests/helpers/db-lock.ts
    await lockDatabaseForTest(client);

    await client.query("DELETE FROM battalions");
    await client.query("DELETE FROM brigades");
    // Two brigades are needed to test cross-brigade behaviour at all, so the 1B guard is
    // lifted for the life of this rolled-back transaction only.
    await client.query("UPDATE system_settings SET value = '1' WHERE key = $1", [READY]);

    const a = await client.query("INSERT INTO brigades (name) VALUES ($1) RETURNING id", [
      "__test__ brigade A",
    ]);
    const b = await client.query("INSERT INTO brigades (name) VALUES ($1) RETURNING id", [
      "__test__ brigade B",
    ]);
    brigadeA = a.rows[0].id;
    brigadeB = b.rows[0].id;
  });

  afterAll(async () => {
    if (!client) return;
    await client.query("ROLLBACK");
    await client.end();
  });

  async function sqlStateOf(fn: () => Promise<unknown>): Promise<string | null> {
    await client.query("SAVEPOINT sp");
    try {
      await fn();
      await client.query("RELEASE SAVEPOINT sp");
      return null;
    } catch (err) {
      await client.query("ROLLBACK TO SAVEPOINT sp");
      return (err as { code?: string }).code ?? "UNKNOWN";
    }
  }

  const insert = (brigadeId: number, code: string, isActive: 0 | 1 = 1) => () =>
    client.query(
      "INSERT INTO battalions (brigade_id, code, name, color_hex, is_active) VALUES ($1,$2,$3,'#64748B',$4)",
      [brigadeId, code, `גדוד ${code}`, isActive]
    );

  /**
   * The same code may exist in two brigades — but since migration 029 only if at most one
   * of them is ACTIVE, because an active IDF battalion number is unique army-wide.
   * `UNIQUE (brigade_id, code)` from 026 is what allows the pair to coexist at all.
   */
  it("allows the same code in two different brigades when one is inactive", async () => {
    expect(await sqlStateOf(insert(brigadeA, "5030", 1))).toBeNull();
    expect(await sqlStateOf(insert(brigadeB, "5030", 0))).toBeNull();

    const { rows } = await client.query(
      "SELECT count(*)::int AS n FROM battalions WHERE code = '5030'"
    );
    expect(rows[0].n).toBe(2);
  });

  it("refuses the same code in two brigades when both are active", async () => {
    await client.query("SAVEPOINT both_active");
    await insert(brigadeA, "7070", 1)();
    expect(await sqlStateOf(insert(brigadeB, "7070", 1))).toBe("23505");
    await client.query("ROLLBACK TO SAVEPOINT both_active");
  });

  it("refuses the same code twice within one brigade", async () => {
    expect(await sqlStateOf(insert(brigadeA, "5030"))).toBe("23505");
  });

  it("refuses a battalion in a brigade that does not exist", async () => {
    expect(await sqlStateOf(insert(999_999, "7777"))).toBe("23503");
  });

  it("refuses a battalion with no brigade at all", async () => {
    expect(
      await sqlStateOf(() =>
        client.query(
          "INSERT INTO battalions (code, name, color_hex, is_active) VALUES ('8888','x','#64748B',1)"
        )
      )
    ).toBe("23502");
  });

  it("refuses to delete a brigade that still has battalions", async () => {
    // ON DELETE RESTRICT: a brigade's data must stay attributable.
    expect(
      await sqlStateOf(() => client.query("DELETE FROM brigades WHERE id = $1", [brigadeA]))
    ).toBe("23503");
  });

  /**
   * The data-loss regression test.
   *
   * This is the exact sweep from scripts/seed.ts. Before this slice it had no
   * `brigade_id = $1` predicate, so running the seed would deactivate every battalion in
   * every OTHER brigade — silently, because deactivation is a flag rather than a delete.
   */
  it("scopes the seed's deactivating sweep to one brigade", async () => {
    await client.query("SAVEPOINT sweep");
    // A battalion in each brigade that the seed list does not mention.
    await insert(brigadeA, "old-a")();
    await insert(brigadeB, "old-b")();

    await client.query(
      `UPDATE battalions SET is_active = 0
        WHERE brigade_id = $1 AND code NOT IN ('5030','8207','9308','6228','gdsm','hq')`,
      [brigadeA]
    );

    const a = await client.query(
      "SELECT is_active FROM battalions WHERE brigade_id = $1 AND code = 'old-a'",
      [brigadeA]
    );
    const b = await client.query(
      "SELECT is_active FROM battalions WHERE brigade_id = $1 AND code = 'old-b'",
      [brigadeB]
    );

    expect(a.rows[0].is_active).toBe(0); // the target brigade's stale battalion: deactivated
    expect(b.rows[0].is_active).toBe(1); // the other brigade's: untouched
    await client.query("ROLLBACK TO SAVEPOINT sweep");
  });
});

describe.skipIf(!hasDatabase)("026_battalion_brigade_scope.sql idempotency", () => {
  it("applies twice in a row without error", async () => {
    const sql = fs.readFileSync(
      path.join(process.cwd(), "migrations", "postgres", "026_battalion_brigade_scope.sql"),
      "utf8"
    );
    const c = new Client(testClientConfig(CONNECTION!));
    await c.connect();
    try {
      await c.query("BEGIN");
      // Queue behind any other database-backed suite — see tests/helpers/db-lock.ts
      await lockDatabaseForTest(c);
      await c.query(sql);
      await c.query(sql);
      await c.query("ROLLBACK");
    } finally {
      await c.end();
    }
  });

  // The adopt block must refuse rather than guess when it cannot tell which brigade
  // unscoped battalions belong to. A row silently adopted into the wrong tenant is
  // unrecoverable once brigade_id is NOT NULL.
  it("refuses to guess when several brigades exist and a battalion is unscoped", async () => {
    const c = new Client(testClientConfig(CONNECTION!));
    await c.connect();
    try {
      await c.query("BEGIN");
      // Queue behind any other database-backed suite — see tests/helpers/db-lock.ts
      await lockDatabaseForTest(c);
      await c.query("UPDATE system_settings SET value = '1' WHERE key = $1", [READY]);
      // TWO brigades, created here rather than assumed.
      //
      // This previously inserted a single brigade called "__test__ second", which only
      // produced the ambiguity because the database it ran against already held one. On a
      // clean database it left exactly one brigade, the migration adopted into it as
      // designed, and the test failed. The assumption was invisible until the suite stopped
      // running against the live database — the same class of ambient-data dependency that
      // makes tests/db/status-parity.test.ts skip rather than pass when empty.
      await c.query("DELETE FROM battalions");
      await c.query("DELETE FROM brigades");
      await c.query(
        "INSERT INTO brigades (name) VALUES ('__test__ ambiguous A'), ('__test__ ambiguous B')"
      );
      // Simulate a database mid-migration: the column exists but a row is unscoped.
      await c.query("ALTER TABLE battalions ALTER COLUMN brigade_id DROP NOT NULL");
      await c.query(
        "INSERT INTO battalions (code, name, color_hex, is_active) VALUES ('__t__','x','#64748B',1)"
      );

      const sql = fs.readFileSync(
        path.join(process.cwd(), "migrations", "postgres", "026_battalion_brigade_scope.sql"),
        "utf8"
      );
      await expect(c.query(sql)).rejects.toThrow(/refusing to guess/);
    } finally {
      // The failed statement aborts the transaction; ROLLBACK is still valid and undoes
      // the DROP NOT NULL along with everything else.
      await c.query("ROLLBACK").catch(() => {});
      await c.end();
    }
  });
});
