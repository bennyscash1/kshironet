import type { CertificationStatus } from "@/lib/types";

/**
 * Allocations the green square and the `slot` open-task both read.
 *
 * One function, two call sites — so the square and the task list can never disagree
 * about whether a certification still has unnamed seats.
 */

export const OPEN_ALLOCATION_STATUSES: CertificationStatus[] = [
  "open",
  "full",
  "in_progress",
];

export interface AllocationFill {
  /** Slots the brigade allocated to this battalion. NULL when there is no quota row at all
   * — the battalion is on the certification only because it has soldiers there. */
  allocated_slots: number | null;
  /** Non-reserve soldiers occupying the allocation (status ≠ rejected / did_not_participate). */
  registered: number;
  status: CertificationStatus;
}

/** Seats still waiting for a name. Floored at 0, and NULL when nothing was allocated —
 * "no allocation" is not the same state as "an allocation with no seats left", and
 * collapsing them to 0 would make a roster-only certification read as full. */
export function remainingAllocatedSlots(
  allocated: number | null,
  registered: number
): number | null {
  if (allocated === null) return null;
  return Math.max(allocated - registered, 0);
}

/** True when this battalion has a quota that is not yet fully named, on a live cycle.
 * No quota means nothing to fill, so it is never an "open allocation" — those cards are
 * specifically "seats the brigade gave you that still need names". */
export function isOpenAllocation(row: AllocationFill): boolean {
  if (!OPEN_ALLOCATION_STATUSES.includes(row.status)) return false;
  if (row.allocated_slots === null || row.allocated_slots <= 0) return false;
  return (remainingAllocatedSlots(row.allocated_slots, row.registered) ?? 0) > 0;
}

export function daysUntil(iso: string | null | undefined, now = new Date()): number | null {
  if (!iso) return null;
  const target = new Date(iso);
  if (Number.isNaN(target.getTime())) return null;
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const end = new Date(target.getFullYear(), target.getMonth(), target.getDate());
  return Math.round((end.getTime() - start.getTime()) / 86_400_000);
}

export type UrgencyBand = "hot" | "warm" | "cool";

export function urgencyBand(days: number | null): UrgencyBand {
  if (days === null) return "cool";
  if (days <= 5) return "hot";
  if (days <= 12) return "warm";
  return "cool";
}

/** Urgent first (fewest days to close), then most open seats. */
export function compareOpenAllocations<
  T extends { daysToClose: number | null; remaining: number | null },
>(a: T, b: T): number {
  const da = a.daysToClose ?? Number.POSITIVE_INFINITY;
  const db = b.daysToClose ?? Number.POSITIVE_INFINITY;
  if (da !== db) return da - db;
  return (b.remaining ?? 0) - (a.remaining ?? 0);
}

/**
 * Filter + sort used by both the green square and the `slot` open-task.
 *
 * The return type narrows `allocated_slots` and `remaining` to non-null, which is not a
 * convenience — it is what `isOpenAllocation` just finished proving. Every caller counts
 * open seats, and without the narrowing each one would have to re-handle a null that the
 * filter has already excluded (and would probably do it with `?? 0`, quietly turning
 * "no allocation" into "nothing left"). The assertion is safe exactly as long as
 * `isOpenAllocation` keeps rejecting a null quota, which is its first check.
 */
export type OpenAllocation<T> = T & { allocated_slots: number; remaining: number };

export function openAllocationsOf<
  T extends AllocationFill & { remaining: number | null; daysToClose: number | null },
>(rows: T[]): OpenAllocation<T>[] {
  return rows.filter(isOpenAllocation).sort(compareOpenAllocations) as OpenAllocation<T>[];
}

/**
 * An allocation the brigade handed over that has no names on it yet — the state the weekly
 * view paints amber.
 *
 * Deliberately independent of {@link isOpenAllocation}: that one also excludes cancelled
 * and completed cycles, whereas this is a plain statement about the battalion's own data
 * and is used for colouring rather than for the worklist.
 */
export function isAwaitingNames(row: {
  has_quota: boolean;
  registered: number;
}): boolean {
  return row.has_quota && row.registered === 0;
}

