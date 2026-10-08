import { config } from "dotenv";
import { lockDatabaseForTest } from "../helpers/db-lock";
import { testClientConfig, testDatabaseUrl } from "../helpers/test-db";
import fs from "node:fs";
import path from "node:path";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { brigadeWriteFailure } from "@/lib/brigades/errors";

config({ path: ".env.local" });

/**
 * Constraints on the `brigades` table itself, against a real database.
 *
 * This file originally tested 025's single-brigade block. Migration 027 removed that
 * block — 026 scoped battalions, so a second brigade is legitimate — and moved the
 * refusal to entities that still have no `brigade_id`. Those live in
 * tests/admin/unscoped-entity-guard.test.ts.
 *
 * What remains here is what is still true of `brigades`: unique non-blank names, more than
 * one brigade allowed regardless of the isolation flag, and deactivation instead of
 * deletion.
 *
 * Everything runs inside one transaction that is ROLLED BACK in afterAll, so the suite
 * writes nothing durable. It self-skips when no connection string is configured, following
 * tests/db/status-parity.test.ts.
 */

// LOCAL test database only. testDatabaseUrl() throws rather than skips if
// TEST_DATABASE_URL points anywhere non-loopback — see tests/helpers/test-db.ts.
const CONNECTION = testDatabaseUrl();
const hasDatabase = Boolean(CONNECTION);
const SETTING = "multi_brigade_isolation_ready";

let client: Client;

describe.skipIf(!hasDatabase)("brigade constraints after 027 inverted the guard", () => {
  beforeAll(async () => {
    client = new Client(testClientConfig(CONNECTION!));
    await client.connect();
    await client.query("BEGIN");
    // Queue behind any other database-backed suite — see tests/helpers/db-lock.ts
    await lockDatabaseForTest(client);
    // A known starting point regardless of what the database already holds.
    //
    // Battalions first: since migration 026 they carry brigade_id with
    // `ON DELETE RESTRICT`, so deleting brigades while any battalion references one is
    // refused — which is the constraint working, not a problem to route around.
    await client.query("DELETE FROM battalions");
    await client.query("DELETE FROM brigades");
    await client.query("UPDATE system_settings SET value = '0' WHERE key = $1", [SETTING]);
  });

  afterAll(async () => {
    if (!client) return;
    await client.query("ROLLBACK");
    await client.end();
  });

  /** Runs `fn` and returns the SQLSTATE it failed with, or null when it succeeded. */
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

  const insert = (name: string) => () =>
    client.query("INSERT INTO brigades (name) VALUES ($1)", [name]);

  const setReady = (value: "0" | "1") =>
    client.query("UPDATE system_settings SET value = $2 WHERE key = $1", [SETTING, value]);

  it("allows the first brigade", async () => {
    expect(await sqlStateOf(insert("228-אלון"))).toBeNull();
    const { rows } = await client.query("SELECT count(*)::int AS n FROM brigades");
    expect(rows[0].n).toBe(1);
  });

  /**
   * Migration 027 REMOVED the single-brigade block that 025 installed.
   *
   * It was the right guard while nothing was brigade-scoped, but 026 scoped battalions
   * (brigade_id NOT NULL, UNIQUE (brigade_id, code)), so a second brigade is legitimate.
   * What is blocked now is creating entities that still have no brigade_id — see
   * tests/admin/unscoped-entity-guard.test.ts.
   */
  it("allows a second brigade, because 027 removed the single-brigade block", async () => {
    expect(await sqlStateOf(insert("300-שקד"))).toBeNull();
    const { rows } = await client.query("SELECT count(*)::int AS n FROM brigades");
    expect(rows[0].n).toBe(2);
  });

  // The KS001 mapping stays in the codebase for as long as any database might still carry
  // 025's trigger, so the translation is still asserted even though nothing raises it now.
  it("still translates KS001 to Hebrew if an older database raises it", () => {
    const failure = brigadeWriteFailure({ code: "KS001" });
    expect(failure?.message).toContain("בידוד הנתונים");
    expect(failure?.message).not.toMatch(/brigades|ERROR|relation/);
  });

  it("does not block brigades even when the setting row is missing entirely", async () => {
    await client.query("DELETE FROM system_settings WHERE key = $1", [SETTING]);
    // The setting no longer gates brigade creation at all; it gates unscoped ENTITIES.
    expect(await sqlStateOf(insert("400-אלה"))).toBeNull();
    await client.query(
      "INSERT INTO system_settings (key, value) VALUES ($1, '0') ON CONFLICT (key) DO UPDATE SET value = '0'",
      [SETTING]
    );
  });

  it("refuses a duplicate name", async () => {
    await setReady("1");
    expect(await sqlStateOf(insert("228-אלון"))).toBe("23505");
    await setReady("0");
  });

  it("refuses a blank name", async () => {
    await setReady("1");
    for (const blank of ["", "   ", "\t\n"]) {
      expect(await sqlStateOf(insert(blank))).toBe("23514");
    }
    await setReady("0");
  });

  it("allows further brigades regardless of the isolation flag", async () => {
    await setReady("1");
    expect(await sqlStateOf(insert("500-ארז"))).toBeNull();
    await setReady("0");
    expect(await sqlStateOf(insert("600-תמר"))).toBeNull();
  });

  // Deactivation is the only removal path; nothing in this slice deletes a brigade.
  it("deactivates without deleting", async () => {
    await client.query("UPDATE brigades SET is_active = 0 WHERE name = $1", ["228-אלון"]);
    const { rows } = await client.query(
      "SELECT is_active FROM brigades WHERE name = $1",
      ["228-אלון"]
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].is_active).toBe(0);
  });
});

describe.skipIf(!hasDatabase)("025_brigades.sql idempotency", () => {
  // The runner re-applies every migration on every run, so applying this file twice must
  // be a no-op the second time.
  it("applies twice in a row without error", async () => {
    const sql = fs.readFileSync(
      path.join(process.cwd(), "migrations", "postgres", "025_brigades.sql"),
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
});
