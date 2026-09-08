import type { CertificationStatus } from "@/lib/types";

/**
 * An "open allocation opportunity": a certification this battalion can still put names on
 * today. ONE definition, consumed by the dashboard band, the calendar highlight, the
 * band's counter line and the weekly PDF — so none of them can drift from the others.
 *
 * THE DRIFT THIS REPLACES. The band asked `isOpenAllocation()` (status + seats remaining)
 * while the calendar's amber asked `isAwaitingNames()` (has a quota AND nobody named yet).
 * Those are different questions: a quota of 3 with 1 name is an open opportunity the band
 * lists but the calendar left unpainted, and neither predicate looked at the date at all,
 * so an allocation stayed "open" forever once its cycle had ended.
 */

/**
 * Statuses that permit registration.
 *
 * DERIVED FROM THE DATA, NOT ASSUMED. `SELECT DISTINCT status FROM certifications` returns
 * exactly: draft (72), completed (22), cancelled (20), open (5), closed (1). `open`
 * ("פתוחה להרשמה") is the only one that admits registration — `closed` is literally
 * "סגורה להרשמה", and `draft` has not been published. The `full` and `in_progress` members
 * of the CertificationStatus union have no rows at all, which is why the old
 * OPEN_ALLOCATION_STATUSES list looked broader than it behaved.
 */
export const REGISTRATION_OPEN_STATUSES: CertificationStatus[] = ["open"];

/**
 * Why a battalion registration was refused. Shared by the repository, the API's Hebrew
 * message map and the panel's banner, so the reason a soldier could not be added is named
 * once and cannot drift between the three.
 */
export type RegistrationRefusal =
  /** The certification's status does not permit registration — draft, closed, cancelled… */
  | "not_open"
  /** Mode B and this battalion has no allocation on it. */
  | "no_quota"
  /** Mode B and this battalion's allocation is full. */
  | "quota_exceeded"
  /** Mode A and the shared pool is full. */
  | "capacity_full"
  | "registration_locked";

/**
 * The Hebrew reason a battalion cannot register, worded once.
 *
 * The panel shows it in place of the add button and the API returns it on a refused POST,
 * so a user who bypasses the UI reads the same sentence the UI would have shown them.
 */
export const DRAFT_REFUSAL_MESSAGE = "ההסמכה עדיין בטיוטה — טרם נפתחה להרשמה";

/** How the brigade allocated seats on this certification. */
export type AllocationMode = "open_to_all" | "battalion_quota";

export interface AllocationOpportunity {
  certification_id: number;
  name: string;
  location: string | null;
  start_date: string;
  /** May be null — a single-day cycle. Expiry falls back to `start_date`. */
  end_date: string | null;
  status: CertificationStatus;
  color_hex: string | null;
  /**
   * `battalion_quota` — the brigade allocated seats to THIS battalion specifically.
   * `open_to_all` — no `certification_battalion_quotas` row exists for the certification
   * at all, so the seat pool is shared and any battalion may register into it. The ABSENCE
   * of a quota row means "open to everyone", never "not relevant to this battalion".
   */
  mode: AllocationMode;
  /** Seats in scope: this battalion's `allocated_slots`, or the certification's
   * `total_slots` when open to all. NULL means unlimited. */
  seats: number | null;
  /** Non-reserve roster entries occupying those seats. */
  taken: number;
  /** seats − taken, floored at 0. NULL when seats is unlimited. */
  remaining: number | null;
  registration_lock_date: string | null;
  registration_lock_hour: number | null;
  /** Whole days until the registration deadline, or null when there is none. Drives the
   * urgency pill, exactly as it does on a BattalionAllocation. */
  daysToClose: number | null;
}

/** Seats a battalion can still fill, for the counter line. Unlimited contributes nothing —
 * there is no number to add — so callers must also check {@link hasUnlimitedSeats}. */
export function openSeatsOf(rows: readonly AllocationOpportunity[]): number {
  return rows.reduce((sum, r) => sum + (r.remaining ?? 0), 0);
}

export function hasUnlimitedSeats(rows: readonly AllocationOpportunity[]): boolean {
  return rows.some((r) => r.remaining === null);
}

/** The two groups the band renders, split from one result set. */
export function splitByMode(rows: readonly AllocationOpportunity[]): {
  battalionQuota: AllocationOpportunity[];
  openToAll: AllocationOpportunity[];
} {
  return {
    battalionQuota: rows.filter((r) => r.mode === "battalion_quota"),
    openToAll: rows.filter((r) => r.mode === "open_to_all"),
  };
}

/** The day a cycle stops being an opportunity: its end, or its start for a one-day cycle. */
export function effectiveEndDate(row: {
  start_date: string;
  end_date: string | null;
}): string {
  const end = row.end_date?.trim();
  return (end ? end : row.start_date).slice(0, 10);
}
