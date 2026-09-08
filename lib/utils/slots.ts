export function computeSlotsRemaining(
  totalSlots: number | null,
  registeredCount: number
): number | null {
  if (totalSlots === null) return null;
  return Math.max(totalSlots - registeredCount, 0);
}

export const ACTIVE_ROSTER_STATUSES = [
  "registered",
  "pending_approval",
  "approved",
  "participated",
  "passed",
  "failed",
];
