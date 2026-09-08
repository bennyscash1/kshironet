import { NextResponse } from "next/server";
import { updateCertificationStatus } from "@/lib/db/repositories/certifications";
import { certificationStatusSchema } from "@/lib/validation/certification";
import { requireApprovedUser } from "@/lib/auth/user";
import { auditRoleOf, canManageCertificationStatus } from "@/lib/auth/permissions";
import type { CertificationStatus } from "@/lib/types";

/**
 * Moves one certification between statuses — draft -> open being the one that matters.
 *
 * THE OLD GATE WAS `canManageCertifications(await getCurrentRole())`, WHICH READ THE
 * `active_role` COOKIE and nothing else. Two failures came out of that:
 *
 *   - The route trusted a client-controlled value. `getCurrentRole()` even defaults to
 *     "brigade" when the cookie is missing or malformed, so the route's own defence was
 *     nil; only the proxy stood in the way.
 *   - A real super-admin or editor whose cookie was parked on `battalion:9308` — where the
 *     role switcher leaves it after previewing a unit — was refused their own capability,
 *     and the UI hid the button on the same value. That is the likely reason `draft -> open`
 *     ran 6 times against 109 draft creations.
 *
 * Authorization now comes from the authenticated session via `canManageCertificationStatus`,
 * the same predicate the detail page gates the control on. The cookie is not read here.
 *
 * The transition map and the notification fan-out inside `updateCertificationStatus` are
 * untouched, so which transitions are legal and who gets told are exactly as before.
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const gate = await requireApprovedUser();
  if (gate instanceof NextResponse) return gate;

  if (!canManageCertificationStatus(gate)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const certificationId = Number(id);
  if (!Number.isInteger(certificationId)) {
    return NextResponse.json({ error: "invalid certification" }, { status: 400 });
  }

  const body = await request.json();
  const parsed = certificationStatusSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  try {
    await updateCertificationStatus(
      certificationId,
      parsed.data.status as CertificationStatus,
      // The audit vocabulary is unchanged — `status_history.changed_by_role` keeps storing
      // "brigade" for a global user, exactly as its 184 existing certification rows do. What
      // changed is that the value is derived from the authenticated row rather than copied
      // out of the cookie.
      auditRoleOf(gate),
      parsed.data.note ?? undefined
    );
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }
}
