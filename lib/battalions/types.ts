import type { RosterStatus } from "@/lib/types";
import type { AllocationFill } from "@/lib/battalions/open-allocations";

/** Slots allocated to this battalion, or null when it has no allocation at all. */
export interface BattalionQuotaUsage {
  /** Seats in the pool that applies to this battalion: its own allocation in Mode B, the
   * certification's shared `total_slots` in Mode A. NULL means unlimited. */
  allocated: number | null;
  /** Which pool `allocated` refers to — see getBattalionQuotaUsage. */
  mode?: "open_to_all" | "battalion_quota";
  /** Mode B only: quota rows exist but none belongs to this battalion, so it was not
   * invited. Distinct from "Mode A with no cap", which both used to look like `allocated:
   * null` and is the confusion this flag removes. */
  missing_quota?: boolean;
  /** The certification's status permits registration (see REGISTRATION_OPEN_STATUSES).
   * False for a טיוטה, which a battalion must not staff. */
  registration_open?: boolean;
  /** Non-reserve soldiers occupying the allocation. */
  used: number;
  /** Reserve soldiers — listed, never counted against the allocation. */
  reserve: number;
  /** allocated − used, floored at 0. null when there is no allocation. */
  remaining: number | null;
  /** The certification's single deadline, 'yyyy-MM-dd'. NULL = no deadline. Identical for
   * every battalion on that certification. */
  registration_lock_date: string | null;
  /** The closing hour on that date, 0-23 Israel wall-clock. NULL = end of the lock day.
   * Carried alongside the date so the countdown and the lock check agree on one moment. */
  registration_lock_hour: number | null;
  /** True once the registration deadline has passed. */
  locked: boolean;
}

export interface AllocationSoldier {
  id: number;
  full_name: string;
  personal_number: string;
  company_platoon: string | null;
  phone: string | null;
  is_reserve: number;
  status: RosterStatus;
  meets_prerequisite: number | null;
}

export interface BattalionAllocation extends AllocationFill {
  certification_id: number;
  name: string;
  location: string | null;
  start_date: string;
  end_date: string | null;
  color_hex: string | null;
  /** The certification's single deadline, 'yyyy-MM-dd'. NULL = no deadline. */
  registration_lock_date: string | null;
  /** The closing hour on that date, 0-23 Israel wall-clock. NULL = end of the lock day. */
  registration_lock_hour: number | null;
  /** allocated_slots − registered, floored at 0. NULL when there is no quota. */
  remaining: number | null;
  reserve: number;
  daysToClose: number | null;
  /** The brigade allocated this battalion slots on the certification. */
  has_quota: boolean;
  /** The battalion has at least one roster row on it — reserve and inactive rows included,
   * so this is not the same as `registered > 0`. */
  has_roster: boolean;
  soldiers: AllocationSoldier[];
}

export interface QuarterKpi {
  passed: number;
  registered: number;
}

export interface AdminConfirmationRow {
  roster_entry_id: number;
  full_name: string;
  personal_number: string;
  certification_id: number;
  certification_name: string;
  end_date: string | null;
  waiting_days: number;
  confirmed_at: string | null;
}

export interface BattalionTask {
  kind: "doc" | "adm" | "slot" | "prq" | "pn";
  certification_id: number | null;
  days: number | null;
  text: string;
  sub: string;
  count: number;
}

/** The KPI slice the battalion dashboard reads. Kept here so the client never imports a
 * repository that pulls in `pg`. */
export interface BattalionDashboardKpis {
  gaps: { gap: number }[];
  totals: { remaining: number };
}
