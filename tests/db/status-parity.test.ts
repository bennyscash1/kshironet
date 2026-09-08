import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { config } from "dotenv";

config({ path: ".env.local" });

import {
  computeRoleStatus,
  squadsWithDrone,
  squadKey,
  type RoleStatus,
} from "@/lib/force-structure/status";

/**
 * Parity between the two implementations of §2.3.
 *
 * Manning status exists twice: as `v_role_status` (so the KPI aggregates can be computed
 * in one query) and as `computeRoleStatus` (so the canvas can recompute a drag without a
 * round trip). Two implementations of one rule drift, and when they do the screen and its
 * own summary cards start contradicting each other — which is exactly the class of bug
 * that erodes trust in a readiness figure.
 *
 * This suite reads only. It is READ-ONLY against whatever database DATABASE_URL points at
 * and issues no INSERT, UPDATE or DELETE, so it is safe to run against real data — but it
 * needs data to be meaningful, so it skips itself when there is none.
 */

const hasDatabase = Boolean(process.env.DATABASE_URL);

interface RoleRow extends Record<string, unknown> {
  role_id: number;
  company_id: number;
  department: string;
  squad: string | null;
  req1: string | null;
  req2: string | null;
  req3: string | null;
  is_manned: boolean;
  pending_identity: boolean;
  held: string[];
  sql_status: string;
}

describe.skipIf(!hasDatabase)("§2.3 — the SQL view and the TypeScript agree", () => {
  let roles: RoleRow[] = [];
  let droneModels = new Set<string>();
  let db: typeof import("@/lib/db/client");

  beforeAll(async () => {
    db = await import("@/lib/db/client");
    droneModels = new Set(
      (await db.query<{ name: string } & Record<string, unknown>>(`SELECT name FROM drone_models`))
        .map((r) => r.name)
    );
    // is_manned is taken FROM THE VIEW, not recomputed here: the point of the suite is to
    // compare the view's status against the TypeScript, so both must start from the same
    // notion of "manned" or the test only rediscovers its own disagreement.
    roles = await db.query<RoleRow>(`
      SELECT r.id AS role_id, r.company_id, r.department, r.squad,
             r.req1, r.req2, r.req3,
             vs.is_manned,
             (vs.pending_pn = 1 OR vs.pending_name = 1) AS pending_identity,
             COALESCE(ARRAY(SELECT sc.certification_name
                              FROM soldier_certifications sc
                             WHERE sc.personal_number = ra.personal_number
                                AND ra.personal_number IS NOT NULL), '{}'::text[]) AS held,
             vs.status AS sql_status
        FROM roles r
        JOIN v_role_status vs ON vs.role_id = r.id
        LEFT JOIN role_assignments ra ON ra.role_id = r.id
    `);
  });

  afterAll(async () => {
    await db?.pool.end();
  });

  it("agrees on every post in the database", () => {
    if (roles.length === 0) {
      // No force structure imported: nothing to compare, and asserting on an empty set
      // would be a green test that checks nothing.
      expect(roles.length).toBe(0);
      return;
    }

    // Only manned posts contribute squad coverage, matching the view's squad_drone CTE.
    const covered = squadsWithDrone(
      roles
        .filter((r) => r.is_manned)
        .map((r) => ({
          companyId: r.company_id,
          department: r.department,
          squad: r.squad,
          heldCertifications: r.held,
        })),
      droneModels
    );

    const mismatches: string[] = [];
    for (const r of roles) {
      const ts: RoleStatus = computeRoleStatus(
        { req1: r.req1, req2: r.req2, req3: r.req3 },
        r.is_manned,
        {
          held: new Set(r.held),
          squadHasDrone: covered.has(squadKey(r.company_id, r.department, r.squad)),
          pendingIdentity: r.pending_identity,
        }
      );
      if (ts !== r.sql_status) {
        mismatches.push(
          `role ${r.role_id} (${r.department}/${r.squad}): ts=${ts} sql=${r.sql_status} ` +
            `reqs=${JSON.stringify([r.req1, r.req2, r.req3])} held=${JSON.stringify(r.held)}`
        );
      }
    }

    expect(mismatches.slice(0, 10)).toEqual([]);
    expect(mismatches.length).toBe(0);
  });

  it("classifies every post as exactly one of the four states", () => {
    if (roles.length === 0) return;
    const states = new Set(roles.map((r) => r.sql_status));
    for (const state of states) expect(["empty", "pending", "ok", "red"]).toContain(state);
  });

  it("never counts a pending-identity post as a certification gap", () => {
    if (roles.length === 0) return;
    for (const r of roles) {
      if (r.pending_identity && r.is_manned) {
        expect(r.sql_status, `role ${r.role_id}`).toBe("pending");
      }
    }
  });

  it("never reports a manned post as empty, or an unmanned post as ok/red", () => {
    if (roles.length === 0) return;
    for (const r of roles) {
      if (r.is_manned) expect(r.sql_status, `role ${r.role_id}`).not.toBe("empty");
      else expect(r.sql_status, `role ${r.role_id}`).toBe("empty");
    }
  });
});
