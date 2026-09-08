import type { PoolClient } from "pg";
import { execute, query, queryOne, withTransaction } from "@/lib/db/client";
import {
  planOccupancyRestore,
  type OccupantFields,
} from "@/lib/force-structure/restore-plan";
import type {
  BankSoldierRow,
  CanvasRoleRow,
  CompanyKpiRow,
  SoldierLookupRow,
} from "@/lib/force-structure/types";

export type {
  BankSoldierRow,
  CanvasRoleRow,
  CompanyKpiRow,
  SoldierLookupRow,
} from "@/lib/force-structure/types";

/**
 * Force-structure reads ("שניים לפנים").
 *
 * Every function takes `battalionId` from the caller — which takes it from the session,
 * never from a URL — and puts it in the WHERE clause rather than filtering after the
 * fetch, so a row belonging to another battalion is never loaded in the first place.
 */

/**
 * One row per company with its measures.
 *
 * The two gap kinds come back as separate columns and are never added together: an empty
 * post needs a person, a post marked red needs a course (§2.4).
 *
 * `manned_posts` and `bank_count` come back separately so the caller can present "מאויש"
 * as their sum — the definition each battalion's own spreadsheet uses — while
 * `manpower_gap` stays anchored to posts alone. See `computeCompanyKpis` for why.
 */
export async function listCompanyKpis(battalionId: number): Promise<CompanyKpiRow[]> {
  return query<CompanyKpiRow & Record<string, unknown>>(
    `SELECT co.id AS company_id,
            co.code,
            co.name,
            co.kind,
            COUNT(vs.role_id)::int AS establishment,
            COUNT(vs.role_id) FILTER (WHERE vs.is_manned)::int AS manned_posts,
            COUNT(vs.role_id) FILTER (WHERE vs.status = 'red')::int AS certification_gap,
            COUNT(vs.role_id) FILTER (WHERE vs.status = 'empty')::int AS manpower_gap,
            COUNT(vs.role_id) FILTER (WHERE vs.status = 'pending')::int AS pending_identity,
            COALESCE(bank.n, 0)::int AS bank_count
       FROM companies co
       LEFT JOIN v_role_status vs ON vs.company_id = co.id
       LEFT JOIN LATERAL (
         SELECT COUNT(*)::int AS n FROM bank_soldiers bs WHERE bs.company_id = co.id
       ) bank ON TRUE
      WHERE co.battalion_id = $1
      GROUP BY co.id, co.code, co.name, co.kind, bank.n
      ORDER BY co.sort_order, co.name`,
    [battalionId]
  );
}

export interface DepartmentKpiRow {
  company_id: number;
  department: string;
  establishment: number;
  manned_posts: number;
  certification_gap: number;
  manpower_gap: number;
  pending_identity: number;
}

/** The same measures per department, for the department pill selector. */
export async function listDepartmentKpis(battalionId: number): Promise<DepartmentKpiRow[]> {
  return query<DepartmentKpiRow & Record<string, unknown>>(
    `SELECT vs.company_id,
            vs.department,
            COUNT(*)::int AS establishment,
            COUNT(*) FILTER (WHERE vs.is_manned)::int AS manned_posts,
            COUNT(*) FILTER (WHERE vs.status = 'red')::int AS certification_gap,
            COUNT(*) FILTER (WHERE vs.status = 'empty')::int AS manpower_gap,
            COUNT(*) FILTER (WHERE vs.status = 'pending')::int AS pending_identity
       FROM v_role_status vs
      WHERE vs.battalion_id = $1
      GROUP BY vs.company_id, vs.department
      ORDER BY vs.company_id, MIN(vs.role_id)`,
    [battalionId]
  );
}

export interface SquadDroneRow {
  company_id: number;
  department: string;
  squad: string | null;
  posts: number;
  has_drone: boolean;
}

/**
 * Drone coverage per squad.
 *
 * Coverage is a property of the squad, not of a soldier: if anyone in it holds any model
 * from `drone_models`, the drone requirement is satisfied for every post in that squad
 * (§2.3). Only posts that are actually manned contribute coverage.
 */
export async function listSquadDroneCoverage(battalionId: number): Promise<SquadDroneRow[]> {
  return query<SquadDroneRow & Record<string, unknown>>(
    `SELECT r.company_id,
            r.department,
            r.squad,
            COUNT(*)::int AS posts,
            BOOL_OR(dm.name IS NOT NULL) AS has_drone
       FROM roles r
       JOIN companies co ON co.id = r.company_id
       LEFT JOIN role_assignments ra ON ra.role_id = r.id AND ra.is_posted = 1
       LEFT JOIN soldier_certifications sc ON sc.personal_number = ra.personal_number
       LEFT JOIN drone_models dm ON dm.name = sc.certification_name
      WHERE co.battalion_id = $1
      GROUP BY r.company_id, r.department, r.squad
      ORDER BY r.company_id, r.department, r.squad`,
    [battalionId]
  );
}

export interface PendingIdentityRow {
  kind: "assignment" | "bank";
  id: number;
  company_id: number;
  company: string;
  department: string | null;
  squad: string | null;
  serial: string | null;
  role_name: string | null;
  full_name: string | null;
}

/**
 * People whose identity is incomplete: no personal number, or no name at all.
 *
 * They count toward the head-count, because each battalion's own reports include them.
 * But the personal number is the join key for held certifications, the soldier lookup and
 * the one-way integration from the certifications module, so nothing downstream can use
 * them until it is filled in. Surfaced as an open task so the gap is visible rather than
 * quietly limiting what the battalion can do.
 */
export async function listPendingIdentity(battalionId: number): Promise<PendingIdentityRow[]> {
  return query<PendingIdentityRow & Record<string, unknown>>(
    `SELECT 'assignment' AS kind, ra.id, co.id AS company_id, co.name AS company,
            r.department, r.squad, r.serial, r.role_name, ra.full_name
       FROM role_assignments ra
       JOIN roles r ON r.id = ra.role_id
       JOIN companies co ON co.id = r.company_id
      WHERE co.battalion_id = $1
        AND (ra.pending_pn = 1 OR ra.pending_name = 1)
     UNION ALL
     SELECT 'bank' AS kind, bs.id, co.id AS company_id, co.name AS company,
            bs.department, NULL AS squad, NULL AS serial, NULL AS role_name, bs.full_name
       FROM bank_soldiers bs
       JOIN companies co ON co.id = bs.company_id
      WHERE co.battalion_id = $1
        AND bs.pending_pn = 1`,
    [battalionId]
  );
}

/** How many people in this battalion are waiting on an identity. Drives the task count. */
export async function countPendingIdentity(battalionId: number): Promise<number> {
  const rows = await query<{ n: number } & Record<string, unknown>>(
    `SELECT (
       (SELECT COUNT(*) FROM role_assignments ra
          JOIN roles r ON r.id = ra.role_id
          JOIN companies co ON co.id = r.company_id
         WHERE co.battalion_id = $1 AND (ra.pending_pn = 1 OR ra.pending_name = 1))
       +
       (SELECT COUNT(*) FROM bank_soldiers bs
          JOIN companies co ON co.id = bs.company_id
         WHERE co.battalion_id = $1 AND bs.pending_pn = 1)
     )::int AS n`,
    [battalionId]
  );
  return rows[0]?.n ?? 0;
}

export type AssignmentUsability =
  | { ok: true }
  | { ok: false; reason: "not_found" | "pending_identity" };

/**
 * Whether this force-structure assignment may be nominated or registered for a course.
 *
 * Identity is required. A soldier with no personal number cannot be matched to the
 * certifications they already hold, cannot be found by lookup, and cannot be reconciled
 * when the course completes — so registering them would create a roster entry that no
 * later step can resolve. Enforced here, in the data layer, so that no API caller can
 * bypass it by skipping the UI.
 */
export async function isAssignmentUsable(
  assignmentId: number,
  battalionId: number
): Promise<AssignmentUsability> {
  const rows = await query<{ pending: boolean } & Record<string, unknown>>(
    `SELECT (ra.pending_pn = 1 OR ra.pending_name = 1) AS pending
       FROM role_assignments ra
       JOIN roles r ON r.id = ra.role_id
       JOIN companies co ON co.id = r.company_id
      WHERE ra.id = $1 AND co.battalion_id = $2`,
    [assignmentId, battalionId]
  );
  if (rows.length === 0) return { ok: false, reason: "not_found" };
  return rows[0].pending ? { ok: false, reason: "pending_identity" } : { ok: true };
}

/** One row per post, for the canvas. Status comes from `v_role_status` so the cards and
 * the KPI cards cannot disagree. */
export async function listCanvasRoles(battalionId: number): Promise<CanvasRoleRow[]> {
  const rows = await query<
    Omit<CanvasRoleRow, "held" | "is_manned"> & { held: string[] | null; is_manned: boolean }
  >(
    `SELECT vs.role_id, vs.company_id, vs.department, vs.squad, vs.status, vs.is_manned,
            r.serial, r.role_name, r.req1, r.req2, r.req3,
            ra.id AS assignment_id, ra.full_name, ra.personal_number,
            COALESCE(h.certs, ARRAY[]::text[]) AS held
       FROM v_role_status vs
       JOIN roles r ON r.id = vs.role_id
       LEFT JOIN role_assignments ra ON ra.role_id = r.id
       LEFT JOIN LATERAL (
         SELECT ARRAY_AGG(sc.certification_name) AS certs
           FROM soldier_certifications sc
          WHERE sc.personal_number = ra.personal_number
       ) h ON TRUE
      WHERE vs.battalion_id = $1
      ORDER BY r.id`,
    [battalionId]
  );
  return rows.map((r) => ({ ...r, held: r.held ?? [], is_manned: Boolean(r.is_manned) }));
}

export async function listBankSoldiers(battalionId: number): Promise<BankSoldierRow[]> {
  return query<BankSoldierRow>(
    `SELECT bs.id, bs.company_id, bs.department, bs.full_name, bs.personal_number, bs.rank,
            bs.note, bs.pending_pn,
            COALESCE((
              SELECT ARRAY_AGG(sc.certification_name)
                FROM soldier_certifications sc
               WHERE sc.personal_number = bs.personal_number
            ), ARRAY[]::text[]) AS held
       FROM bank_soldiers bs
       JOIN companies co ON co.id = bs.company_id
      WHERE co.battalion_id = $1
      ORDER BY bs.department, bs.full_name`,
    [battalionId]
  );
}

/** Name-or-personal-number lookup for the green-square combobox. Pending-identity rows
 * are excluded — they cannot be registered. */
export async function lookupSoldiers(
  battalionId: number,
  q: string,
  limit = 12
): Promise<SoldierLookupRow[]> {
  const needle = `%${q.trim()}%`;
  if (q.trim().length < 1) return [];
  return query<SoldierLookupRow>(
    `SELECT * FROM (
       SELECT 'assignment'::text AS source, ra.id AS assignment_id, NULL::int AS bank_id,
              ra.full_name, ra.personal_number, ra.phone,
              concat_ws(' · ', co.name, r.department, r.squad, r.serial, r.role_name) AS frame,
              COALESCE((
                SELECT ARRAY_AGG(sc.certification_name)
                  FROM soldier_certifications sc
                 WHERE sc.personal_number = ra.personal_number
              ), ARRAY[]::text[]) AS certs
         FROM role_assignments ra
         JOIN roles r ON r.id = ra.role_id
         JOIN companies co ON co.id = r.company_id
        WHERE co.battalion_id = $1
          AND ra.pending_pn = 0 AND ra.pending_name = 0
          AND ra.personal_number IS NOT NULL AND ra.full_name IS NOT NULL
          AND (ra.full_name ILIKE $2 OR ra.personal_number ILIKE $2)
       UNION ALL
       SELECT 'bank', NULL, bs.id, bs.full_name, bs.personal_number, NULL,
              concat_ws(' · ', 'בנק כ״א', co.name, bs.department),
              COALESCE((
                SELECT ARRAY_AGG(sc.certification_name)
                  FROM soldier_certifications sc
                 WHERE sc.personal_number = bs.personal_number
              ), ARRAY[]::text[])
         FROM bank_soldiers bs
         JOIN companies co ON co.id = bs.company_id
        WHERE co.battalion_id = $1
          AND bs.pending_pn = 0 AND bs.personal_number IS NOT NULL
          AND (bs.full_name ILIKE $2 OR bs.personal_number ILIKE $2)
     ) u
     LIMIT $3`,
    [battalionId, needle, limit]
  );
}

export type MoveTarget =
  | { kind: "role"; role_id: number }
  | { kind: "bank" };

/**
 * Moves a soldier between posts, or between a post and the 120% bank.
 *
 * Soldier fields move; `roles` never change. A swap of two occupied posts is two UPDATEs
 * of the occupant columns, so `role_id` uniqueness never has a gap in the middle.
 */
export async function moveAssignment(
  assignmentId: number,
  battalionId: number,
  target: MoveTarget
): Promise<{ ok: true } | { ok: false; reason: "not_found" | "ceiling" }> {
  return withTransaction(async (client) => {
    const source = await queryOne<{
      id: number;
      role_id: number;
      company_id: number;
      department: string;
      role_name: string;
      full_name: string | null;
      personal_number: string | null;
      rank: string | null;
      phone: string | null;
      pending_pn: number;
      pending_name: number;
      is_posted: number;
    }>(
      `SELECT ra.id, ra.role_id, r.company_id, r.department, r.role_name,
              ra.full_name, ra.personal_number, ra.rank, ra.phone,
              ra.pending_pn, ra.pending_name, ra.is_posted
         FROM role_assignments ra
         JOIN roles r ON r.id = ra.role_id
         JOIN companies co ON co.id = r.company_id
        WHERE ra.id = $1 AND co.battalion_id = $2
        FOR UPDATE`,
      [assignmentId, battalionId],
      client
    );
    if (!source) return { ok: false, reason: "not_found" };

    if (target.kind === "bank") {
      await execute(
        `INSERT INTO bank_soldiers (company_id, department, full_name, personal_number, rank, pending_pn)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          source.company_id,
          source.department,
          source.full_name ?? "",
          source.personal_number,
          source.rank,
          source.pending_pn,
        ],
        client
      );
      await execute(`DELETE FROM role_assignments WHERE id = $1`, [source.id], client);
      return { ok: true };
    }

    const destRole = await queryOne<{ role_id: number; company_id: number }>(
      `SELECT r.id AS role_id, r.company_id
         FROM roles r
         JOIN companies co ON co.id = r.company_id
        WHERE r.id = $1 AND co.battalion_id = $2`,
      [target.role_id, battalionId],
      client
    );
    if (!destRole) return { ok: false, reason: "not_found" };

    const occupant = await queryOne<{
      id: number;
      full_name: string | null;
      personal_number: string | null;
      rank: string | null;
      phone: string | null;
      pending_pn: number;
      pending_name: number;
      is_posted: number;
    }>(
      `SELECT id, full_name, personal_number, rank, phone, pending_pn, pending_name, is_posted
         FROM role_assignments WHERE role_id = $1 FOR UPDATE`,
      [target.role_id],
      client
    );

    if (!occupant) {
      await execute(`UPDATE role_assignments SET role_id = $1 WHERE id = $2`, [target.role_id, source.id], client);
      return { ok: true };
    }

    await execute(
      `UPDATE role_assignments
          SET full_name = $1, personal_number = $2, rank = $3, phone = $4,
              pending_pn = $5, pending_name = $6, is_posted = $7
        WHERE id = $8`,
      [
        source.full_name,
        source.personal_number,
        source.rank,
        source.phone,
        source.pending_pn,
        source.pending_name,
        source.is_posted,
        occupant.id,
      ],
      client
    );
    await execute(
      `UPDATE role_assignments
          SET full_name = $1, personal_number = $2, rank = $3, phone = $4,
              pending_pn = $5, pending_name = $6, is_posted = $7
        WHERE id = $8`,
      [
        occupant.full_name,
        occupant.personal_number,
        occupant.rank,
        occupant.phone,
        occupant.pending_pn,
        occupant.pending_name,
        occupant.is_posted,
        source.id,
      ],
      client
    );
    return { ok: true };
  });
}

export async function placeBankOnRole(
  bankId: number,
  roleId: number,
  battalionId: number
): Promise<{ ok: true } | { ok: false; reason: "not_found" }> {
  return withTransaction(async (client) => {
    const bank = await queryOne<{
      id: number;
      company_id: number;
      department: string | null;
      full_name: string;
      personal_number: string | null;
      rank: string | null;
      pending_pn: number;
    }>(
      `SELECT bs.id, bs.company_id, bs.department, bs.full_name, bs.personal_number, bs.rank, bs.pending_pn
         FROM bank_soldiers bs
         JOIN companies co ON co.id = bs.company_id
        WHERE bs.id = $1 AND co.battalion_id = $2
        FOR UPDATE`,
      [bankId, battalionId],
      client
    );
    if (!bank) return { ok: false, reason: "not_found" };

    const destRole = await queryOne<{ role_id: number }>(
      `SELECT r.id AS role_id FROM roles r
         JOIN companies co ON co.id = r.company_id
        WHERE r.id = $1 AND co.battalion_id = $2`,
      [roleId, battalionId],
      client
    );
    if (!destRole) return { ok: false, reason: "not_found" };

    const occupant = await queryOne<{
      id: number;
      full_name: string | null;
      personal_number: string | null;
      rank: string | null;
      phone: string | null;
      pending_pn: number;
      pending_name: number;
    }>(
      `SELECT id, full_name, personal_number, rank, phone, pending_pn, pending_name
         FROM role_assignments WHERE role_id = $1 FOR UPDATE`,
      [roleId],
      client
    );

    if (!occupant) {
      await execute(
        `INSERT INTO role_assignments
           (role_id, full_name, personal_number, rank, is_posted, pending_pn, pending_name)
         VALUES ($1, $2, $3, $4, 1, $5, $6)`,
        [
          roleId,
          bank.full_name,
          bank.personal_number,
          bank.rank,
          bank.pending_pn,
          bank.full_name ? 0 : 1,
        ],
        client
      );
      await execute(`DELETE FROM bank_soldiers WHERE id = $1`, [bank.id], client);
      return { ok: true };
    }

    await execute(
      `UPDATE bank_soldiers
          SET full_name = $1, personal_number = $2, rank = $3, pending_pn = $4
        WHERE id = $5`,
      [
        occupant.full_name,
        occupant.personal_number,
        occupant.rank,
        occupant.pending_pn,
        bank.id,
      ],
      client
    );
    await execute(
      `UPDATE role_assignments
          SET full_name = $1, personal_number = $2, rank = $3, pending_pn = $4,
              pending_name = $5, is_posted = 1
        WHERE id = $6`,
      [
        bank.full_name,
        bank.personal_number,
        bank.rank,
        bank.pending_pn,
        bank.full_name ? 0 : 1,
        occupant.id,
      ],
      client
    );
    return { ok: true };
  });
}

// ---------------------------------------------------------------------------
// Cancellable edit sessions ("חזור" on the canvas).
//
// The canvas has no draft state: `moveAssignment` and `placeBankOnRole` above each commit
// as they are called, so by the time the user changes their mind the writes are already in
// the database. Backing out therefore means writing the people layer back to what it was
// when "מצב עריכה" opened, which is what these three functions do — open a session (take
// the snapshot), revert to it, or close it and keep the edits.
//
// Two things a revert must never do, and the reason each is structural rather than a
// matter of care:
//
//   1. TOUCH `roles`. The snapshot payload has no requirement columns in it, so there is
//      nothing for a revert to write back to the establishment even by accident (§0.3.1).
//
//   2. DELETE AND RE-INSERT THE WHOLE OF `role_assignments`. `gap_nominations` references
//      `role_assignments(id)` ON DELETE SET NULL under a CHECK that demands exactly one of
//      (role_assignment_id, free_text_name) — so deleting a nominated assignment turns
//      that row's link to NULL and trips the CHECK, aborting the transaction. The revert
//      below is keyed on `role_id` and UPDATEs the occupant columns of the row already
//      sitting on each post, exactly as a swap does, so a post that was occupied before
//      the session and after it keeps its assignment id and its nominations.
// ---------------------------------------------------------------------------

/**
 * One post's occupant, as it stood when the edit session opened. An alias rather than its
 * own shape, so the payload and what `planOccupancyRestore` reasons about cannot drift.
 */
export type SnapshotAssignment = OccupantFields;

/** One 120% bank member, as they stood when the edit session opened. */
export interface SnapshotBankSoldier {
  id: number;
  company_id: number;
  department: string | null;
  full_name: string;
  personal_number: string | null;
  rank: string | null;
  unavailable_until: string | null;
  note: string | null;
  pending_pn: number;
}

/**
 * The battalion's people layer at one instant. `version` is stored with the payload so a
 * snapshot written by an older deploy is refused rather than half-understood — a partial
 * read here would write a partly-wrong occupancy and call it a restore.
 */
export interface OccupancySnapshot {
  version: 1;
  assignments: SnapshotAssignment[];
  bank: SnapshotBankSoldier[];
}

const SNAPSHOT_VERSION = 1;

async function readOccupancy(battalionId: number, client: PoolClient) {
  const assignments = await query<SnapshotAssignment & Record<string, unknown>>(
    `SELECT ra.role_id, ra.full_name, ra.personal_number, ra.rank, ra.phone,
            ra.pending_pn, ra.pending_name, ra.is_posted
       FROM role_assignments ra
       JOIN roles r ON r.id = ra.role_id
       JOIN companies co ON co.id = r.company_id
      WHERE co.battalion_id = $1
      ORDER BY ra.role_id`,
    [battalionId],
    client
  );
  const bank = await query<SnapshotBankSoldier & Record<string, unknown>>(
    `SELECT bs.id, bs.company_id, bs.department, bs.full_name, bs.personal_number,
            bs.rank, bs.unavailable_until, bs.note, bs.pending_pn
       FROM bank_soldiers bs
       JOIN companies co ON co.id = bs.company_id
      WHERE co.battalion_id = $1
      ORDER BY bs.id`,
    [battalionId],
    client
  );
  return { assignments, bank };
}

/**
 * Opens an edit session: snapshots the battalion's people layer and returns the row id.
 *
 * The id is all the browser is given. The payload never leaves the server, which is what
 * keeps "חזור" from becoming a back door for writing arbitrary occupants — see the note in
 * migrations/postgres/020_force_structure_edit_snapshots.sql.
 */
export async function openEditSession(
  battalionId: number,
  userId: string,
  createdByRole: string | null
): Promise<{ snapshot_id: number }> {
  return withTransaction(async (client) => {
    // One live session per user per battalion. Leaving the previous one behind would let a
    // stale snapshot — taken before edits the user has since deliberately kept — be
    // reverted to later.
    await execute(
      `DELETE FROM force_structure_edit_snapshots
        WHERE battalion_id = $1 AND created_by_user = $2`,
      [battalionId, userId],
      client
    );

    const { assignments, bank } = await readOccupancy(battalionId, client);
    const payload: OccupancySnapshot = { version: SNAPSHOT_VERSION, assignments, bank };

    const row = await queryOne<{ id: number }>(
      `INSERT INTO force_structure_edit_snapshots
         (battalion_id, created_by_user, created_by_role, payload)
       VALUES ($1, $2, $3, $4::jsonb)
       RETURNING id`,
      [battalionId, userId, createdByRole, JSON.stringify(payload)],
      client
    );
    // RETURNING on a successful INSERT always yields the row; the throw is here so a
    // future change that drops it fails loudly instead of handing back NaN.
    if (!row) throw new Error("snapshot insert returned no id");
    return { snapshot_id: row.id };
  });
}

/** Closes an edit session and KEEPS the edits ("סיום עריכה"). Just drops the snapshot. */
export async function closeEditSession(
  snapshotId: number,
  battalionId: number,
  userId: string
): Promise<{ ok: boolean }> {
  const result = await execute(
    `DELETE FROM force_structure_edit_snapshots
      WHERE id = $1 AND battalion_id = $2 AND created_by_user = $3`,
    [snapshotId, battalionId, userId]
  );
  return { ok: result.rowCount > 0 };
}

/**
 * Reverts the battalion's people layer to the session's snapshot and closes the session.
 *
 * `reason: "stale"` means the snapshot no longer describes this battalion's establishment —
 * a post or company it names is gone, which only happens if the reference data was
 * re-imported mid-session. Applying the parts that still match would leave the occupancy
 * neither where the user left it nor where they started, so nothing is applied at all.
 */
export async function revertEditSession(
  snapshotId: number,
  battalionId: number,
  userId: string
): Promise<{ ok: true } | { ok: false; reason: "not_found" | "stale" | "unsupported_version" }> {
  return withTransaction(async (client) => {
    const session = await queryOne<{ payload: OccupancySnapshot }>(
      `SELECT payload FROM force_structure_edit_snapshots
        WHERE id = $1 AND battalion_id = $2 AND created_by_user = $3
        FOR UPDATE`,
      [snapshotId, battalionId, userId],
      client
    );
    if (!session) return { ok: false, reason: "not_found" as const };

    const snapshot = session.payload;
    if (snapshot?.version !== SNAPSHOT_VERSION) {
      return { ok: false, reason: "unsupported_version" as const };
    }

    // Every post and company the snapshot names must still be this battalion's. Checked up
    // front, before a single write, so a stale snapshot changes nothing.
    const roleIds = snapshot.assignments.map((a) => a.role_id);
    if (roleIds.length > 0) {
      const known = await query<{ id: number }>(
        `SELECT r.id FROM roles r
           JOIN companies co ON co.id = r.company_id
          WHERE co.battalion_id = $1 AND r.id = ANY($2::int[])`,
        [battalionId, roleIds],
        client
      );
      if (known.length !== roleIds.length) return { ok: false, reason: "stale" as const };
    }
    const companyIds = [...new Set(snapshot.bank.map((b) => b.company_id))];
    if (companyIds.length > 0) {
      const known = await query<{ id: number }>(
        `SELECT id FROM companies WHERE battalion_id = $1 AND id = ANY($2::int[])`,
        [battalionId, companyIds],
        client
      );
      if (known.length !== companyIds.length) return { ok: false, reason: "stale" as const };
    }

    // --- posts ------------------------------------------------------------
    const current = await query<{ id: number; role_id: number }>(
      `SELECT ra.id, ra.role_id
         FROM role_assignments ra
         JOIN roles r ON r.id = ra.role_id
         JOIN companies co ON co.id = r.company_id
        WHERE co.battalion_id = $1
        FOR UPDATE OF ra`,
      [battalionId],
      client
    );

    // Which post gets an UPDATE, a DELETE, or a new row — see lib/force-structure/restore-plan.ts
    // for why the match is on role_id and why an occupied post is rewritten rather than replaced.
    const plan = planOccupancyRestore(current, snapshot.assignments);

    // EVERY STEP BELOW IS ONE STATEMENT, whatever the row count. A battalion is ~380 posts
    // and ~55 bank members, and the first cut of this issued a round trip per row: against a
    // hosted Postgres that is some 900 sequential round trips inside one transaction, which
    // ran past the request timeout and rolled the whole revert back — the cancel appeared to
    // hang and then to have done nothing. Set-based statements keep it at six.

    if (plan.remove.length > 0) {
      // These posts were empty when the session opened.
      await execute(
        `DELETE FROM role_assignments WHERE id = ANY($1::int[])`,
        [plan.remove],
        client
      );
    }

    if (plan.update.length > 0) {
      // `role_id` is untouched, so the UNIQUE index on it never sees a collision mid-restore
      // and the assignment id survives for anything referencing it.
      await execute(
        `UPDATE role_assignments ra
            SET full_name = u.full_name, personal_number = u.personal_number,
                rank = u.rank, phone = u.phone,
                pending_pn = u.pending_pn, pending_name = u.pending_name,
                is_posted = u.is_posted
           FROM unnest($1::int[], $2::text[], $3::text[], $4::text[], $5::text[],
                       $6::smallint[], $7::smallint[], $8::smallint[])
             AS u(id, full_name, personal_number, rank, phone,
                  pending_pn, pending_name, is_posted)
          WHERE ra.id = u.id`,
        [
          plan.update.map((u) => u.id),
          plan.update.map((u) => u.occupant.full_name),
          plan.update.map((u) => u.occupant.personal_number),
          plan.update.map((u) => u.occupant.rank),
          plan.update.map((u) => u.occupant.phone),
          plan.update.map((u) => u.occupant.pending_pn),
          plan.update.map((u) => u.occupant.pending_name),
          plan.update.map((u) => u.occupant.is_posted),
        ],
        client
      );
    }

    // Posts that were occupied at snapshot time and are empty now. These get new ids: the
    // original rows were deleted when their occupant was moved to the bank.
    if (plan.insert.length > 0) {
      await execute(
        `INSERT INTO role_assignments
           (role_id, full_name, personal_number, rank, phone, pending_pn, pending_name, is_posted)
         SELECT * FROM unnest($1::int[], $2::text[], $3::text[], $4::text[], $5::text[],
                              $6::smallint[], $7::smallint[], $8::smallint[])`,
        [
          plan.insert.map((o) => o.role_id),
          plan.insert.map((o) => o.full_name),
          plan.insert.map((o) => o.personal_number),
          plan.insert.map((o) => o.rank),
          plan.insert.map((o) => o.phone),
          plan.insert.map((o) => o.pending_pn),
          plan.insert.map((o) => o.pending_name),
          plan.insert.map((o) => o.is_posted),
        ],
        client
      );
    }

    // --- bank -------------------------------------------------------------
    // Nothing references `bank_soldiers(id)`, so the bank is rebuilt wholesale rather than
    // reconciled row by row. Ids go back as they were, which keeps UNIQUE
    // (company_id, personal_number) satisfiable in any insert order — the snapshot came out
    // of the table under that same constraint — and leaves the panel's ids stable.
    await execute(
      `DELETE FROM bank_soldiers bs
        USING companies co
        WHERE co.id = bs.company_id AND co.battalion_id = $1`,
      [battalionId],
      client
    );
    if (snapshot.bank.length > 0) {
      await execute(
        `INSERT INTO bank_soldiers
           (id, company_id, department, full_name, personal_number, rank,
            unavailable_until, note, pending_pn)
         SELECT * FROM unnest($1::int[], $2::int[], $3::text[], $4::text[], $5::text[],
                              $6::text[], $7::text[], $8::text[], $9::smallint[])`,
        [
          snapshot.bank.map((b) => b.id),
          snapshot.bank.map((b) => b.company_id),
          snapshot.bank.map((b) => b.department),
          snapshot.bank.map((b) => b.full_name),
          snapshot.bank.map((b) => b.personal_number),
          snapshot.bank.map((b) => b.rank),
          snapshot.bank.map((b) => b.unavailable_until),
          snapshot.bank.map((b) => b.note),
          snapshot.bank.map((b) => b.pending_pn),
        ],
        client
      );
      // Explicit ids bypass the sequence, which would otherwise hand out an id that already
      // exists on the next bank insert.
      await execute(
        `SELECT setval(pg_get_serial_sequence('bank_soldiers', 'id'),
                       GREATEST(COALESCE((SELECT MAX(id) FROM bank_soldiers), 0), 1))`,
        [],
        client
      );
    }

    await execute(`DELETE FROM force_structure_edit_snapshots WHERE id = $1`, [snapshotId], client);
    return { ok: true as const };
  });
}
