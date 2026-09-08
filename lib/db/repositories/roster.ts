import { execute, query, queryOne, withTransaction } from "@/lib/db/client";
import type { PoolClient } from "pg";
import type { RosterEntry, RosterStatus } from "@/lib/types";
import { ACTIVE_ROSTER_STATUSES } from "@/lib/utils/slots";
import { isRegistrationLocked, type RegistrationLockFields } from "@/lib/utils/registration-lock";
import {
  REGISTRATION_OPEN_STATUSES,
  type AllocationMode,
  type RegistrationRefusal,
} from "@/lib/battalions/allocation-opportunities";
import { recordStatusChange } from "@/lib/db/repositories/audit";
import { createNotification } from "@/lib/db/repositories/notifications";
import type { BattalionQuotaUsage } from "@/lib/battalions/types";

export type { BattalionQuotaUsage } from "@/lib/battalions/types";

export async function listRosterForCertification(certificationId: number): Promise<RosterEntry[]> {
  return query<RosterEntry>(
    "SELECT * FROM roster_entries WHERE certification_id = $1 AND is_reserve = 0 ORDER BY created_at ASC",
    [certificationId]
  );
}

export async function listReserveForCertification(certificationId: number): Promise<RosterEntry[]> {
  return query<RosterEntry>(
    "SELECT * FROM roster_entries WHERE certification_id = $1 AND is_reserve = 1 ORDER BY created_at ASC",
    [certificationId]
  );
}

/** The battalion's soldiers on actual certifications. `certification_id IS NOT NULL`
 * keeps request-stage soldiers (attached to a request, no certification yet) out — this
 * list is about certification participation. */
export async function listRosterForBattalion(battalionId: number): Promise<RosterEntry[]> {
  return query<RosterEntry>(
    "SELECT * FROM roster_entries WHERE battalion_id = $1 AND certification_id IS NOT NULL ORDER BY created_at DESC",
    [battalionId]
  );
}

/** One battalion's soldiers on one certification — reserve included, so the battalion
 * sees its whole list. Never returns another battalion's rows. */
export async function listRosterForBattalionCertification(
  certificationId: number,
  battalionId: number
): Promise<RosterEntry[]> {
  return query<RosterEntry>(
    `SELECT * FROM roster_entries
      WHERE certification_id = $1 AND battalion_id = $2
      ORDER BY is_reserve ASC, created_at ASC, id ASC`,
    [certificationId, battalionId]
  );
}

/** Soldiers attached to a certification request (request-stage: certification_id NULL). */
export async function listRosterForRequest(requestId: number): Promise<RosterEntry[]> {
  return query<RosterEntry>(
    "SELECT * FROM roster_entries WHERE battalion_request_id = $1 ORDER BY created_at ASC, id ASC",
    [requestId]
  );
}

/** A soldier attached to a request. Same fields as a roster entry minus anything
 * certification-specific — there is no certification yet. */
export interface RequestSoldierInput {
  battalion_id: number;
  full_name: string;
  personal_number: string;
  company_platoon?: string | null;
  phone?: string | null;
  commander_name?: string | null;
  commander_phone?: string | null;
  has_prior_certification?: boolean;
  requires_lodging?: boolean;
  is_reserve?: boolean;
  notes?: string | null;
}

/**
 * Inserts a batch of request-stage soldiers into `roster_entries` with
 * `certification_id` NULL. Takes a `PoolClient` so it runs inside the caller's
 * transaction — the request and its soldiers are created atomically.
 */
export async function addRequestRosterEntries(
  battalionRequestId: number,
  soldiers: RequestSoldierInput[],
  client: PoolClient
): Promise<number[]> {
  const ids: number[] = [];
  for (const soldier of soldiers) {
    const result = await execute(
      `INSERT INTO roster_entries
          (certification_id, battalion_request_id, battalion_id, full_name, personal_number,
           company_platoon, phone, commander_name, commander_phone,
           has_prior_certification, requires_lodging, is_reserve, notes)
         VALUES (NULL, $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       RETURNING id`,
      [
        battalionRequestId,
        soldier.battalion_id,
        soldier.full_name,
        soldier.personal_number,
        soldier.company_platoon ?? null,
        soldier.phone ?? null,
        soldier.commander_name ?? null,
        soldier.commander_phone ?? null,
        soldier.has_prior_certification ? 1 : 0,
        soldier.requires_lodging ? 1 : 0,
        soldier.is_reserve ? 1 : 0,
        soldier.notes ?? null,
      ],
      client
    );
    ids.push((result.rows[0] as { id: number }).id);
  }
  return ids;
}

export async function getRosterEntry(id: number): Promise<RosterEntry | undefined> {
  return queryOne<RosterEntry>("SELECT * FROM roster_entries WHERE id = $1", [id]);
}

export interface RosterEntryInput {
  certification_id: number;
  battalion_id: number;
  full_name: string;
  personal_number: string;
  company_platoon?: string | null;
  phone?: string | null;
  commander_name?: string | null;
  commander_phone?: string | null;
  has_prior_certification?: boolean;
  prior_certification_details?: string | null;
  requires_lodging?: boolean;
  meets_prerequisite?: boolean | null;
  notes?: string | null;
  is_reserve?: boolean;
}

/**
 * The certification's single registration deadline — DATE AND HOUR — read inside the
 * caller's transaction so the check and the insert cannot straddle an editor changing it.
 *
 * Both columns travel together (migration 022): reading the date alone would silently
 * reinstate the old end-of-day rule and keep registration open for up to a further day
 * past the hour the units were given. The DEPRECATED per-allocation
 * `certification_battalion_quotas.registration_lock_at` is still not consulted — a second
 * source would mean two answers to "is registration closed".
 */
async function certificationLock(
  certificationId: number,
  client?: PoolClient
): Promise<RegistrationLockFields> {
  const row = await queryOne<RegistrationLockFields>(
    `SELECT registration_lock_date, registration_lock_hour FROM certifications WHERE id = $1`,
    [certificationId],
    client
  );
  return {
    registration_lock_date: row?.registration_lock_date ?? null,
    registration_lock_hour: row?.registration_lock_hour ?? null,
  };
}

export type RosterAddResult = { ok: true; id: number } | { ok: false; reason: "registration_locked" };

/**
 * Adds a soldier from the brigade-side הסמכות screen.
 *
 * THE DEADLINE BINDS HERE TOO. It used to be checked only on the battalion path, so a
 * global editor could keep registering after the date the battalions were locked out on —
 * the deadline was really "a deadline for battalions". One certification, one date, one rule
 * for everybody.
 */
export async function addRosterEntry(
  input: RosterEntryInput,
  changedByRole: string
): Promise<RosterAddResult> {
  return withTransaction<RosterAddResult>(async (client) => {
    if (input.certification_id !== null && input.certification_id !== undefined) {
      const lock = await certificationLock(input.certification_id, client);
      if (isRegistrationLocked(lock)) return { ok: false, reason: "registration_locked" };
    }
    return { ok: true, id: await insertRosterEntry(input, changedByRole, client) };
  });
}

/** The insert itself, on a caller-supplied transaction. Extracted so the quota-checked
 * battalion path below can run the check and the insert under one transaction. */
async function insertRosterEntry(
  input: RosterEntryInput,
  changedByRole: string,
  client: PoolClient
): Promise<number> {
  const result = await execute(
    `INSERT INTO roster_entries
          (certification_id, battalion_id, full_name, personal_number, company_platoon, phone,
           commander_name, commander_phone, has_prior_certification, prior_certification_details,
           requires_lodging, meets_prerequisite, notes, is_reserve)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
         RETURNING id`,
    [
      input.certification_id,
      input.battalion_id,
      input.full_name,
      input.personal_number,
      input.company_platoon ?? null,
      input.phone ?? null,
      input.commander_name ?? null,
      input.commander_phone ?? null,
      input.has_prior_certification ? 1 : 0,
      input.prior_certification_details ?? null,
      input.requires_lodging ? 1 : 0,
      input.meets_prerequisite === undefined || input.meets_prerequisite === null
        ? null
        : input.meets_prerequisite
        ? 1
        : 0,
      input.notes ?? null,
      input.is_reserve ? 1 : 0,
    ],
    client
  );
  const id = (result.rows[0] as { id: number }).id;
  await recordStatusChange("roster_entry", id, null, "registered", changedByRole, undefined, client);

  const cert = await queryOne<{ name: string }>(
    "SELECT name FROM certifications WHERE id = $1", [input.certification_id], client
  );
  await createNotification({
    type: "soldier_added",
    target_role: "brigade",
    entity_type: "roster_entry",
    entity_id: id,
    message: `${input.full_name} נרשם להסמכה "${cert?.name ?? ""}"`,
  }, client);
  return id;
}

// --- Battalion-scoped registration against an allocation ---------------------------
// A battalion editor registers its own soldiers on a certification, bounded by the number
// of slots the brigade allocated to that battalion (`certification_battalion_quotas`).
// Reserve (עתודה) soldiers sit outside the allocation and are not counted against it —
// the same rule the certification's own slot count already uses.

/** How much of `battalionId`'s allocation on `certificationId` is currently taken.
 * Only non-reserve entries in an active status occupy a slot, mirroring the
 * certification-level count in `withCounts()`. */
export async function countBattalionQuotaUsage(
  certificationId: number,
  battalionId: number,
  client?: PoolClient
): Promise<number> {
  const row = await queryOne<{ c: number }>(
    `SELECT COUNT(*)::int as c FROM roster_entries
      WHERE certification_id = $1 AND battalion_id = $2 AND is_reserve = 0
        AND status = ANY($3::text[])`,
    [certificationId, battalionId, ACTIVE_ROSTER_STATUSES],
    client
  );
  return row?.c ?? 0;
}

/**
 * What this battalion may do on this certification, in ONE query.
 *
 * MODE A vs MODE B. Zero rows in `certification_battalion_quotas` for the certification
 * means it is open to every battalion: the pool is the certification's own `total_slots`,
 * shared, and any battalion may register into it. That is the case this used to get wrong —
 * it read only this battalion's quota row, found none, and reported `allocated: null`,
 * which the panel rendered as "no seats were allocated to you" and the API turned into a
 * `no_quota` refusal, while the opportunities band was advertising the very same
 * certification as joinable.
 *
 * When quota rows DO exist the behaviour is unchanged: this battalion's own
 * `allocated_slots` is the pool, and a battalion without a row is genuinely not invited.
 *
 * NO N+1: one statement resolves the status, the capacity, whether any quota exists, this
 * battalion's own quota and the occupancy counts. עתודה is excluded from occupancy in both
 * modes — a reserve soldier holds no seat.
 */
export async function getBattalionQuotaUsage(
  certificationId: number,
  battalionId: number
): Promise<BattalionQuotaUsage> {
  const row = await queryOne<EligibilityRow>(ELIGIBILITY_SQL, [certificationId, battalionId]);

  const lock: RegistrationLockFields = {
    registration_lock_date: row?.registration_lock_date ?? null,
    registration_lock_hour: row?.registration_lock_hour ?? null,
  };
  const view = eligibilityOf(row);

  return {
    allocated: view.seats,
    used: view.taken,
    reserve: row?.reserve_mine ?? 0,
    remaining: view.remaining,
    mode: view.mode,
    missing_quota: view.missingQuota,
    registration_open: view.statusAllowsRegistration,
    registration_lock_date: lock.registration_lock_date,
    registration_lock_hour: lock.registration_lock_hour ?? null,
    locked: isRegistrationLocked(lock),
  };
}

/**
 * The eligibility statement. Shared verbatim by {@link getBattalionQuotaUsage}, which
 * renders the panel, and {@link addBattalionRosterEntry}, which authorises the write — so
 * the button and the endpoint cannot disagree about whether a seat exists.
 *
 * `$1` certification id · `$2` battalion id.
 */
const ELIGIBILITY_SQL = `SELECT c.status,
         c.total_slots,
         c.registration_lock_date,
         c.registration_lock_hour,
         (SELECT COUNT(*)::int FROM certification_battalion_quotas q
           WHERE q.certification_id = c.id) AS quota_rows,
         qm.allocated_slots AS my_allocated,
         COALESCE(occ.everyone, 0) AS taken_everyone,
         COALESCE(occ.mine, 0) AS taken_mine,
         COALESCE(occ.reserve_mine, 0) AS reserve_mine
    FROM certifications c
    LEFT JOIN certification_battalion_quotas qm
      ON qm.certification_id = c.id AND qm.battalion_id = $2
    LEFT JOIN (
      -- One pass, three counts. is_reserve = 0 on the two occupancy counts is what keeps
      -- עתודה out of the seat maths in both modes.
      SELECT re.certification_id,
             COUNT(*) FILTER (WHERE re.is_reserve = 0)::int AS everyone,
             COUNT(*) FILTER (WHERE re.is_reserve = 0 AND re.battalion_id = $2)::int AS mine,
             COUNT(*) FILTER (WHERE re.is_reserve = 1 AND re.battalion_id = $2)::int AS reserve_mine
        FROM roster_entries re
       WHERE re.certification_id = $1
       GROUP BY re.certification_id
    ) occ ON occ.certification_id = c.id
   WHERE c.id = $1`;

export interface EligibilityRow {
  status: string;
  total_slots: number | null;
  quota_rows: number;
  my_allocated: number | null;
  taken_everyone: number;
  taken_mine: number;
  reserve_mine: number;
  registration_lock_date: string | null;
  registration_lock_hour: number | null;
}

export interface EligibilityView {
  mode: AllocationMode;
  /** Seats in the pool that applies to this battalion. NULL = unlimited. */
  seats: number | null;
  /** Non-reserve entries occupying that pool. */
  taken: number;
  /** seats − taken, floored at 0. NULL when unlimited. */
  remaining: number | null;
  statusAllowsRegistration: boolean;
  /** Mode B only: this battalion holds no allocation, so it was not invited. */
  missingQuota: boolean;
}

/**
 * Folds one eligibility row into the numbers both callers need.
 *
 * A NULL pool is UNLIMITED and stays NULL the whole way through — never 0, and never a
 * subtraction against NULL, which is how "unlimited" quietly becomes "full".
 */
export function eligibilityOf(row: EligibilityRow | undefined): EligibilityView {
  if (!row) {
    return {
      mode: "battalion_quota",
      seats: null,
      taken: 0,
      remaining: null,
      statusAllowsRegistration: false,
      missingQuota: true,
    };
  }
  const openToAll = row.quota_rows === 0;
  const seats = openToAll ? row.total_slots : row.my_allocated;
  const taken = openToAll ? row.taken_everyone : row.taken_mine;
  return {
    mode: openToAll ? "open_to_all" : "battalion_quota",
    seats,
    taken,
    remaining: seats === null ? null : Math.max(seats - taken, 0),
    statusAllowsRegistration: (REGISTRATION_OPEN_STATUSES as string[]).includes(row.status),
    missingQuota: !openToAll && row.my_allocated === null,
  };
}

/** Why a registration was refused. Re-exported from the shared module so the repository,
 * the API's Hebrew message map and the panel's banner name the same cases. */
export type QuotaRefusal = RegistrationRefusal;

export type BattalionRosterResult =
  | { ok: true; id: number }
  | { ok: false; reason: QuotaRefusal; allocated?: number; used?: number };

/**
 * Adds one soldier of `input.battalion_id` to a certification, from the battalion route.
 *
 * WHAT IT REFUSES, AND WHY EACH CASE EXISTS:
 *   not_open            — the status does not admit registration. A טיוטה is brigade
 *                         working state: its dates can still move and it can be cancelled,
 *                         so a battalion must not staff it. The brigade route
 *                         (`addRosterEntry`) is deliberately NOT subject to this — the
 *                         brigade staffing its own draft is how one gets built.
 *   no_quota            — Mode B, and this battalion was given no allocation.
 *   quota_exceeded      — Mode B, and this battalion's allocation is full.
 *   capacity_full       — Mode A, and the shared pool is full.
 *   registration_locked — the deadline has passed.
 *
 * SEAT LIMITS ARE ENFORCED HERE, not merely by hiding a button: a hand-made POST that
 * would oversubscribe `total_slots` is refused on this path.
 *
 * `FOR UPDATE` IS TAKEN ON THE CERTIFICATION ROW, not on the quota row as before. In Mode A
 * the contended resource is the certification's shared pool, which no quota row represents;
 * locking the certification serialises both modes under one rule, so two simultaneous
 * registrations cannot read the same last free seat and both take it.
 *
 * The insert is `insertRosterEntry` — the same function the brigade route calls — so
 * validation, duplicate handling and the audit record are identical on both paths.
 */
export async function addBattalionRosterEntry(
  input: RosterEntryInput,
  changedByRole: string
): Promise<BattalionRosterResult> {
  return withTransaction<BattalionRosterResult>(async (client) => {
    // Taken before the counts are read, so they cannot go stale underneath us.
    await execute(
      `SELECT id FROM certifications WHERE id = $1 FOR UPDATE`,
      [input.certification_id],
      client
    );

    const row = await queryOne<EligibilityRow>(
      ELIGIBILITY_SQL,
      [input.certification_id, input.battalion_id],
      client
    );
    if (!row) return { ok: false, reason: "no_quota" };

    const view = eligibilityOf(row);

    if (!view.statusAllowsRegistration) return { ok: false, reason: "not_open" };
    if (view.missingQuota) return { ok: false, reason: "no_quota" };
    if (isRegistrationLocked(row)) return { ok: false, reason: "registration_locked" };

    // עתודה sits outside the pool by design, so it is never bounded by it.
    if (!input.is_reserve && view.remaining !== null && view.remaining < 1) {
      return {
        ok: false,
        reason: view.mode === "open_to_all" ? "capacity_full" : "quota_exceeded",
        allocated: view.seats ?? undefined,
        used: view.taken,
      };
    }

    return { ok: true, id: await insertRosterEntry(input, changedByRole, client) };
  });
}

export async function updateRosterEntry(id: number, input: Partial<RosterEntryInput>) {
  const existing = await getRosterEntry(id);
  if (!existing) throw new Error("Roster entry not found");
  await execute(
    `UPDATE roster_entries SET
      battalion_id = $1, full_name = $2, personal_number = $3, company_platoon = $4, phone = $5,
      commander_name = $6, commander_phone = $7, has_prior_certification = $8,
      prior_certification_details = $9, requires_lodging = $10, meets_prerequisite = $11,
      notes = $12, is_reserve = $13,
      updated_at = NOW()
     WHERE id = $14`,
  [
    input.battalion_id ?? existing.battalion_id,
    input.full_name ?? existing.full_name,
    input.personal_number ?? existing.personal_number,
    input.company_platoon ?? existing.company_platoon,
    input.phone ?? existing.phone,
    input.commander_name ?? existing.commander_name,
    input.commander_phone ?? existing.commander_phone,
    input.has_prior_certification !== undefined
      ? input.has_prior_certification
        ? 1
        : 0
      : existing.has_prior_certification,
    input.prior_certification_details ?? existing.prior_certification_details,
    // `!== undefined`, NOT `??`: `??` would treat an explicit `false` as absent and keep
    // the stored 1, so unticking the box would never save. Same guard as the sibling flag
    // three lines up.
    input.requires_lodging !== undefined
      ? input.requires_lodging
        ? 1
        : 0
      : existing.requires_lodging,
    input.meets_prerequisite !== undefined
      ? input.meets_prerequisite === null
        ? null
        : input.meets_prerequisite
        ? 1
        : 0
      : existing.meets_prerequisite,
    input.notes ?? existing.notes,
    input.is_reserve !== undefined ? (input.is_reserve ? 1 : 0) : existing.is_reserve,
    id,
  ]);
}

export async function updateRosterStatus(
  id: number,
  newStatus: RosterStatus,
  changedByRole: string,
  note?: string,
  outcomeReason?: string
) {
  const existing = await getRosterEntry(id);
  if (!existing) throw new Error("Roster entry not found");

  await withTransaction(async (client) => {
    await execute(
      `UPDATE roster_entries SET status = $1, outcome_reason = $2, updated_at = NOW() WHERE id = $3`,
      [newStatus, outcomeReason ?? existing.outcome_reason, id],
      client
    );
    await recordStatusChange("roster_entry", id, existing.status, newStatus, changedByRole, note, client);

    if (newStatus === "approved" || newStatus === "rejected") {
      const battalion = await queryOne<{ code: string }>(
        "SELECT code FROM battalions WHERE id = $1", [existing.battalion_id], client
      );
      await createNotification({
        type: newStatus === "approved" ? "soldier_approved" : "soldier_rejected",
        target_role: `battalion:${battalion?.code ?? existing.battalion_id}`,
        entity_type: "roster_entry",
        entity_id: id,
        message: `${existing.full_name} ${newStatus === "approved" ? "אושר" : "נדחה"} להסמכה`,
      }, client);
    }
  });
}

export async function deleteRosterEntry(id: number) {
  await execute("DELETE FROM roster_entries WHERE id = $1", [id]);
}

/** Battalion approves its trainee list for a certification allocation: submits its
 * still-`registered` (non-reserve) entries to `pending_approval` for brigade review.
 * The registration-lock deadline is enforced by the caller (API) before this runs.
 * Returns the number of entries submitted. */
export async function approveTraineeList(
  certificationId: number,
  battalionId: number,
  changedByRole: string
): Promise<number> {
  const entries = await query<{ id: number; status: string }>(
    `SELECT id, status FROM roster_entries
      WHERE certification_id = $1 AND battalion_id = $2 AND is_reserve = 0 AND status = 'registered'`,
    [certificationId, battalionId]
  );
  if (entries.length === 0) return 0;

  await withTransaction(async (client) => {
    for (const entry of entries) {
      await execute(
        `UPDATE roster_entries SET status = 'pending_approval', updated_at = NOW() WHERE id = $1`,
        [entry.id],
        client
      );
      await recordStatusChange(
        "roster_entry",
        entry.id,
        entry.status,
        "pending_approval",
        changedByRole,
        "אושרה רשימת מתאמנים ע\"י הגדוד",
        client
      );
    }
    await createNotification(
      {
        type: "soldier_added",
        target_role: "brigade",
        entity_type: "certification",
        entity_id: certificationId,
        message: `גדוד אישר רשימת ${entries.length} מתאמנים להסמכה`,
      },
      client
    );
  });
  return entries.length;
}
