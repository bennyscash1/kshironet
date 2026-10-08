import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { lockDatabaseForTest } from "../helpers/db-lock";
import { testClientConfig, testDatabaseUrl } from "../helpers/test-db";

/**
 * `getBattalionByCode` resolves within a brigade, and cannot reach past it.
 *
 * The regression this exists for, measured before the change: with two brigades each
 * holding a battalion coded '5030', `SELECT * FROM battalions WHERE code = $1` returned
 * TWO rows and `queryOne` took whichever the planner emitted first. Since migration 026 a
 * code is unique only within a brigade — `UNIQUE (brigade_id, code)` — so an unscoped
 * lookup has no single correct answer.
 *
 * The suite asserts the SQL the repository runs, against the isolated local test database.
 * tests/helpers/test-db.ts refuses any non-loopback host, so this cannot touch production.
 */

const CONNECTION = testDatabaseUrl();
const hasDatabase = Boolean(CONNECTION);

/** Exactly the predicate in lib/db/repositories/battalions.ts::getBattalionByCode. */
const SCOPED_SQL = "SELECT * FROM battalions WHERE brigade_id = $1 AND code = $2";

describe.skipIf(!hasDatabase)("getBattalionByCode is brigade-scoped", () => {
  let client: Client;
  let brigadeA: number;
  let brigadeB: number;

  beforeAll(async () => {
    client = new Client(testClientConfig(CONNECTION!));
    await client.connect();
    await client.query("BEGIN");
    await lockDatabaseForTest(client);

    await client.query("DELETE FROM battalions");
    await client.query("DELETE FROM brigades");
    const a = await client.query("INSERT INTO brigades (name) VALUES ($1) RETURNING id", [
      "__t__ brigade A",
    ]);
    const b = await client.query("INSERT INTO brigades (name) VALUES ($1) RETURNING id", [
      "__t__ brigade B",
    ]);
    brigadeA = a.rows[0].id;
    brigadeB = b.rows[0].id;

    // The same code in both brigades — legal since 026, and the case that made the old
    // unscoped lookup ambiguous.
    //
    // Since migration 029 an ACTIVE code is unique army-wide, so B's copy is INACTIVE —
    // the only legal way for the same code to exist in two brigades. That does not weaken
    // the test: getBattalionByCode deliberately does not filter on is_active, so both rows
    // are resolvable and the ambiguity being tested is unchanged.
    for (const [brigade, name, active] of [
      [brigadeA, "גדוד 5030 של A", 1],
      [brigadeB, "גדוד 5030 של B", 0],
    ] as const) {
      await client.query(
        "INSERT INTO battalions (brigade_id, code, name, color_hex, is_active) VALUES ($1,'5030',$2,'#64748B',$3)",
        [brigade, name, active]
      );
    }
    // A code that exists ONLY in A, for the cross-brigade case.
    await client.query(
      "INSERT INTO battalions (brigade_id, code, name, color_hex, is_active) VALUES ($1,'only-a','גדוד רק ב-A','#64748B',1)",
      [brigadeA]
    );
  });

  afterAll(async () => {
    if (!client) return;
    await client.query("ROLLBACK");
    await client.end();
  });

  const lookup = async (brigadeId: number, code: string) =>
    (await client.query(SCOPED_SQL, [brigadeId, code])).rows;

  // 4.1 — a battalion in A is not resolvable while B is active.
  it("does not resolve brigade A's battalion while brigade B is active", async () => {
    expect(await lookup(brigadeB, "only-a")).toHaveLength(0);
    expect(await lookup(brigadeA, "only-a")).toHaveLength(1);
  });

  it("resolves the shared code to the ACTIVE brigade's row, never the other's", async () => {
    const inA = await lookup(brigadeA, "5030");
    const inB = await lookup(brigadeB, "5030");

    expect(inA).toHaveLength(1);
    expect(inB).toHaveLength(1);
    expect(inA[0].name).toBe("גדוד 5030 של A");
    expect(inB[0].name).toBe("גדוד 5030 של B");
    expect(inA[0].id).not.toBe(inB[0].id);
  });

  /**
   * 4.2 — not-found and wrong-brigade must be externally identical.
   *
   * At this layer that means literally the same result: zero rows, so the caller has
   * nothing to distinguish them by and cannot leak that the battalion exists elsewhere.
   * The callers turn both into the same `notFound()` / redirect.
   */
  it("returns the same empty result for a wrong-brigade code and a non-existent one", async () => {
    const wrongBrigade = await lookup(brigadeB, "only-a");
    const neverExisted = await lookup(brigadeB, "no-such-code-at-all");

    expect(wrongBrigade).toEqual(neverExisted);
    expect(wrongBrigade).toHaveLength(0);
  });

  // The old behaviour, asserted so the regression is visible rather than described.
  it("the unscoped predicate it replaced was genuinely ambiguous", async () => {
    const unscoped = await client.query("SELECT * FROM battalions WHERE code = $1", ["5030"]);
    expect(unscoped.rows.length).toBe(2);
    // queryOne would have taken rows[0] — an arbitrary brigade.
    expect([brigadeA, brigadeB]).toContain(unscoped.rows[0].brigade_id);
  });

  // 4.3 — with no brigade there is no lookup to make. The callers never reach the query:
  // they redirect or 403 on a null brigade rather than passing a placeholder.
  it("has no brigade value that would match every brigade", async () => {
    // Guards against a caller ever passing 0 / -1 / NULL as a stand-in for "any brigade".
    for (const sentinel of [0, -1]) {
      expect(await lookup(sentinel, "5030")).toHaveLength(0);
    }
    const nullBrigade = await client.query(SCOPED_SQL, [null, "5030"]);
    expect(nullBrigade.rows).toHaveLength(0);
  });
});
