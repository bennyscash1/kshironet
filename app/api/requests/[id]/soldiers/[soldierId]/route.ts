import { NextResponse } from "next/server";
import { getRequest } from "@/lib/db/repositories/requests";
import { deleteRequestSoldier } from "@/lib/db/repositories/request-soldiers";
import { requireEditor } from "@/lib/auth/user";
import { getCurrentRole } from "@/lib/auth/current-role";
import { battalionCodeOf, isBrigade } from "@/lib/auth/permissions";
import { getBattalionByCode } from "@/lib/db/repositories/battalions";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string; soldierId: string }> }
) {
  const gate = await requireEditor();
  if (gate instanceof NextResponse) return gate;

  const { id, soldierId } = await params;
  const req = await getRequest(Number(id));
  if (!req) return NextResponse.json({ error: "not found" }, { status: 404 });

  // Org-scope: only the owning battalion (or brigade) may remove a soldier.
  const role = await getCurrentRole();
  if (!isBrigade(role)) {
    const battalion = await getBattalionByCode(battalionCodeOf(role) ?? "");
    if (!battalion || battalion.id !== req.battalion_id) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
  }

  await deleteRequestSoldier(Number(soldierId));
  return NextResponse.json({ ok: true });
}
