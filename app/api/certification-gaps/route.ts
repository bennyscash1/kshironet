import { NextResponse } from "next/server";
import { unscopedBlockFailure } from "@/lib/brigades/unscoped-guard";
import { addGapRow, listGapRows } from "@/lib/db/repositories/certification-gaps";
import { getCurrentRole } from "@/lib/auth/current-role";
import { canManageCertifications } from "@/lib/auth/permissions";
import { requireApprovedUser } from "@/lib/auth/user";
import { getBattalionScope } from "@/lib/auth/scope";

export async function GET() {
  const gate = await requireApprovedUser();
  if (gate instanceof NextResponse) return gate;

  // Scoped roles get rows containing their own battalion's counts only.
  const scope = await getBattalionScope();
  return NextResponse.json(await listGapRows(scope?.battalionId));
}

export async function POST(request: Request) {
  const role = await getCurrentRole();
  if (!canManageCertifications(role)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const { certification_name } = await request.json();
  if (!certification_name || typeof certification_name !== "string") {
    return NextResponse.json({ error: "certification_name required" }, { status: 400 });
  }
  try {
    const id = await addGapRow(certification_name);
    return NextResponse.json({ id });
  } catch (err) {
    // certification_gap_rows has no brigade_id yet, and ONE unscoped row is enough to
    // make v_certification_gaps span two brigades — see migration 027.
    const blocked = unscopedBlockFailure(err);
    if (blocked) {
      return NextResponse.json({ error: blocked.message }, { status: blocked.status });
    }
    throw err;
  }
}
