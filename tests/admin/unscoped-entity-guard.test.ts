import { config } from "dotenv";
import { lockDatabaseForTest } from "../helpers/db-lock";
import { testClientConfig, testDatabaseUrl } from "../helpers/test-db";
import fs from "node:fs";
import path from "node:path";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  BLOCKED_ENTITIES,
  UNSCOPED_ENTITY_BLOCKED,
  unscopedBlockFailure,
  type BlockedEntity,
} from "@/lib/brigades/unscoped-guard";

config({ path: ".env.local" });

// LOCAL test database only. testDatabaseUrl() throws rather than skips if
// TEST_DATABASE_URL points anywhere non-loopback — see tests/helpers/test-db.ts.
const CONNECTION = testDatabaseUrl();
const hasDatabase = Boolean(CONNECTION);
const READY = "multi_brigade_isolation_ready";

const MIGRATION = path.join(
  process.cwd(),
  "migrations",
  "postgres",
  "027_unscoped_entity_guard.sql"
);

/** One minimal INSERT per blocked table, satisfying its NOT NULL columns and nothing more. */
const INSERTS: Record<BlockedEntity, { sql: string; params: unknown[] }> = {
  certifications: {
    sql: "INSERT INTO certifications (name, start_date, end_date, total_slots) VALUES ($1,$2,$3,$4)",
    params: ["__t__ cert", "2026-01-01", "2026-01-02", 1],
  },
  certification_templates: {
    sql: "INSERT INTO certification_templates (name) VALUES ($1)",
    params: ["__t__ template"],
  },
  certification_gap_rows: {
    sql: "INSERT INTO certification_gap_rows (certification_name) VALUES ($1)",
    params: ["__t__ gap"],
  },
  trainings: {
    sql: "INSERT INTO trainings (name, start_date) VALUES ($1,$2)",
    params: ["__t__ training", "2026-01-01"],
  },
  influencing_factors: {
    sql: "INSERT INTO influencing_factors (name, start_date) VALUES ($1,$2)",
    params: ["__t__ factor", "2026-01-01"],
  },
  soldier_certifications: {
    sql: "INSERT INTO soldier_certifications (personal_number, certification_name) VALUES ($1,$2)",
    params: ["__t__1", "__t__ held"],
  },
};

const ENTITIES = Object.keys(BLOCKED_ENTITIES) as BlockedEntity[];

describe("the unscoped-entity guard (pure)", () => {
  // The Hebrew label registry and the trigger list must not drift: a table added to the
  // migration without an entry here would still be refused, but would surface as the
  // generic fallback message instead of naming the entity.
  it("has a Hebrew label for every table the migration guards", () => {
    const sql = fs.readFileSync(MIGRATION, "utf8");
    const guarded = Array.from(
      sql.matchAll(/^\s*'([a-z_]+)',?\s*$/gm),
      (m) => m[1]
    ).filter((t) => t !== "multi_brigade_isolation_ready");

    expect(new Set(guarded)).toEqual(new Set(ENTITIES));
  });

  it("names the entity in Hebrew and leaks no SQL", () => {
    for (const table of ENTITIES) {
      const failure = unscopedBlockFailure({
        code: UNSCOPED_ENTITY_BLOCKED,
        table,
        message: 'relation "x": cannot create rows ... unscoped_entity_write_is_blocked',
      });
      expect(failure?.status).toBe(409);
      expect(failure?.message).toContain(BLOCKED_ENTITIES[table]);
      expect(failure?.message).not.toMatch(/relation|INSERT|trigger|unscoped_entity/);
    }
  });

  it("falls back to a generic entity name for an unknown table", () => {
    const failure = unscopedBlockFailure({ code: UNSCOPED_ENTITY_BLOCKED, table: "whatever" });
    expect(failure?.message).toContain("רשומות מסוג זה");
  });

  it("ignores every other error", () => {
    expect(unscopedBlockFailure({ code: "23505", table: "certifications" })).toBeNull();
    expect(unscopedBlockFailure(new Error("boom"))).toBeNull();
    expect(unscopedBlockFailure(null)).toBeNull();
  });
});

describe.skipIf(!hasDatabase)("the unscoped-entity guard (database)", () => {
  let client: Client;

  beforeAll(async () => {
    client = new Client(testClientConfig(CONNECTION!));
    await client.connect();
    await client.query("BEGIN");
    // Queue behind any other database-backed suite — see tests/helpers/db-lock.ts
    await lockDatabaseForTest(client);
    await client.query("DELETE FROM battalions");
    await client.query("DELETE FROM brigades");
    await client.query("UPDATE system_settings SET value = '0' WHERE key = $1", [READY]);
  });

  afterAll(async () => {
    if (!client) return;
    await client.query("ROLLBACK");
    await client.end();
  });

  async function attempt(entity: BlockedEntity): Promise<string | null> {
    const { sql, params } = INSERTS[entity];
    await client.query("SAVEPOINT sp");
    try {
      await client.query(sql, params);
      await client.query("ROLLBACK TO SAVEPOINT sp"); // never keep the row
      return null;
    } catch (err) {
      await client.query("ROLLBACK TO SAVEPOINT sp");
      return (err as { code?: string }).code ?? "UNKNOWN";
    }
  }

  const addBrigade = (name: string) =>
    client.query("INSERT INTO brigades (name) VALUES ($1) RETURNING id", [name]);
  const setReady = (v: "0" | "1") =>
    client.query("UPDATE system_settings SET value = $2 WHERE key = $1", [READY, v]);

  // 4.1 — a second brigade is now allowed at all. 025's trigger is gone.
  it("allows a second brigade", async () => {
    await addBrigade("__t__ A");
    await addBrigade("__t__ B");
    const { rows } = await client.query("SELECT count(*)::int AS n FROM brigades");
    expect(rows[0].n).toBe(2);
  });

  // 4.1 — battalions under each, same code in both, no collision.
  it("allows the same battalion code under each brigade when only one is active", async () => {
    const { rows: bs } = await client.query("SELECT id FROM brigades ORDER BY id");
    // Migration 029 makes an ACTIVE code unique army-wide, so only the first copy is
    // active; the rest are inactive. Per-brigade uniqueness (026) is what lets them
    // coexist at all.
    for (const [i, b] of bs.entries()) {
      await client.query(
        "INSERT INTO battalions (brigade_id, code, name, color_hex, is_active) VALUES ($1,'5030','x','#64748B',$2)",
        [b.id, i === 0 ? 1 : 0]
      );
    }
    const { rows } = await client.query(
      "SELECT count(*)::int AS n FROM battalions WHERE code = '5030'"
    );
    expect(rows[0].n).toBe(2);
  });

  // 4.2 — a battalion in A is invisible to a query scoped to B.
  it("keeps each brigade's battalions out of the other's scope", async () => {
    const { rows: bs } = await client.query("SELECT id FROM brigades ORDER BY id");
    const [a, b] = [bs[0].id, bs[1].id];
    await client.query(
      "INSERT INTO battalions (brigade_id, code, name, color_hex, is_active) VALUES ($1,'only-a','x','#64748B',1)",
      [a]
    );
    const inB = await client.query(
      "SELECT count(*)::int AS n FROM battalions WHERE brigade_id = $1 AND code = 'only-a'",
      [b]
    );
    expect(inB.rows[0].n).toBe(0);
  });

  // 4.3 — with two active brigades and the flag off, every blocked table refuses INSERT.
  it.each(ENTITIES)("refuses INSERT into %s with two active brigades", async (entity) => {
    expect(await attempt(entity)).toBe(UNSCOPED_ENTITY_BLOCKED);
  });

  // 1.5 — the block is on creation only.
  it("still permits UPDATE and DELETE while the block is active", async () => {
    await setReady("1");
    await client.query(INSERTS.trainings.sql, INSERTS.trainings.params);
    await setReady("0");

    await client.query("UPDATE trainings SET name = $1 WHERE name = $2", [
      "__t__ renamed",
      "__t__ training",
    ]);
    const updated = await client.query(
      "SELECT count(*)::int AS n FROM trainings WHERE name = '__t__ renamed'"
    );
    expect(updated.rows[0].n).toBe(1);

    await client.query("DELETE FROM trainings WHERE name = '__t__ renamed'");
    const left = await client.query(
      "SELECT count(*)::int AS n FROM trainings WHERE name = '__t__ renamed'"
    );
    expect(left.rows[0].n).toBe(0);
  });

  // 4.5 — the flag releases the block regardless of brigade count, proving 034 works.
  it.each(ENTITIES)("allows INSERT into %s once the flag is on", async (entity) => {
    await setReady("1");
    expect(await attempt(entity)).toBeNull();
    await setReady("0");
  });

  // Deactivating a brigade lifts the block: the condition counts ACTIVE brigades.
  it.each(ENTITIES)("allows INSERT into %s when only one brigade is active", async (entity) => {
    const { rows } = await client.query("SELECT id FROM brigades ORDER BY id DESC LIMIT 1");
    await client.query("UPDATE brigades SET is_active = 0 WHERE id = $1", [rows[0].id]);
    expect(await attempt(entity)).toBeNull();
    await client.query("UPDATE brigades SET is_active = 1 WHERE id = $1", [rows[0].id]);
  });

  // 4.4 — single-brigade operation must not regress.
  it.each(ENTITIES)("allows INSERT into %s with exactly one brigade", async (entity) => {
    await client.query("SAVEPOINT one");
    await client.query("DELETE FROM battalions");
    await client.query("DELETE FROM brigades");
    await addBrigade("__t__ solo");
    expect(await attempt(entity)).toBeNull();
    await client.query("ROLLBACK TO SAVEPOINT one");
  });

  // The reason the block exists, asserted rather than described: one unscoped gap row
  // makes v_certification_gaps span both brigades.
  it("demonstrates the leak the block prevents", async () => {
    // v_certification_gaps only counts ACTIVE battalions (`WHERE b.is_active = 1`), and
    // since migration 029 two active battalions cannot share a code — so each brigade gets
    // an active battalion with a DISTINCT code. Without this the view spans one brigade and
    // the leak it demonstrates would not appear.
    const { rows: brigadeRows } = await client.query("SELECT id FROM brigades ORDER BY id");
    for (const [i, b] of brigadeRows.entries()) {
      await client.query(
        "INSERT INTO battalions (brigade_id, code, name, color_hex, is_active) VALUES ($1,$2,'x','#64748B',1)",
        [b.id, `leak-${i}`]
      );
    }

    await setReady("1");
    await client.query(INSERTS.certification_gap_rows.sql, INSERTS.certification_gap_rows.params);
    await setReady("0");

    const { rows } = await client.query(
      `SELECT count(DISTINCT b.brigade_id)::int AS brigades
         FROM v_certification_gaps g JOIN battalions b ON b.id = g.battalion_id`
    );
    expect(rows[0].brigades).toBeGreaterThan(1);

    await client.query("DELETE FROM certification_gap_rows WHERE certification_name = $1", [
      "__t__ gap",
    ]);
  });
});

describe.skipIf(!hasDatabase)("027 idempotency", () => {
  it("applies twice in a row without error", async () => {
    const sql = fs.readFileSync(MIGRATION, "utf8");
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

  it("has removed 025's single-brigade trigger", async () => {
    const c = new Client(testClientConfig(CONNECTION!));
    await c.connect();
    try {
      const { rows } = await c.query(
        "SELECT count(*)::int AS n FROM pg_trigger WHERE tgname = 'trg_brigades_single_until_ready'"
      );
      expect(rows[0].n).toBe(0);
    } finally {
      await c.end();
    }
  });
});
