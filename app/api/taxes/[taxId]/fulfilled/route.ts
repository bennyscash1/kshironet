import { NextResponse } from "next/server";
import { setTaxFulfilled } from "@/lib/db/repositories/certifications";
import { getCurrentRole } from "@/lib/auth/current-role";
import { canManageCertifications } from "@/lib/auth/permissions";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ taxId: string }> }
) {
  const role = await getCurrentRole();
  if (!canManageCertifications(role)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const { taxId } = await params;
  const { is_fulfilled } = await request.json();
  await setTaxFulfilled(Number(taxId), Boolean(is_fulfilled));
  return NextResponse.json({ ok: true });
}
