import { NextResponse } from "next/server";
import { confirmAdmin, undoAdminConfirmation } from "@/lib/db/repositories/battalion-dashboard";
import { getRosterEntry } from "@/lib/db/repositories/roster";
import { requireBattalionEditor } from "@/lib/auth/scope";

export async function PUT(
  _request: Request,
  { params }: { params: Promise<{ entryId: string }> }
) {
  const { entryId } = await params;
  const id = Number(entryId);
  if (!Number.isInteger(id)) return NextResponse.json({ error: "invalid id" }, { status: 400 });

  const entry = await getRosterEntry(id);
  if (!entry) return NextResponse.json({ error: "not found" }, { status: 404 });

  const gate = await requireBattalionEditor(entry.battalion_id);
  if (gate instanceof NextResponse) return gate;

  await confirmAdmin(id, gate.changedByRole);
  return NextResponse.json({ ok: true });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ entryId: string }> }
) {
  const { entryId } = await params;
  const id = Number(entryId);
  if (!Number.isInteger(id)) return NextResponse.json({ error: "invalid id" }, { status: 400 });

  const entry = await getRosterEntry(id);
  if (!entry) return NextResponse.json({ error: "not found" }, { status: 404 });

  const gate = await requireBattalionEditor(entry.battalion_id);
  if (gate instanceof NextResponse) return gate;

  await undoAdminConfirmation(id);
  return NextResponse.json({ ok: true });
}
