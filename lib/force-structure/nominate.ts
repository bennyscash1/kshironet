import { isAssignmentUsable, type AssignmentUsability } from "@/lib/db/repositories/force-structure";

/**
 * The single gate every path that turns a force-structure soldier into a course
 * participant must pass through: the green square, a gap nomination, and the roster.
 *
 * Why it exists as one function rather than a check at each call site: the reason a
 * pending-identity soldier cannot be registered is not cosmetic. The personal number is
 * the join key for their held certifications, for the soldier lookup, and for the one-way
 * reconciliation when the course completes. Registering them would create a roster entry
 * that no later step can match back to a person — and it would fail silently, which is the
 * worst possible failure mode for a training record.
 *
 * Enforced server-side. A caller that skips the UI still hits this.
 */

export const PENDING_IDENTITY_MESSAGE =
  "לא ניתן לשבץ חייל ללא מספר אישי. יש להשלים את הזהות במצבה לפני שיבוץ להסמכה.";

export const ASSIGNMENT_NOT_FOUND_MESSAGE = "השיבוץ אינו קיים בגדוד זה.";

export interface NominationGate {
  allowed: boolean;
  status: number;
  error?: string;
  reason?: "not_found" | "pending_identity";
}

/** Maps the data-layer verdict onto an HTTP-shaped result with a Hebrew message. */
export function gateFromUsability(usability: AssignmentUsability): NominationGate {
  if (usability.ok) return { allowed: true, status: 200 };
  if (usability.reason === "not_found") {
    return {
      allowed: false,
      status: 404,
      error: ASSIGNMENT_NOT_FOUND_MESSAGE,
      reason: "not_found",
    };
  }
  return {
    allowed: false,
    // 409, not 400: the payload is well formed, the underlying record is not yet usable.
    status: 409,
    error: PENDING_IDENTITY_MESSAGE,
    reason: "pending_identity",
  };
}

/**
 * May this force-structure assignment be sent to a course?
 *
 * `battalionId` comes from the session, so an assignment in another battalion resolves to
 * "not found" rather than leaking its existence.
 */
export async function assertAssignmentNominable(
  assignmentId: number,
  battalionId: number
): Promise<NominationGate> {
  return gateFromUsability(await isAssignmentUsable(assignmentId, battalionId));
}
