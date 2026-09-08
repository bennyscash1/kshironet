import { NextResponse } from "next/server";
import { upsertGapSentCount } from "@/lib/db/repositories/certification-gaps";
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
  const { battalion_id, sent_count } = await request.json();
  await upsertGapSentCount(Number(rowId), Number(battalion_id), Number(sent_count));
  return NextResponse.json({ ok: true });
}
