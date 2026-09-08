import { NextResponse } from "next/server";
import { updateRequestStatus } from "@/lib/db/repositories/requests";
import { requestStatusSchema } from "@/lib/validation/request";
import { getCurrentRole } from "@/lib/auth/current-role";
import { canApproveRequests } from "@/lib/auth/permissions";
import type { RequestStatus } from "@/lib/types";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const role = await getCurrentRole();
  if (!canApproveRequests(role)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const { id } = await params;
  const body = await request.json();
  const parsed = requestStatusSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  try {
    await updateRequestStatus(
      Number(id),
      parsed.data.status as RequestStatus,
      role,
      parsed.data.note ?? undefined
    );
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }
}
