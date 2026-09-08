import { NextResponse } from "next/server";
import { getBattalionSummary } from "@/lib/db/repositories/battalion-summary";
import { requireApprovedUser } from "@/lib/auth/user";
import { denyOutOfScope } from "@/lib/auth/scope";

/** One battalion's own summary (allocations, registrations, gaps, requests).
 * A battalion-scoped caller may ask only about their own battalion; global roles may ask
 * about any, exactly as they can already open any battalion's page. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const gate = await requireApprovedUser();
  if (gate instanceof NextResponse) return gate;

  const { id } = await params;
  const battalionId = Number(id);
  if (!Number.isInteger(battalionId)) {
    return NextResponse.json({ error: "invalid battalion" }, { status: 400 });
  }

  const denied = await denyOutOfScope(battalionId);
  if (denied) return denied;

  return NextResponse.json(await getBattalionSummary(battalionId));
}
