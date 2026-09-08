import { NextResponse } from "next/server";
import { upsertGapValue } from "@/lib/db/repositories/certification-gaps";
import { getCurrentRole } from "@/lib/auth/current-role";
import { canManageCertifications } from "@/lib/auth/permissions";

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ rowId: string }> }
) {
  const role = await getCurrentRole();
  if (!canManageCertifications(role)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const { rowId } = await params;
  const { battalion_id, gap_count } = await request.json();
  await upsertGapValue(Number(rowId), Number(battalion_id), Number(gap_count));
  return NextResponse.json({ ok: true });
}
