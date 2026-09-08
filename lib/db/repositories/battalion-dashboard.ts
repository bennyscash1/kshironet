import { query, queryOne, execute } from "@/lib/db/client";
import { ACTIVE_ROSTER_STATUSES } from "@/lib/utils/slots";
import {
  daysUntil,
  openAllocationsOf,
  remainingAllocatedSlots,
} from "@/lib/battalions/open-allocations";
import { appTodayIso } from "@/lib/calendar/anchor";
import {
  REGISTRATION_OPEN_STATUSES,
  type AllocationOpportunity,
} from "@/lib/battalions/allocation-opportunities";
import type { CertificationStatus } from "@/lib/types";
import type {
  AdminConfirmationRow,
  AllocationSoldier,
  BattalionAllocation,
  BattalionTask,
  QuarterKpi,
} from "@/lib/battalions/types";

export type {
  AdminConfirmationRow,
  AllocationSoldier,
  BattalionAllocation,
  BattalionTask,
  QuarterKpi,
} from "@/lib/battalions/types";
export { openAllocationsOf } from "@/lib/battalions/open-allocations";

const COUNTED_STATUSES = ACTIVE_ROSTER_STATUSES;

/**
 * Every certification this battalion has a STAKE in, with its soldiers.
 *
 * A stake is either side of the relationship, and it has to be either side:
 *   (a) the brigade allocated the battalion slots  (certification_battalion_quotas), or
 *   (b) the battalion has a soldier on the roster  (roster_entries).
 *
 * This used to be an INNER JOIN on the quota table, which silently dropped every
 * certification a battalion had soldiers on without a quota row. The mirror-image bug is
 * the one that actually bit: a brigade user opens a certification and allocates the
 * battalion slots but assigns nobody yet — the battalion has a real stake in that week and
 * saw nothing. Both directions are now covered by one LEFT JOIN pair plus an OR.
 *
 * DEDUPLICATION IS STRUCTURAL, not a DISTINCT: the quota join is on
 * (certification_id, battalion_id) and the roster side is pre-aggregated to one row per
 * certification, so neither can fan the certification out. A UNION would have needed a
 * DISTINCT and would have run the scan twice.
 *
 * NO N+1: the roster counts come from ONE grouped subquery over this battalion's rows, not
 * a correlated count per certification and not a query per row.
 *
 * `remaining` uses the same definition as `getBattalionSummary`: allocated minus
 * non-reserve soldiers in an active status, and null when there is no allocation to
 * subtract from. Filtering to "still open" is {@link isOpenAllocation} — call that rather
 * than reimplementing it.
 */
/** Inclusive 'yyyy-MM-dd' bounds. */
export interface DateRange {
  from: string;
  to: string;
}

export async function listBattalionAllocations(
  battalionId: number,
  range?: DateRange
): Promise<BattalionAllocation[]> {
  const rows = await query<{
    certification_id: number;
    name: string;
    location: string | null;
    start_date: string;
    end_date: string | null;
    status: CertificationStatus;
    color_hex: string | null;
    allocated_slots: number | null;
    registration_lock_date: string | null;
    registration_lock_hour: number | null;
    has_quota: boolean;
    has_roster: boolean;
    registered: number;
    reserve: number;
  }>(
    `SELECT c.id AS certification_id, c.name, c.location, c.start_date, c.end_date, c.status,
            c.color_hex, q.allocated_slots, c.registration_lock_date, c.registration_lock_hour,
            (q.certification_id IS NOT NULL) AS has_quota,
            (r.certification_id IS NOT NULL) AS has_roster,
            COALESCE(r.registered, 0) AS registered,
            COALESCE(r.reserve, 0) AS reserve
       FROM certifications c
       LEFT JOIN certification_battalion_quotas q
         ON q.certification_id = c.id AND q.battalion_id = $1
       LEFT JOIN (
         -- One pass over this battalion's roster rows, grouped. has_roster is the mere
         -- EXISTENCE of a row and is deliberately NOT (registered > 0): a battalion whose
         -- only soldier is on the reserve list, or was rejected, still has a stake worth
         -- showing.
         SELECT re.certification_id,
                COUNT(*) FILTER (
                  WHERE re.is_reserve = 0 AND re.status = ANY($2::text[])
                )::int AS registered,
                COUNT(*) FILTER (WHERE re.is_reserve = 1)::int AS reserve
           FROM roster_entries re
          WHERE re.battalion_id = $1 AND re.certification_id IS NOT NULL
          GROUP BY re.certification_id
       ) r ON r.certification_id = c.id
      WHERE c.status != 'cancelled'
        AND (q.certification_id IS NOT NULL OR r.certification_id IS NOT NULL)
        -- Overlap, not containment: a certification running Sun–Thu belongs to the week
        -- even if it started the previous one. A missing/empty end_date is a single-day
        -- cycle, so it falls back to start_date.
        -- Dates are TEXT 'yyyy-MM-dd', which sorts lexicographically, so these compare
        -- correctly without any parsing or timezone conversion.
        AND ($3::text IS NULL OR (
              c.start_date <= $4::text
          AND COALESCE(NULLIF(c.end_date, ''), c.start_date) >= $3::text
        ))
      ORDER BY c.start_date ASC, c.id ASC`,
    [battalionId, COUNTED_STATUSES, range?.from ?? null, range?.to ?? null]
  );

  // Scoped to the certifications just returned, so a one-week export does not pull every
  // soldier the battalion has ever registered. Still one query, not one per certification.
  const certIds = rows.map((r) => r.certification_id);
  const soldiers = certIds.length
    ? await query<AllocationSoldier & { certification_id: number }>(
        `SELECT re.id, re.certification_id, re.full_name, re.personal_number, re.company_platoon,
                re.phone, re.is_reserve, re.status, re.meets_prerequisite
           FROM roster_entries re
          WHERE re.battalion_id = $1 AND re.certification_id = ANY($2::int[])
          ORDER BY re.is_reserve ASC, re.created_at ASC, re.id ASC`,
        [battalionId, certIds]
      )
    : [];

  const byCert = new Map<number, AllocationSoldier[]>();
  for (const s of soldiers) {
    const list = byCert.get(s.certification_id) ?? [];
    list.push(s);
    byCert.set(s.certification_id, list);
  }

  return rows.map((r) => ({
    ...r,
    // null, not 0: "no allocation" and "an allocation with nothing left" are different
    // states, and a 0 here would make a roster-only certification look full.
    remaining: remainingAllocatedSlots(r.allocated_slots, r.registered),
    daysToClose: daysUntil(r.registration_lock_date),
    soldiers: byCert.get(r.certification_id) ?? [],
  }));
}

/**
 * The opportunity statement, exported so the integration suite can run the EXACT SQL
 * this function runs against seeded fixtures inside a rolled-back transaction. A test
 * that retyped the query would only prove the copy correct.
 *
 * $1 battalion id · $2 statuses that permit registration · $3 today (Asia/Jerusalem).
 */
export const ALLOCATION_OPPORTUNITIES_SQL = `SELECT c.id AS certification_id, c.name, c.location, c.start_date, c.end_date,
            c.status, c.color_hex,
            c.registration_lock_date, c.registration_lock_hour,
            CASE WHEN q_any.certification_id IS NULL THEN 'open_to_all'
                 ELSE 'battalion_quota' END AS mode,
            CASE WHEN q_any.certification_id IS NULL THEN c.total_slots
                 ELSE q_mine.allocated_slots END AS seats,
            CASE WHEN q_any.certification_id IS NULL
                 THEN COALESCE(occupied.everyone, 0)
                 ELSE COALESCE(occupied.mine, 0) END AS taken,
            CASE
              WHEN (CASE WHEN q_any.certification_id IS NULL THEN c.total_slots
                         ELSE q_mine.allocated_slots END) IS NULL THEN NULL
              ELSE GREATEST(
                (CASE WHEN q_any.certification_id IS NULL THEN c.total_slots
                      ELSE q_mine.allocated_slots END)
                - (CASE WHEN q_any.certification_id IS NULL
                        THEN COALESCE(occupied.everyone, 0)
                        ELSE COALESCE(occupied.mine, 0) END),
                0)
            END::int AS remaining
       FROM certifications c
       -- Does ANY battalion hold an allocation here? That, and not this battalion's own
       -- row, is what separates a shared pool from a targeted allocation.
       LEFT JOIN (
         SELECT DISTINCT certification_id FROM certification_battalion_quotas
       ) q_any ON q_any.certification_id = c.id
       LEFT JOIN certification_battalion_quotas q_mine
         ON q_mine.certification_id = c.id AND q_mine.battalion_id = $1
       LEFT JOIN (
         -- One pass, two counts. עתודה is excluded from BOTH: a reserve soldier occupies
         -- no seat, so a cycle whose only names are reserve still has every seat open.
         SELECT re.certification_id,
                COUNT(*) FILTER (WHERE re.is_reserve = 0)::int AS everyone,
                COUNT(*) FILTER (WHERE re.is_reserve = 0 AND re.battalion_id = $1)::int AS mine
           FROM roster_entries re
          WHERE re.certification_id IS NOT NULL
          GROUP BY re.certification_id
       ) occupied ON occupied.certification_id = c.id
      WHERE c.status = ANY($2::text[])
        -- Expired cycles are not opportunities. A NULL/empty end_date is a one-day cycle,
        -- so it falls back to start_date; ending TODAY still counts as open.
        AND COALESCE(NULLIF(c.end_date, ''), c.start_date) >= $3::text
        -- A targeted allocation belongs to this battalion only. Without this, every
        -- battalion would see every other battalion's allocations.
        AND (q_any.certification_id IS NULL OR q_mine.certification_id IS NOT NULL)
        -- Seats must actually remain. NULL is unlimited and must survive the filter.
        AND (
          CASE WHEN q_any.certification_id IS NULL THEN c.total_slots
               ELSE q_mine.allocated_slots END IS NULL
          OR (CASE WHEN q_any.certification_id IS NULL THEN c.total_slots
                   ELSE q_mine.allocated_slots END)
             > (CASE WHEN q_any.certification_id IS NULL
                     THEN COALESCE(occupied.everyone, 0)
                     ELSE COALESCE(occupied.mine, 0) END)
        )
      ORDER BY c.start_date ASC, c.id ASC`;

/**
 * Every certification this battalion can still put names on TODAY, in both allocation
 * modes, from ONE query.
 *
 * This is the single source the dashboard band, the calendar highlight, the band's counter
 * line and the weekly PDF all read. Previously the band and the calendar each decided
 * eligibility for themselves with different predicates, which is why a half-filled
 * allocation could be listed as open and left unpainted on the same screen.
 *
 * MODE IS DERIVED FROM THE ABSENCE OF QUOTA ROWS. `q_any` asks whether the certification
 * has ANY allocation at all; `q_mine` asks whether this battalion has one. No rows anywhere
 * means the seat pool is shared — "open to all" — which the previous Group B query got
 * right but the Group A path never considered, because it resolved battalion quotas only
 * and therefore could not see an open-to-all cycle.
 *
 * EXPIRY IS ASIA/JERUSALEM, NOT UTC. `$3` is today's civil date resolved through
 * `appTodayIso()`, the same helper the calendar anchors on, so a cycle ending today stays
 * listed until Israeli midnight rather than dropping off at 03:00 local when a UTC host
 * ticks over. The comparison is on TEXT 'yyyy-MM-dd', which sorts lexicographically, so it
 * needs no parsing and no timezone conversion of its own.
 *
 * NO N+1: the roster occupancy for every candidate certification comes from one
 * pre-grouped subquery, not a count per row.
 */
export async function listAllocationOpportunities(
  battalionId: number,
  today: string = appTodayIso()
): Promise<AllocationOpportunity[]> {
  const rows = await query<Omit<AllocationOpportunity, "daysToClose">>(
    ALLOCATION_OPPORTUNITIES_SQL,
    [battalionId, REGISTRATION_OPEN_STATUSES, today]
  );

  return rows.map((r) => ({ ...r, daysToClose: daysUntil(r.registration_lock_date) }));
}

/** `status='passed'` whose certification ended in the current quarter. */
export async function getQuarterCompletion(battalionId: number): Promise<QuarterKpi> {
  const row = await queryOne<QuarterKpi>(
    `SELECT
       COUNT(*) FILTER (WHERE re.status = 'passed')::int AS passed,
       COUNT(*) FILTER (WHERE re.status = ANY($2::text[]))::int AS registered
       FROM roster_entries re
       JOIN certifications c ON c.id = re.certification_id
      WHERE re.battalion_id = $1 AND re.is_reserve = 0
        AND date_trunc('quarter', COALESCE(NULLIF(c.end_date, '')::date, c.start_date::date))
            = date_trunc('quarter', CURRENT_DATE)`,
    [battalionId, COUNTED_STATUSES]
  );
  return row ?? { passed: 0, registered: 0 };
}

export async function listAdminConfirmations(
  battalionId: number
): Promise<AdminConfirmationRow[]> {
  return query<AdminConfirmationRow>(
    `SELECT re.id AS roster_entry_id, re.full_name, re.personal_number,
            c.id AS certification_id, c.name AS certification_name, c.end_date,
            GREATEST(
              (CURRENT_DATE - COALESCE(NULLIF(c.end_date, '')::date, CURRENT_DATE)),
              0
            )::int AS waiting_days,
            rac.confirmed_at::text AS confirmed_at
       FROM roster_entries re
       JOIN certifications c ON c.id = re.certification_id
       LEFT JOIN roster_admin_confirmations rac ON rac.roster_entry_id = re.id
      WHERE re.battalion_id = $1 AND re.status = 'passed' AND re.is_reserve = 0
      ORDER BY (rac.confirmed_at IS NOT NULL), waiting_days DESC, re.id`,
    [battalionId]
  );
}

export async function confirmAdmin(rosterEntryId: number, confirmedByRole: string): Promise<void> {
  await execute(
    `INSERT INTO roster_admin_confirmations (roster_entry_id, confirmed_by_role)
     VALUES ($1, $2)
     ON CONFLICT (roster_entry_id) DO NOTHING`,
    [rosterEntryId, confirmedByRole]
  );
}

export async function undoAdminConfirmation(rosterEntryId: number): Promise<void> {
  await execute(`DELETE FROM roster_admin_confirmations WHERE roster_entry_id = $1`, [
    rosterEntryId,
  ]);
}

/**
 * Battalion open-tasks. `slot` counts come from {@link openAllocationsOf} so they match
 * the green square. Navigation only — nothing here writes.
 */
export async function listBattalionTasks(
  battalionId: number,
  allocations: BattalionAllocation[],
  pendingIdentity: number
): Promise<BattalionTask[]> {
  const tasks: BattalionTask[] = [];

  for (const a of openAllocationsOf(allocations)) {
    tasks.push({
      kind: "slot",
      certification_id: a.certification_id,
      days: a.daysToClose,
      count: a.remaining,
      text:
        a.registered === 0
          ? `${a.remaining} מקומות פנויים ב${a.name} — לא שובץ אף חייל`
          : `השלמת ${a.remaining} הקצאות פתוחות ל${a.name}`,
      sub: `${fmtDate(a.start_date)}${a.location ? ` · ${a.location}` : ""} · מולאו ${a.registered} מתוך ${a.allocated_slots}`,
    });
  }

  const pendingAdmin = await query<{
    certification_id: number;
    certification_name: string;
    n: number;
    oldest: number;
  }>(
    `SELECT c.id AS certification_id, c.name AS certification_name, COUNT(*)::int AS n,
            MAX(GREATEST((CURRENT_DATE - COALESCE(NULLIF(c.end_date, '')::date, CURRENT_DATE)), 0))::int AS oldest
       FROM roster_entries re
       JOIN certifications c ON c.id = re.certification_id
       LEFT JOIN roster_admin_confirmations rac ON rac.roster_entry_id = re.id
      WHERE re.battalion_id = $1 AND re.status = 'passed' AND re.is_reserve = 0
        AND rac.id IS NULL
      GROUP BY c.id, c.name`,
    [battalionId]
  );
  for (const row of pendingAdmin) {
    tasks.push({
      kind: "adm",
      certification_id: row.certification_id,
      days: row.oldest,
      count: row.n,
      text: `אישור שלישותי של ${row.n} חיילים מ${row.certification_name}`,
      sub: `ממתינים עד ${row.oldest} יום`,
    });
  }

  const prereq = await query<{
    certification_id: number;
    certification_name: string;
    n: number;
    start_date: string;
  }>(
    `SELECT c.id AS certification_id, c.name AS certification_name, COUNT(*)::int AS n, c.start_date
       FROM roster_entries re
       JOIN certifications c ON c.id = re.certification_id
      WHERE re.battalion_id = $1 AND re.is_reserve = 0
        AND re.meets_prerequisite IS NULL
        AND (
          EXISTS (SELECT 1 FROM certification_prerequisites p WHERE p.certification_id = c.id)
          OR EXISTS (
            SELECT 1 FROM certification_prerequisites p
             WHERE p.template_id = c.template_id AND c.template_id IS NOT NULL
          )
        )
      GROUP BY c.id, c.name, c.start_date`,
    [battalionId]
  );
  for (const row of prereq) {
    tasks.push({
      kind: "prq",
      certification_id: row.certification_id,
      days: daysUntil(row.start_date),
      count: row.n,
      text: `סימון דרישות מעבר ל-${row.n} חיילים ב${row.certification_name}`,
      sub: "דרישת מעבר לא סומנה",
    });
  }

  const docs = await query<{
    certification_id: number;
    certification_name: string;
    doc_type: string;
    n: number;
    start_date: string;
  }>(
    `SELECT c.id AS certification_id, c.name AS certification_name, crd.doc_type,
            COUNT(*)::int AS n, c.start_date
       FROM roster_entries re
       JOIN certifications c ON c.id = re.certification_id
       JOIN certification_required_documents crd ON crd.template_id = c.template_id
       LEFT JOIN roster_required_documents rrd
         ON rrd.roster_entry_id = re.id AND rrd.doc_type = crd.doc_type
      WHERE re.battalion_id = $1 AND re.is_reserve = 0
        AND c.template_id IS NOT NULL
        AND COALESCE(rrd.is_provided, 0) = 0
      GROUP BY c.id, c.name, crd.doc_type, c.start_date`,
    [battalionId]
  );
  for (const row of docs) {
    tasks.push({
      kind: "doc",
      certification_id: row.certification_id,
      days: daysUntil(row.start_date),
      count: row.n,
      text: `הוספת ${row.doc_type} ל-${row.n} חיילים ב${row.certification_name}`,
      sub: "מסמך חובה לפני תחילת ההסמכה",
    });
  }

  if (pendingIdentity > 0) {
    tasks.push({
      kind: "pn",
      certification_id: null,
      days: null,
      count: pendingIdentity,
      text: `${pendingIdentity} חיילים ממתינים למספר אישי`,
      sub: "נספרים במצבה, אך אינם ברי-שיבוץ להסמכה עד להשלמת הזהות",
    });
  }

  return tasks.sort((a, b) => (a.days ?? 999) - (b.days ?? 999) || b.count - a.count);
}

function fmtDate(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}`;
}
