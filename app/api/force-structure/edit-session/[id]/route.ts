import { NextResponse } from "next/server";
import { closeEditSession } from "@/lib/db/repositories/force-structure";
import { requireBattalionEditor } from "@/lib/auth/scope";

/**
 * DELETE /api/force-structure/edit-session/[id]?battalionId=…
 *
 * Closes an edit session and KEEPS the edits — what "סיום עריכה" calls. Every move was
 * already committed as it happened, so this writes nothing to the people layer; it only
 * drops the snapshot that "חזור" would have reverted to.
 *
 * A missing session is not an error worth surfacing: the edits are kept either way.
 */
export async function DELETE(
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

  await closeEditSession(snapshotId, battalionId, gate.user.id);
  return NextResponse.json({ ok: true });
}
