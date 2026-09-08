import { NextResponse } from "next/server";
import { addRosterEntry, listRosterForCertification } from "@/lib/db/repositories/roster";
import { rosterEntrySchema } from "@/lib/validation/roster";
import { requireApprovedUser } from "@/lib/auth/user";
import { auditRoleOf, canManageRosterEntry } from "@/lib/auth/permissions";
import { getBattalionById } from "@/lib/db/repositories/battalions";
import { REGISTRATION_LOCKED_MESSAGE } from "@/lib/utils/registration-lock";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  return NextResponse.json(await listRosterForCertification(Number(id)));
}

/**
 * Adds a soldier to a certification's roster — the ONE add-to-roster path, now open to a
 * battalion editor for their own battalion as well as to brigade HQ.
 *
 * THIS HANDLER PREVIOUSLY AUTHORIZED NOTHING. It called `getCurrentRole()` only to stamp
 * the audit trail, so the sole gate was the proxy's blanket "viewers cannot write" rule —
 * and the value stamped on the audit trail was whatever the `active_role` cookie claimed.
 * Both are fixed here: the caller is resolved from the session, the target battalion is
 * checked against them, and the audit role is derived from their real row.
 *
 * Everything downstream is untouched — same Zod schema, same `addRosterEntry`, so the
 * registration-lock check, seat/quota behaviour and עתודה handling are identical to what a
 * brigade add has always done. There is deliberately no parallel battalion code path.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const gate = await requireApprovedUser();
  if (gate instanceof NextResponse) return gate;

  const { id } = await params;
  const body = await request.json();
  const parsed = rosterEntrySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  // The battalion comes from the validated payload, so a scoped editor naming another unit
  // is refused here rather than silently writing under it.
  if (!canManageRosterEntry(gate, parsed.data.battalion_id)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const battalion = await getBattalionById(parsed.data.battalion_id);
  const result = await addRosterEntry(
    { ...parsed.data, certification_id: Number(id) },
    auditRoleOf(gate, battalion?.code)
  );
  // The deadline binds the brigade side as well. It used to be checked only on the
  // battalion route, which made it a deadline for battalions rather than for the
  // certification — a global editor could still register after everyone else was locked out.
  if (!result.ok) {
    return NextResponse.json(
      { error: REGISTRATION_LOCKED_MESSAGE, reason: result.reason },
      { status: 403 }
    );
  }
  return NextResponse.json({ id: result.id }, { status: 201 });
}
