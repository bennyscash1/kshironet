import { NextResponse } from "next/server";
import { getRosterEntry, updateRosterStatus } from "@/lib/db/repositories/roster";
import { rosterStatusSchema } from "@/lib/validation/roster";
import { requireApprovedUser } from "@/lib/auth/user";
import { auditRoleOf, canManageRosterEntry } from "@/lib/auth/permissions";
import { getBattalionById } from "@/lib/db/repositories/battalions";
import type { RosterStatus } from "@/lib/types";

/**
 * Moves one roster entry between statuses (ממתין לאישור / אושר / נדחה / השתתף / …).
 *
 * THE OLD GATE WAS `canApproveRoster(await getCurrentRole())`, WHICH READ THE
 * `active_role` COOKIE. That is a display selector any client can set, so it failed in
 * both directions: a battalion user could set it to `brigade` and re-status anyone's
 * soldier, while a brigade user previewing a battalion was locked out of their own
 * capability. Authorization now comes from the authenticated session and the entry's real
 * owner; the cookie is not read here at all.
 *
 * A battalion editor gets the SAME set of transitions as brigade HQ — `updateRosterStatus`
 * is unchanged and applies whatever transition rules it already had.
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ entryId: string }> }
) {
  const gate = await requireApprovedUser();
  if (gate instanceof NextResponse) return gate;

  const { entryId } = await params;
  const id = Number(entryId);
  if (!Number.isInteger(id)) {
    return NextResponse.json({ error: "invalid entry" }, { status: 400 });
  }

  const entry = await getRosterEntry(id);
  if (!entry) return NextResponse.json({ error: "not found" }, { status: 404 });

  // 404, not 403: whose soldier a given id belongs to is not something a scoped editor may
  // learn by probing. One lookup covers both the check and the write below.
  if (!canManageRosterEntry(gate, entry.battalion_id)) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const body = await request.json();
  const parsed = rosterStatusSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  // The audit trail and the notification recipient are stamped from the authenticated row,
  // not from the cookie the previous version passed straight through.
  const battalion = await getBattalionById(entry.battalion_id);
  const changedByRole = auditRoleOf(gate, battalion?.code);

  const status = parsed.data.status as RosterStatus;
  try {
    await updateRosterStatus(
      id,
      status,
      changedByRole,
      parsed.data.note ?? undefined,
      parsed.data.outcome_reason ?? undefined
    );
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }
}
