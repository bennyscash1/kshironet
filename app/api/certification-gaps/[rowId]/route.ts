import { NextResponse } from "next/server";
import { deleteGapRow } from "@/lib/db/repositories/certification-gaps";
import { getCurrentRole } from "@/lib/auth/current-role";
import { canManageCertifications } from "@/lib/auth/permissions";

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ rowId: string }> }
) {
  const role = await getCurrentRole();
  if (!canManageCertifications(role)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const { rowId } = await params;
  await deleteGapRow(Number(rowId));
  return NextResponse.json({ ok: true });
}
