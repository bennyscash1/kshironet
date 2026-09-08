import { NextResponse } from "next/server";
import { openEditSession } from "@/lib/db/repositories/force-structure";
import { requireBattalionEditor } from "@/lib/auth/scope";

/**
 * POST /api/force-structure/edit-session?battalionId=…
 *
 * Opens a cancellable edit session for the canvas: snapshots the battalion's people layer
 * server-side and hands back only the snapshot id. Called when "מצב עריכה" is switched on.
 *
 * Takes no body. The occupancy being snapshotted is read from the database, never from the
 * caller, which is the whole point — see the note in
 * migrations/postgres/020_force_structure_edit_snapshots.sql.
 */
export async function POST(request: Request) {
  const battalionId = Number(new URL(request.url).searchParams.get("battalionId"));
  if (!Number.isInteger(battalionId)) {
    return NextResponse.json({ error: "invalid battalion" }, { status: 400 });
  }

  const gate = await requireBattalionEditor(battalionId);
  if (gate instanceof NextResponse) return gate;

  const { snapshot_id } = await openEditSession(battalionId, gate.user.id, gate.changedByRole);
  return NextResponse.json({ ok: true, snapshot_id });
}
