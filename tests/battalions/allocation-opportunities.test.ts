import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { config } from "dotenv";

config({ path: ".env.local" });

import {
  effectiveEndDate,
  hasUnlimitedSeats,
  openSeatsOf,
  splitByMode,
  REGISTRATION_OPEN_STATUSES,
  type AllocationOpportunity,
} from "@/lib/battalions/allocation-opportunities";

/**
 * The allocation-opportunity rule, against SEEDED fixtures inside a transaction that is
 * always rolled back.
 *
 * It runs `ALLOCATION_OPPORTUNITIES_SQL` — the exact statement the repository runs — rather
 * than a retyped copy, so the suite cannot pass while the production query is wrong. "Now"
 * is injected as the third parameter, so every expiry case is deterministic and none of
 * them depends on the day the suite happens to run.
 */

const hasDatabase = Boolean(process.env.DATABASE_URL || process.env.DIRECT_URL);

/** Fixtures are prefixed so anything left behind by a crashed run is identifiable. */
const TAG = "__test_alloc__";

type Row = Omit<AllocationOpportunity, "daysToClose">;

describe.skipIf(!hasDatabase)("allocation opportunities", () => {
  let client: import("pg").Client;
  let sql: string;
  let bnA: number;
  let bnB: number;
  const certs: Record<string, number> = {};

  /** Runs the production statement on the transaction's own connection. */
  async function opportunitiesFor(battalionId: number, today: string): Promise<Row[]> {
    const res = await client.query(sql, [battalionId, REGISTRATION_OPEN_STATUSES, today]);
    return res.rows as Row[];
  }

  const idsFor = async (battalionId: number, today: string) =>
    (await opportunitiesFor(battalionId, today)).map((r) => r.certification_id);

  beforeAll(async () => {
    const { Client } = await import("pg");
    ({ ALLOCATION_OPPORTUNITIES_SQL: sql } = await import(
      "@/lib/db/repositories/battalion-dashboard"
    ));
    client = new Client({
      connectionString: process.env.DIRECT_URL || process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false },
    });
    await client.connect();
    await client.query("BEGIN");

    const bns = await client.query<{ id: number }>(
      `SELECT id FROM battalions WHERE is_active = 1 ORDER BY code LIMIT 2`
    );
    bnA = bns.rows[0].id;
    bnB = bns.rows[1].id;

    async function cert(
      key: string,
      opts: { start: string; end: string | null; slots: number | null; status?: string }
    ) {
      const res = await client.query<{ id: number }>(
        `INSERT INTO certifications (name, start_date, end_date, total_slots, registration_open, status)
         VALUES ($1, $2, $3, $4, 1, $5) RETURNING id`,
        [`${TAG}${key}`, opts.start, opts.end, opts.slots, opts.status ?? "open"]
      );
      certs[key] = res.rows[0].id;
      return res.rows[0].id;
    }
    const quota = (certId: number, battalionId: number, slots: number) =>
      client.query(
        `INSERT INTO certification_battalion_quotas (certification_id, battalion_id, allocated_slots)
         VALUES ($1, $2, $3)`,
        [certId, battalionId, slots]
      );
    const soldier = (certId: number, battalionId: number, reserve: 0 | 1) =>
      client.query(
        `INSERT INTO roster_entries (certification_id, battalion_id, full_name, personal_number, is_reserve, status)
         VALUES ($1, $2, 'בדיקה', '9999999', $3, 'registered')`,
        [certId, battalionId, reserve]
      );

    // Mode A — open to all (no quota rows anywhere), seats free.
    await cert("modeA_free", { start: "2026-10-01", end: "2026-10-05", slots: 3 });
    // Mode A — unlimited capacity.
    await cert("modeA_unlimited", { start: "2026-10-01", end: "2026-10-05", slots: null });
    // Mode A — every seat taken.
    const full = await cert("modeA_full", { start: "2026-10-01", end: "2026-10-05", slots: 1 });
    await soldier(full, bnA, 0);
    // Mode A — the only names on it are עתודה, so no seat is occupied.
    const reserveOnly = await cert("modeA_reserve_only", {
      start: "2026-10-01",
      end: "2026-10-05",
      slots: 2,
    });
    await soldier(reserveOnly, bnA, 1);
    await soldier(reserveOnly, bnB, 1);

    // Mode B — allocated to battalion A, nobody named.
    const mine = await cert("modeB_mine", { start: "2026-10-01", end: "2026-10-05", slots: 9 });
    await quota(mine, bnA, 2);
    // Mode B — allocated to battalion B only.
    const theirs = await cert("modeB_theirs", { start: "2026-10-01", end: "2026-10-05", slots: 9 });
    await quota(theirs, bnB, 2);
    // Mode B — A's allocation is fully assigned.
    const mineFull = await cert("modeB_mine_full", {
      start: "2026-10-01",
      end: "2026-10-05",
      slots: 9,
    });
    await quota(mineFull, bnA, 1);
    await soldier(mineFull, bnA, 0);
    // Mode B — A's allocation holds only עתודה, so its seat is still open.
    const mineReserve = await cert("modeB_mine_reserve", {
      start: "2026-10-01",
      end: "2026-10-05",
      slots: 9,
    });
    await quota(mineReserve, bnA, 1);
    await soldier(mineReserve, bnA, 1);
    // Mode B — a soldier from ANOTHER battalion must not consume A's seats.
    const mineOther = await cert("modeB_other_bn_soldier", {
      start: "2026-10-01",
      end: "2026-10-05",
      slots: 9,
    });
    await quota(mineOther, bnA, 1);
    await soldier(mineOther, bnB, 0);

    // Expiry fixtures.
    await cert("ends_today", { start: "2026-09-28", end: "2026-10-01", slots: 5 });
    await cert("ended_yesterday", { start: "2026-09-25", end: "2026-09-30", slots: 5 });
    await cert("one_day_today", { start: "2026-10-01", end: null, slots: 5 });
    await cert("one_day_past", { start: "2026-09-30", end: null, slots: 5 });
    // Spans a month boundary.
    await cert("month_span", { start: "2026-09-28", end: "2026-10-03", slots: 5 });
    // Statuses that must never qualify.
    await cert("draft", { start: "2026-10-01", end: "2026-10-05", slots: 5, status: "draft" });
    await cert("closed", { start: "2026-10-01", end: "2026-10-05", slots: 5, status: "closed" });
    await cert("cancelled", {
      start: "2026-10-01",
      end: "2026-10-05",
      slots: 5,
      status: "cancelled",
    });
    await cert("completed", {
      start: "2026-10-01",
      end: "2026-10-05",
      slots: 5,
      status: "completed",
    });
    // Seeding ~18 certifications with quotas and roster rows over a remote connection
    // comfortably exceeds vitest's 10s default hook timeout.
  }, 120_000);

  afterAll(async () => {
    if (!client) return;
    // Nothing this suite wrote survives it.
    await client.query("ROLLBACK");
    await client.end();
  }, 60_000);

  const TODAY = "2026-10-01";

  describe("allocation mode", () => {
    it("treats the ABSENCE of any quota row as open to all", async () => {
      const rows = await opportunitiesFor(bnA, TODAY);
      const a = rows.find((r) => r.certification_id === certs.modeA_free)!;
      expect(a.mode).toBe("open_to_all");
      expect(a.seats).toBe(3);
    });

    it("treats a quota row for this battalion as a targeted allocation", async () => {
      const rows = await opportunitiesFor(bnA, TODAY);
      const b = rows.find((r) => r.certification_id === certs.modeB_mine)!;
      expect(b.mode).toBe("battalion_quota");
      // The battalion's own allocation, NOT the certification's total_slots (9).
      expect(b.seats).toBe(2);
    });

    it("never shows a battalion an allocation made to a different one", async () => {
      expect(await idsFor(bnA, TODAY)).not.toContain(certs.modeB_theirs);
      expect(await idsFor(bnB, TODAY)).toContain(certs.modeB_theirs);
      expect(await idsFor(bnB, TODAY)).not.toContain(certs.modeB_mine);
    });
  });

  describe("seat availability", () => {
    it("drops a certification with no seats left", async () => {
      const ids = await idsFor(bnA, TODAY);
      expect(ids).not.toContain(certs.modeA_full);
      expect(ids).not.toContain(certs.modeB_mine_full);
    });

    it("keeps unlimited capacity, reporting remaining as null rather than 0", async () => {
      const row = (await opportunitiesFor(bnA, TODAY)).find(
        (r) => r.certification_id === certs.modeA_unlimited
      )!;
      expect(row.seats).toBeNull();
      expect(row.remaining).toBeNull();
    });

    it("excludes עתודה from occupancy in BOTH modes", async () => {
      const rows = await opportunitiesFor(bnA, TODAY);
      const a = rows.find((r) => r.certification_id === certs.modeA_reserve_only)!;
      const b = rows.find((r) => r.certification_id === certs.modeB_mine_reserve)!;
      // Two reserve names on a 2-seat shared pool: every seat is still open.
      expect(a.taken).toBe(0);
      expect(a.remaining).toBe(2);
      // One reserve name against a 1-seat allocation: the seat is still open.
      expect(b.taken).toBe(0);
      expect(b.remaining).toBe(1);
    });

    it("counts only THIS battalion's soldiers against a targeted allocation", async () => {
      const row = (await opportunitiesFor(bnA, TODAY)).find(
        (r) => r.certification_id === certs.modeB_other_bn_soldier
      )!;
      expect(row.taken).toBe(0);
      expect(row.remaining).toBe(1);
    });

    it("counts EVERY battalion's soldiers against a shared pool", async () => {
      // modeA_full has one soldier from battalion A; battalion B must see it as full too.
      expect(await idsFor(bnB, TODAY)).not.toContain(certs.modeA_full);
    });
  });

  describe("expiry — Asia/Jerusalem civil date", () => {
    it("keeps a certification whose end_date is TODAY", async () => {
      expect(await idsFor(bnA, "2026-10-01")).toContain(certs.ends_today);
    });

    it("drops it the very next day", async () => {
      expect(await idsFor(bnA, "2026-10-02")).not.toContain(certs.ends_today);
    });

    it("drops one that ended yesterday", async () => {
      expect(await idsFor(bnA, TODAY)).not.toContain(certs.ended_yesterday);
    });

    it("falls back to start_date for a one-day cycle with no end_date", async () => {
      const ids = await idsFor(bnA, TODAY);
      expect(ids).toContain(certs.one_day_today);
      expect(ids).not.toContain(certs.one_day_past);
    });

    it("keeps a cycle that spans a month boundary on both sides of it", async () => {
      // Sep 28 -> Oct 3: eligible in September and still eligible in October.
      expect(await idsFor(bnA, "2026-09-29")).toContain(certs.month_span);
      expect(await idsFor(bnA, "2026-10-03")).toContain(certs.month_span);
      expect(await idsFor(bnA, "2026-10-04")).not.toContain(certs.month_span);
    });
  });

  describe("status allow-list", () => {
    it("admits only statuses that permit registration", async () => {
      expect(REGISTRATION_OPEN_STATUSES).toEqual(["open"]);
      const ids = await idsFor(bnA, TODAY);
      for (const key of ["draft", "closed", "cancelled", "completed"]) {
        expect(ids).not.toContain(certs[key]);
      }
    });
  });

  describe("the band's derived figures", () => {
    it("splits into the two groups the band renders", async () => {
      const rows = (await opportunitiesFor(bnA, TODAY)).map((r) => ({ ...r, daysToClose: null }));
      const { battalionQuota, openToAll } = splitByMode(rows);
      expect(battalionQuota.every((r) => r.mode === "battalion_quota")).toBe(true);
      expect(openToAll.every((r) => r.mode === "open_to_all")).toBe(true);
      // Every row lands in exactly one group — the counter cannot double-count.
      expect(battalionQuota.length + openToAll.length).toBe(rows.length);
    });

    it("aggregates seats across BOTH groups, unlimited reported separately", async () => {
      const rows = (await opportunitiesFor(bnA, TODAY)).map((r) => ({ ...r, daysToClose: null }));
      const bounded = rows.filter((r) => r.remaining !== null);
      expect(openSeatsOf(rows)).toBe(bounded.reduce((s, r) => s + (r.remaining ?? 0), 0));
      expect(hasUnlimitedSeats(rows)).toBe(true);
    });
  });

  describe("effectiveEndDate", () => {
    it("uses end_date, falling back to start_date", () => {
      expect(effectiveEndDate({ start_date: "2026-01-01", end_date: "2026-01-05" })).toBe(
        "2026-01-05"
      );
      expect(effectiveEndDate({ start_date: "2026-01-01", end_date: null })).toBe("2026-01-01");
      expect(effectiveEndDate({ start_date: "2026-01-01", end_date: "  " })).toBe("2026-01-01");
    });
  });
});
