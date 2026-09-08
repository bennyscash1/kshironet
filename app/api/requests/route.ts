import { NextResponse } from "next/server";
import { createRequest, listRequests } from "@/lib/db/repositories/requests";
import { requestSchema } from "@/lib/validation/request";
import { getCurrentRole } from "@/lib/auth/current-role";
import { requireApprovedUser } from "@/lib/auth/user";
import { getBattalionScope } from "@/lib/auth/scope";
import { battalionCodeOf, canEditBattalion, isBrigade } from "@/lib/auth/permissions";
import { getBattalionByCode } from "@/lib/db/repositories/battalions";
import type { RequestStatus } from "@/lib/types";

export async function GET(request: Request) {
  const role = await getCurrentRole();
  const url = new URL(request.url);
  // A battalion-scoped role is pinned to its own battalion and cannot widen the result
  // set with a ?battalion= parameter; global roles behave exactly as before.
  const scope = await getBattalionScope();
  const battalionCode = scope
    ? scope.code
    : isBrigade(role)
    ? url.searchParams.get("battalion") ?? undefined
    : battalionCodeOf(role) ?? undefined;
  return NextResponse.json(
    await listRequests({
      battalionCode,
      status: (url.searchParams.get("status") as RequestStatus) ?? undefined,
    })
  );
}

export async function POST(request: Request) {
  // Authenticated server-side identity first. The active_role cookie below is only the
  // organizational view scope, never authorization.
  const gate = await requireApprovedUser();
  if (gate instanceof NextResponse) return gate;
  const me = gate;

  const role = await getCurrentRole();
  const body = await request.json();
  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  // A battalion-scoped editor may submit only for their own battalion, so the target is
  // taken from their user row rather than the payload. Global roles keep using the
  // payload, and `canEditBattalion` reduces to the previous `canEdit` check for them —
  // so viewers and unapproved users are refused exactly as before.
  const scope = await getBattalionScope();
  const battalionId = scope ? scope.battalionId : parsed.data.battalion_id;
  if (!canEditBattalion(me, battalionId)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const soldiers = scope
    ? parsed.data.soldiers.map((s) => ({ ...s, battalion_id: scope.battalionId }))
    : parsed.data.soldiers;

  if (!scope && !isBrigade(role)) {
    const code = battalionCodeOf(role);
    const battalion = await getBattalionByCode(code ?? "");
    if (!battalion || battalion.id !== parsed.data.battalion_id) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
    // Attached soldiers must belong to the caller's own battalion too — the payload is
    // client-supplied, so the picker's restriction is not a guarantee.
    if (parsed.data.soldiers.some((s) => s.battalion_id !== battalion.id)) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
  }

  const id = await createRequest({ ...parsed.data, battalion_id: battalionId, soldiers });
  return NextResponse.json({ id }, { status: 201 });
}
