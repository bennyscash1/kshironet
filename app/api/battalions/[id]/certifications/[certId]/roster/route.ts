import { NextResponse } from "next/server";
import {
  addBattalionRosterEntry,
  getBattalionQuotaUsage,
  listRosterForBattalionCertification,
  type QuotaRefusal,
} from "@/lib/db/repositories/roster";
import { battalionRosterEntrySchema } from "@/lib/validation/roster";
import { requireApprovedUser } from "@/lib/auth/user";
import { denyOutOfScope, requireBattalionEditor } from "@/lib/auth/scope";
import { REGISTRATION_LOCKED_MESSAGE } from "@/lib/utils/registration-lock";
import { DRAFT_REFUSAL_MESSAGE } from "@/lib/battalions/allocation-opportunities";

/**
 * One battalion's soldiers on one certification. This is the entry point a battalion-scoped
 * role uses instead of `/api/certifications/[id]/roster` (which belongs to the הסמכות
 * section they cannot see): the battalion comes from the path, never from the payload, and
 * an addition is bounded by the slots the brigade allocated to that battalion.
 */

/** Hebrew message per refusal. `used`/`allocated` are only set for a full allocation. */
function refusalMessage(
  reason: QuotaRefusal,
  allocated?: number,
  used?: number
): { error: string; status: number } {
  switch (reason) {
    case "not_open":
      return { error: DRAFT_REFUSAL_MESSAGE, status: 409 };
    case "no_quota":
      return {
        error: "לא הוקצו לגדוד מקומות בהסמכה זו — לא ניתן להוסיף חיילים.",
        status: 409,
      };
    case "quota_exceeded":
      return {
        error: `ההקצאה לגדוד בהסמכה זו מלאה (${used} מתוך ${allocated}) — לא ניתן להוסיף חייל נוסף. ניתן להוסיף כעתודה.`,
        status: 409,
      };
    case "capacity_full":
      return {
        error: `כל המקומות בהסמכה זו תפוסים (${used} מתוך ${allocated}) — לא ניתן להוסיף חייל נוסף. ניתן להוסיף כעתודה.`,
        status: 409,
      };
    case "registration_locked":
      return { error: REGISTRATION_LOCKED_MESSAGE, status: 403 };
  }
}

function parseIds(id: string, certId: string): { battalionId: number; certificationId: number } | null {
  const battalionId = Number(id);
  const certificationId = Number(certId);
  if (!Number.isInteger(battalionId) || !Number.isInteger(certificationId)) return null;
  return { battalionId, certificationId };
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string; certId: string }> }
) {
  const gate = await requireApprovedUser();
  if (gate instanceof NextResponse) return gate;

  const { id, certId } = await params;
  const ids = parseIds(id, certId);
  if (!ids) return NextResponse.json({ error: "invalid ids" }, { status: 400 });

  const denied = await denyOutOfScope(ids.battalionId);
  if (denied) return denied;

  const [entries, quota] = await Promise.all([
    listRosterForBattalionCertification(ids.certificationId, ids.battalionId),
    getBattalionQuotaUsage(ids.certificationId, ids.battalionId),
  ]);
  return NextResponse.json({ entries, quota });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; certId: string }> }
) {
  const { id, certId } = await params;
  const ids = parseIds(id, certId);
  if (!ids) return NextResponse.json({ error: "invalid ids" }, { status: 400 });

  const gate = await requireBattalionEditor(ids.battalionId);
  if (gate instanceof NextResponse) return gate;

  const body = await request.json();
  const parsed = battalionRosterEntrySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const result = await addBattalionRosterEntry(
    {
      ...parsed.data,
      certification_id: ids.certificationId,
      // Authoritative: the battalion of the guarded route, not anything the client sent.
      battalion_id: ids.battalionId,
    },
    gate.changedByRole
  );

  if (!result.ok) {
    const { error, status } = refusalMessage(result.reason, result.allocated, result.used);
    return NextResponse.json({ error, reason: result.reason }, { status });
  }
  return NextResponse.json({ id: result.id }, { status: 201 });
}
