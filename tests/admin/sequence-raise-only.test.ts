import fs from "node:fs";
import path from "node:path";
import { Client } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { testClientConfig, testDatabaseUrl } from "../helpers/test-db";

/**
 * Migrations 030 and 031 may only RAISE a sequence, never lower it.
 *
 * The runner has no ledger and re-applies every file on every run. The original
 * `setval(seq, MAX(id) + 1, false)` recomputed unconditionally, so after rows were DELETED
 * it moved the sequence back down and began recycling primary keys — and six audit columns
 * store the actor as the text `battalion:<id>` with no foreign key, so a reissued id
 * silently attaches a deleted entity's history to a new one.
 *
 * 2.6 — this suite runs against the isolated local test database only. `testDatabaseUrl()`
 * inspects the RESOLVED connection and throws if the host is not loopback or the database is
 * not `kshironet_test`, aborting before anything opens. These tests are destructive
 * (they insert and delete rows and move sequences), so that guard is load-bearing here.
 *
 * NOTE ON TRANSACTIONS: unlike every other database-backed suite, this one does NOT wrap its
 * work in a rolled-back transaction. `setval` is non-transactional in Postgres — a sequence
 * change survives ROLLBACK — so a transaction would give false isolation. It takes the
 * advisory lock and cleans up explicitly instead.
 */

const CONNECTION = testDatabaseUrl();
const hasDatabase = Boolean(CONNECTION);
const MIGRATIONS = path.join(process.cwd(), "migrations", "postgres");

/**
 * The only two migration files that touch a sequence — verified by grepping the whole
 * migration set for setval / nextval / ALTER SEQUENCE. Re-running just these is therefore
 * equivalent to re-running the full suite as far as sequences are concerned, and keeps each
 * test inside the default timeout.
 */
const SEQUENCE_MIGRATIONS = [
  "030_battalions_sequence_reset.sql",
  "031_brigade_277_renumber.sql",
];

const ALL_MIGRATIONS = () =>
  fs.readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql")).sort();

interface SeqState {
  last_value: string;
  is_called: boolean;
}

describe.skipIf(!hasDatabase)("sequence resets only ever raise", () => {
  let c: Client;

  const apply = async (files: string[]) => {
    for (const f of files) {
      await c.query(fs.readFileSync(path.join(MIGRATIONS, f), "utf8"));
    }
  };

  const seq = async (table: string): Promise<SeqState> => {
    const { rows } = await c.query(
      `SELECT last_value, is_called FROM ${table}_id_seq`
    );
    return rows[0];
  };

  /** What the NEXT inserted row would receive, from last_value and is_called together. */
  const nextId = async (table: string): Promise<number> => {
    const s = await seq(table);
    return Number(s.last_value) + (s.is_called ? 1 : 0);
  };

  const addBrigade = async (name: string): Promise<number> =>
    (await c.query("INSERT INTO brigades (name) VALUES ($1) RETURNING id", [name])).rows[0].id;

  const addBattalion = async (brigadeId: number, code: string): Promise<number> =>
    (
      await c.query(
        "INSERT INTO battalions (brigade_id, code, name, color_hex, is_active) VALUES ($1,$2,'x','#64748B',1) RETURNING id",
        [brigadeId, code]
      )
    ).rows[0].id;

  beforeAll(async () => {
    c = new Client(testClientConfig(CONNECTION!));
    await c.connect();
    await c.query("SELECT pg_advisory_lock(728115)");
  });

  afterAll(async () => {
    if (!c) return;
    await c.query("SELECT pg_advisory_unlock(728115)").catch(() => {});
    await c.end();
  });

  /** A clean slate that mirrors the real database's current state. */
  beforeEach(async () => {
    await c.query("DELETE FROM battalions");
    await c.query("UPDATE users SET active_brigade_id = NULL");
    await c.query("DELETE FROM brigades");
    await c.query("SELECT setval(pg_get_serial_sequence('battalions','id'), 1, false)");
    await c.query("SELECT setval(pg_get_serial_sequence('brigades','id'), 1, false)");
  });

  // 2.1 — the fix must not disturb what already landed.
  it("leaves an already-correct empty state exactly as it is", async () => {
    // Reproduce production: battalions empty at 1/false, brigades holding 2 rows at 3/false.
    await c.query("INSERT INTO brigades (id, name) VALUES (1, '__t__ 228'), (2, '__t__ 226')");
    await c.query("SELECT setval(pg_get_serial_sequence('brigades','id'), 3, false)");

    const battalionsBefore = await seq("battalions");
    const brigadesBefore = await seq("brigades");

    await apply(SEQUENCE_MIGRATIONS);

    expect(await seq("battalions")).toEqual(battalionsBefore);
    expect(await seq("brigades")).toEqual(brigadesBefore);
    // Spelled out, because these are the values observed on the real database.
    expect(await seq("battalions")).toEqual({ last_value: "1", is_called: false });
    expect(await seq("brigades")).toEqual({ last_value: "3", is_called: false });
  });

  // 2.2 — the bug itself: a deleted id must never be handed out again.
  it("does not recycle a battalion id after the highest row is deleted", async () => {
    const brigade = await addBrigade("__t__ b");
    const ids: number[] = [];
    for (const code of ["a", "b", "c"]) ids.push(await addBattalion(brigade, code));
    const highest = Math.max(...ids);

    await c.query("DELETE FROM battalions WHERE id = $1", [highest]);
    await apply(SEQUENCE_MIGRATIONS);

    const reused = await addBattalion(brigade, "d");
    expect(reused).not.toBe(highest);
    expect(reused).toBeGreaterThan(highest);
  });

  // 2.3 — and the fix must not overshoot either.
  it("introduces no gap when nothing was deleted", async () => {
    const brigade = await addBrigade("__t__ b");
    const first = await addBattalion(brigade, "a");
    const second = await addBattalion(brigade, "b");
    expect(second).toBe(first + 1);

    await apply(SEQUENCE_MIGRATIONS);

    const third = await addBattalion(brigade, "c");
    expect(third).toBe(second + 1);
  });

  // 2.4 — brigades, both directions.
  it("does not recycle a brigade id after the highest row is deleted", async () => {
    const ids = [
      await addBrigade("__t__ 1"),
      await addBrigade("__t__ 2"),
      await addBrigade("__t__ 3"),
    ];
    const highest = Math.max(...ids);

    await c.query("DELETE FROM brigades WHERE id = $1", [highest]);
    await apply(SEQUENCE_MIGRATIONS);

    const reused = await addBrigade("__t__ 4");
    expect(reused).not.toBe(highest);
    expect(reused).toBeGreaterThan(highest);
  });

  it("introduces no brigade id gap when nothing was deleted", async () => {
    const first = await addBrigade("__t__ 1");
    const second = await addBrigade("__t__ 2");
    expect(second).toBe(first + 1);

    await apply(SEQUENCE_MIGRATIONS);

    const third = await addBrigade("__t__ 3");
    expect(third).toBe(second + 1);
  });

  // The raise half: a sequence that has genuinely fallen BEHIND the data is still corrected.
  it("still raises a sequence that has fallen behind the data", async () => {
    const brigade = await addBrigade("__t__ b");
    await addBattalion(brigade, "a");
    await addBattalion(brigade, "b");

    // Simulate the state the original migration existed to fix.
    await c.query("SELECT setval(pg_get_serial_sequence('battalions','id'), 1, false)");
    expect(await nextId("battalions")).toBe(1);

    await apply(SEQUENCE_MIGRATIONS);

    const { rows } = await c.query("SELECT MAX(id)::int AS max FROM battalions");
    expect(await nextId("battalions")).toBe(rows[0].max + 1);
  });

  // Re-running many times must be as stable as running once.
  it("is stable across repeated runs", async () => {
    const brigade = await addBrigade("__t__ b");
    await addBattalion(brigade, "a");

    await apply(SEQUENCE_MIGRATIONS);
    const after1 = await seq("battalions");
    await apply(SEQUENCE_MIGRATIONS);
    await apply(SEQUENCE_MIGRATIONS);
    expect(await seq("battalions")).toEqual(after1);
  });
});

// 2.5 — the whole suite twice, schema and data identical.
describe.skipIf(!hasDatabase)("the full migration suite is idempotent", () => {
  const SNAPSHOT = `
    SELECT jsonb_build_object(
      'columns', (SELECT jsonb_agg(to_jsonb(x) ORDER BY x.table_name, x.ordinal_position)
                    FROM (SELECT table_name, column_name, ordinal_position, data_type,
                                 is_nullable, column_default
                            FROM information_schema.columns WHERE table_schema='public') x),
      'constraints', (SELECT jsonb_agg(jsonb_build_object('t', conrelid::regclass::text,
                                                          'n', conname,
                                                          'd', pg_get_constraintdef(oid))
                                       ORDER BY conrelid::regclass::text, conname)
                        FROM pg_constraint WHERE connamespace='public'::regnamespace),
      'indexes', (SELECT jsonb_agg(jsonb_build_object('n', indexname, 'd', indexdef)
                                   ORDER BY indexname)
                    FROM pg_indexes WHERE schemaname='public'),
      'brigades', (SELECT jsonb_agg(to_jsonb(b) ORDER BY b.id) FROM brigades b),
      'battalions', (SELECT jsonb_agg(to_jsonb(t) ORDER BY t.id) FROM battalions t),
      'battalions_seq', (SELECT jsonb_build_object('v', last_value, 'c', is_called)
                           FROM battalions_id_seq),
      'brigades_seq', (SELECT jsonb_build_object('v', last_value, 'c', is_called)
                         FROM brigades_id_seq)
    )::text AS snap`;

  it(
    "leaves identical schema, data and sequence positions when applied twice",
    async () => {
      const c = new Client(testClientConfig(CONNECTION!));
      await c.connect();
      try {
        await c.query("SELECT pg_advisory_lock(728115)");

        const applyAll = async () => {
          for (const f of ALL_MIGRATIONS()) {
            await c.query(fs.readFileSync(path.join(MIGRATIONS, f), "utf8"));
          }
        };

        await applyAll();
        const first = (await c.query(SNAPSHOT)).rows[0].snap;

        await applyAll();
        const second = (await c.query(SNAPSHOT)).rows[0].snap;

        expect(second).toEqual(first);
      } finally {
        await c.query("SELECT pg_advisory_unlock(728115)").catch(() => {});
        await c.end();
      }
    },
    180_000
  );
});
