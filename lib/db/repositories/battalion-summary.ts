import { query, queryOne } from "@/lib/db/client";
import { getBattalionById } from "@/lib/db/repositories/battalions";
import { listGapRows } from "@/lib/db/repositories/certification-gaps";
import { ACTIVE_ROSTER_STATUSES } from "@/lib/utils/slots";
import type { Battalion, CertificationStatus } from "@/lib/types";

/**
 * One battalion's own picture: what it was allocated, whom it has registered, what it
 * still lacks. Every figure is derived for a single `battalion_id`, so nothing another
 * unit owns can reach a caller confined to this battalion.
 *
 * The exact contents of the summary are still being defined — the shape below is
 * deliberately a set of independent sections (`certifications`, `gaps`, `requests`,
 * `totals`) so a section can be added or reworked without touching the others.
 */

/** One certification this battalion takes part in, from its own point of view. */
export interface BattalionCertificationSummary {
  certification_id: number;
  name: string;
  location: string | null;
  start_date: string;
  end_date: string | null;
  status: CertificationStatus;
  /** Slots the brigade allocated to this battalion; null = no allocation row. */
  allocated_slots: number | null;
  /** Non-reserve soldiers of this battalion occupying the allocation. */
  registered: number;
  /** Reserve (עתודה) soldiers — listed, never counted against the allocation. */
  reserve: number;
  /** allocated − registered, floored at 0; null when there is no allocation. */
  remaining: number | null;
  /** The certification's single registration deadline, 'yyyy-MM-dd'. NULL = none. */
  registration_lock_date: string | null;
  /** The closing hour on that date, 0-23 Israel wall-clock. NULL = end of the lock day. */
  registration_lock_hour: number | null;
}

/** One profession row of "פערי הסמכות", reduced to this battalion's numbers. */
export interface BattalionGapSummary {
  row_id: number;
  certification_name: string;
  /** Still missing. */
  gap: number;
  /** Already sent through successfully. */
  sent: number;
  /** Registered on a certification that has not finished yet ("עתידים לצאת"). */
  pending: number;
}

export interface BattalionSummary {
  battalion: Battalion | null;
  certifications: BattalionCertificationSummary[];
  gaps: BattalionGapSummary[];
  requests: { open: number; total: number };
  totals: {
    allocated: number;
    registered: number;
    reserve: number;
    /** Allocated slots with no name on them yet. */
    remaining: number;
    certifications: number;
  };
}

/** Certifications the battalion has an allocation on or soldiers registered to. Cancelled
 * ones are left out, matching the calendar and the reports. */
async function battalionCertifications(
  battalionId: number
): Promise<BattalionCertificationSummary[]> {
  const rows = await query<{
    certification_id: number;
    name: string;
    location: string | null;
    start_date: string;
    end_date: string | null;
    status: CertificationStatus;
    allocated_slots: number | null;
    registration_lock_date: string | null;
    registration_lock_hour: number | null;
    registered: number;
    reserve: number;
  }>(
    `SELECT c.id as certification_id, c.name, c.location, c.start_date, c.end_date, c.status,
            q.allocated_slots, c.registration_lock_date, c.registration_lock_hour,
            (SELECT COUNT(*)::int FROM roster_entries re
              WHERE re.certification_id = c.id AND re.battalion_id = $1
                AND re.is_reserve = 0 AND re.status = ANY($2::text[])) as registered,
            (SELECT COUNT(*)::int FROM roster_entries re
              WHERE re.certification_id = c.id AND re.battalion_id = $1
                AND re.is_reserve = 1) as reserve
       FROM certifications c
       LEFT JOIN certification_battalion_quotas q
              ON q.certification_id = c.id AND q.battalion_id = $1
      WHERE c.status != 'cancelled'
        AND (q.id IS NOT NULL
             OR EXISTS (SELECT 1 FROM roster_entries re
                         WHERE re.certification_id = c.id AND re.battalion_id = $1))
      ORDER BY c.start_date DESC, c.id DESC`,
    [battalionId, ACTIVE_ROSTER_STATUSES]
  );

  return rows.map((r) => ({
    ...r,
    remaining:
      r.allocated_slots === null ? null : Math.max(r.allocated_slots - r.registered, 0),
  }));
}

export async function getBattalionSummary(battalionId: number): Promise<BattalionSummary> {
  const [battalion, certifications, gapRows, requestCounts] = await Promise.all([
    getBattalionById(battalionId),
    battalionCertifications(battalionId),
    // Already battalion-aware: passing the id keeps every other unit's counts out of the
    // rows entirely, not merely out of the rendering.
    listGapRows(battalionId),
    queryOne<{ open: number; total: number }>(
      `SELECT COUNT(*) FILTER (WHERE status NOT IN ('closed', 'rejected'))::int as open,
              COUNT(*)::int as total
         FROM battalion_requests WHERE battalion_id = $1`,
      [battalionId]
    ),
  ]);

  const gaps: BattalionGapSummary[] = gapRows
    .map((row) => ({
      row_id: row.id,
      certification_name: row.certification_name,
      gap: row.values[battalionId] ?? 0,
      sent: row.sentValues[battalionId] ?? 0,
      pending: row.pendingValues[battalionId] ?? 0,
    }))
    // A profession this battalion neither lacks nor has anyone moving through is noise.
    .filter((g) => g.gap > 0 || g.sent > 0 || g.pending > 0);

  return {
    battalion: battalion ?? null,
    certifications,
    gaps,
    requests: { open: requestCounts?.open ?? 0, total: requestCounts?.total ?? 0 },
    totals: {
      allocated: certifications.reduce((sum, c) => sum + (c.allocated_slots ?? 0), 0),
      registered: certifications.reduce((sum, c) => sum + c.registered, 0),
      reserve: certifications.reduce((sum, c) => sum + c.reserve, 0),
      remaining: certifications.reduce((sum, c) => sum + (c.remaining ?? 0), 0),
      certifications: certifications.length,
    },
  };
}
