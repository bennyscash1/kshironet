import { NextResponse } from "next/server";
import { confirmCertificationCompletion } from "@/lib/db/repositories/certifications";
import { getCurrentRole } from "@/lib/auth/current-role";
import { canManageCertifications } from "@/lib/auth/permissions";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const role = await getCurrentRole();
  if (!canManageCertifications(role)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const { id } = await params;
  const body = await request.json();
  const passedIds: number[] = Array.isArray(body.passed_ids) ? body.passed_ids.map(Number) : [];

  try {
    await confirmCertificationCompletion(Number(id), passedIds, role);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }
}
