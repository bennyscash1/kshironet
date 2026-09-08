import { NextResponse } from "next/server";
import { getCertificationById, getQuota } from "@/lib/db/repositories/certifications";
import { approveTraineeList } from "@/lib/db/repositories/roster";
import { traineeApprovalSchema } from "@/lib/validation/quota";
import { requireEditor } from "@/lib/auth/user";
import { getCurrentRole } from "@/lib/auth/current-role";
import { battalionCodeOf, isBrigade } from "@/lib/auth/permissions";
import { getBattalionByCode } from "@/lib/db/repositories/battalions";
import { REGISTRATION_LOCKED_MESSAGE, isRegistrationLocked } from "@/lib/utils/registration-lock";

/** Battalion approves (submits) its trainee list for an allocation. Rejected
 * server-side if the registration lock deadline has already passed. */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; battalionId: string }> }
) {
  const gate = await requireEditor();
  if (gate instanceof NextResponse) return gate;

  const { id, battalionId } = await params;
  const certId = Number(id);
  const battId = Number(battalionId);

  const body = await request.json();
  const parsed = traineeApprovalSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  if (parsed.data.battalion_id !== battId) {
    return NextResponse.json({ error: "battalion mismatch" }, { status: 400 });
  }

  // Org-scope: a battalion may approve only its own allocation; brigade may act on any.
  const role = await getCurrentRole();
  if (!isBrigade(role)) {
    const battalion = await getBattalionByCode(battalionCodeOf(role) ?? "");
    if (!battalion || battalion.id !== battId) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
  }

  const quota = await getQuota(certId, battId);
  if (!quota) {
    return NextResponse.json({ error: "no allocation for this battalion" }, { status: 404 });
  }
  // Server-side deadline enforcement (authoritative — not the client clock). The deadline
  // is the certification's single `registration_lock_date` + `registration_lock_hour`, so
  // brigade and battalion are held to the same moment, down to the hour; the DEPRECATED
  // per-allocation column is not consulted.
  const cert = await getCertificationById(certId);
  if (isRegistrationLocked(cert)) {
    return NextResponse.json(
      { error: REGISTRATION_LOCKED_MESSAGE, reason: "registration_locked" },
      { status: 403 }
    );
  }

  const submitted = await approveTraineeList(certId, battId, role);
  return NextResponse.json({ ok: true, submitted });
}
