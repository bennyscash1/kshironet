import { NextResponse } from "next/server";
import { revertEditSession } from "@/lib/db/repositories/force-structure";
import { requireBattalionEditor } from "@/lib/auth/scope";

/**
 * POST /api/force-structure/edit-session/[id]/revert?battalionId=…
 *
 * Discards everything done since the session opened — what "חזור" calls — by writing the
 * snapshot's occupancy back and then closing the session.
 *
 * Takes no body. The occupancy comes from the stored snapshot, so this route accepts no
 * soldier fields and cannot be used to write an occupant that was never there. It touches
 * `role_assignments` and `bank_soldiers` only; `roles` is untouched (§0.3.1).
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const snapshotId = Number(id);
  if (!Number.isInteger(snapshotId)) {
    return NextResponse.json({ error: "invalid id" }, { status: 400 });
  }

  const battalionId = Number(new URL(request.url).searchParams.get("battalionId"));
  if (!Number.isInteger(battalionId)) {
    return NextResponse.json({ error: "invalid battalion" }, { status: 400 });
  }

  const gate = await requireBattalionEditor(battalionId);
  if (gate instanceof NextResponse) return gate;

  const result = await revertEditSession(snapshotId, battalionId, gate.user.id);
  if (!result.ok) {
    // 409 for a snapshot that no longer matches the establishment: the request was
    // well-formed and authorised, it simply cannot be applied any more.
    const status = result.reason === "not_found" ? 404 : 409;
    return NextResponse.json({ error: result.reason }, { status });
  }
  return NextResponse.json({ ok: true });
}
