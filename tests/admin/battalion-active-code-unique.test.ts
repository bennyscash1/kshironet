import fs from "node:fs";
import path from "node:path";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { lockDatabaseForTest } from "../helpers/db-lock";
import { testClientConfig, testDatabaseUrl } from "../helpers/test-db";

/**
 * Migrations 029-031: army-wide unique active battalion codes, and the two sequence resets.
 *
 * T.6 — the whole suite runs against the isolated local test database. `testDatabaseUrl()`
 * inspects the RESOLVED connection and throws if the host is not loopback or the database is
 * not `kshironet_test`, so this cannot reach production even if the environment is
 * misconfigured. That check is exercised directly in battalion-context-guard.test.ts.
 */

const CONNECTION = testDatabaseUrl();
const hasDatabase = Boolean(CONNECTION);
const MIGRATIONS = path.join(process.cwd(), "migrations", "postgres");

describe.skipIf(!hasDatabase)("army-wide unique active battalion codes", () => {
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
      "__t__ A",
    ]);
    const b = await client.query("INSERT INTO brigades (name) VALUES ($1) RETURNING id", [
      "__t__ B",
    ]);
    brigadeA = a.rows[0].id;
    brigadeB = b.rows[0].id;
  });

  afterAll(async () => {
    if (!client) return;
    await client.query("ROLLBACK");
    await client.end();
  });

  const add = (brigadeId: number, code: string, active: 0 | 1) => () =>
    client.query(
      "INSERT INTO battalions (brigade_id, code, name, color_hex, is_active) VALUES ($1,$2,$3,'#64748B',$4)",
      [brigadeId, code, `גדוד ${code}`, active]
    );

  async function attempt(fn: () => Promise<unknown>) {
    await client.query("SAVEPOINT sp");
    try {
      await fn();
      await client.query("RELEASE SAVEPOINT sp");
      return null;
    } catch (err) {
      await client.query("ROLLBACK TO SAVEPOINT sp");
      return err as { code?: string; constraint?: string };
    }
  }

  // T.1 — the whole point: an active number is unique army-wide, not per brigade.
  it("rejects the same code on two ACTIVE battalions in different brigades", async () => {
    expect(await attempt(add(brigadeA, "9308", 1))).toBeNull();

    const err = await attempt(add(brigadeB, "9308", 1));
    expect(err?.code).toBe("23505");
    // The army-wide index, not the per-brigade one — they mean different things and the
    // error handler tells them apart by name.
    expect(err?.constraint).toBe("battalions_active_code_unique");
  });

  // T.2 — deactivate in one brigade, recreate in another. This is why the index is partial.
  it("allows an INACTIVE battalion to share a code with an active one", async () => {
    expect(await attempt(add(brigadeA, "5030", 0))).toBeNull();
    expect(await attempt(add(brigadeB, "5030", 1))).toBeNull();

    const { rows } = await client.query(
      "SELECT count(*)::int AS n FROM battalions WHERE code = '5030'"
    );
    expect(rows[0].n).toBe(2);
  });

  it("allows two INACTIVE battalions to share a code", async () => {
    expect(await attempt(add(brigadeA, "7777", 0))).toBeNull();
    expect(await attempt(add(brigadeB, "7777", 0))).toBeNull();
  });

  // Reactivating into a taken number is the same violation, reached from the update path.
  it("rejects REACTIVATING a battalion whose code is now held by an active one", async () => {
    await client.query("SAVEPOINT reactivate");
    await add(brigadeA, "4242", 0)();
    await add(brigadeB, "4242", 1)();

    const err = await attempt(() =>
      client.query("UPDATE battalions SET is_active = 1 WHERE brigade_id = $1 AND code = '4242'", [
        brigadeA,
      ])
    );
    expect(err?.code).toBe("23505");
    expect(err?.constraint).toBe("battalions_active_code_unique");
    await client.query("ROLLBACK TO SAVEPOINT reactivate");
  });

  // The per-brigade constraint from 026 is additive, not replaced.
  it("still enforces the per-brigade constraint separately", async () => {
    await client.query("SAVEPOINT perbrigade");
    await add(brigadeA, "1111", 0)();
    // Same brigade, same code, both inactive: the army-wide index permits it, the
    // per-brigade one does not.
    const err = await attempt(add(brigadeA, "1111", 0));
    expect(err?.code).toBe("23505");
    expect(err?.constraint).toBe("battalions_brigade_code_key");
    await client.query("ROLLBACK TO SAVEPOINT perbrigade");
  });
});

describe.skipIf(!hasDatabase)("sequence resets (migrations 030 and 031)", () => {
  let client: Client;

  beforeAll(async () => {
    client = new Client(testClientConfig(CONNECTION!));
    await client.connect();
    await client.query("BEGIN");
    await lockDatabaseForTest(client);
  });

  afterAll(async () => {
    if (!client) return;
    await client.query("ROLLBACK");
    await client.end();
  });

  // T.4 — a new battalion gets a low id after the reset.
  it("hands out a low id to a newly inserted battalion", async () => {
    await client.query("DELETE FROM battalions");
    await client.query("DELETE FROM brigades");
    // Push the sequence somewhere absurd, exactly as rolled-back transactions had.
    await client.query("SELECT setval(pg_get_serial_sequence('battalions','id'), 900, true)");

    // The statement migration 030 runs, verbatim.
    await client.query(
      "SELECT setval(pg_get_serial_sequence('battalions','id'), COALESCE((SELECT MAX(id) FROM battalions), 0) + 1, false)"
    );

    const brigade = await client.query(
      "INSERT INTO brigades (name) VALUES ('__t__ seq') RETURNING id"
    );
    const inserted = await client.query(
      "INSERT INTO battalions (brigade_id, code, name, color_hex, is_active) VALUES ($1,'seq-1','x','#64748B',1) RETURNING id",
      [brigade.rows[0].id]
    );
    expect(inserted.rows[0].id).toBe(1);
  });

  /**
   * The property that makes the reset safe to re-run forever: with rows present it can only
   * move the sequence ABOVE every existing id, never onto one. Hardcoding 1 would hand out
   * duplicates on the second run.
   */
  it("cannot hand out a colliding id once rows exist", async () => {
    await client.query("SAVEPOINT rerun");
    const { rows: before } = await client.query(
      "SELECT COALESCE(MAX(id),0)::int AS max FROM battalions"
    );
    await client.query(
      "SELECT setval(pg_get_serial_sequence('battalions','id'), COALESCE((SELECT MAX(id) FROM battalions), 0) + 1, false)"
    );
    const { rows: next } = await client.query(
      "SELECT nextval(pg_get_serial_sequence('battalions','id'))::int AS v"
    );
    expect(next[0].v).toBeGreaterThan(before[0].max);
    await client.query("ROLLBACK TO SAVEPOINT rerun");
  });
});

/**
 * T.5 — the whole migration suite applied twice must leave identical schema and data.
 *
 * Runs OUTSIDE a transaction because DDL in the migration files is not all transactional in
 * a way that survives rollback here, so it takes the advisory lock on its own connection to
 * stay clear of the other database-backed suites.
 */
describe.skipIf(!hasDatabase)("migrations 029-031 are idempotent", () => {
  const files = ["029_battalion_active_code_unique.sql", "030_battalions_sequence_reset.sql", "031_brigade_277_renumber.sql"];

  /** Everything a re-run could plausibly disturb: structure, constraints, indexes, counts. */
  const SNAPSHOT = `
    SELECT jsonb_build_object(
      'columns', (SELECT jsonb_agg(to_jsonb(c) ORDER BY c.table_name, c.ordinal_position)
                    FROM (SELECT table_name, column_name, ordinal_position, data_type,
                                 is_nullable, column_default
                            FROM information_schema.columns
                           WHERE table_schema='public') c),
      'constraints', (SELECT jsonb_agg(jsonb_build_object('t', conrelid::regclass::text,
                                                          'n', conname,
                                                          'd', pg_get_constraintdef(oid))
                                       ORDER BY conrelid::regclass::text, conname)
                        FROM pg_constraint WHERE connamespace='public'::regnamespace),
      'indexes', (SELECT jsonb_agg(jsonb_build_object('n', indexname, 'd', indexdef)
                                   ORDER BY indexname)
                    FROM pg_indexes WHERE schemaname='public'),
      'brigades', (SELECT jsonb_agg(to_jsonb(b) ORDER BY b.id) FROM brigades b),
      'battalions', (SELECT jsonb_agg(to_jsonb(x) ORDER BY x.id) FROM battalions x)
    )::text AS snap`;

  it("leave identical schema and data when applied twice in a row", async () => {
    const c = new Client(testClientConfig(CONNECTION!));
    await c.connect();
    try {
      // Serialise against the transactional suites; released when this connection closes.
      await c.query("SELECT pg_advisory_lock(728115)");

      const apply = async () => {
        for (const f of files) {
          await c.query(fs.readFileSync(path.join(MIGRATIONS, f), "utf8"));
        }
      };

      await apply();
      const first = (await c.query(SNAPSHOT)).rows[0].snap;

      await apply();
      const second = (await c.query(SNAPSHOT)).rows[0].snap;

      expect(second).toEqual(first);
    } finally {
      await c.query("SELECT pg_advisory_unlock(728115)").catch(() => {});
      await c.end();
    }
  });
});
