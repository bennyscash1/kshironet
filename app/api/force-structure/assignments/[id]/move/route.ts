import { NextResponse } from "next/server";
import { assignmentMoveSchema } from "@/lib/validation/force-structure";
import { moveAssignment } from "@/lib/db/repositories/force-structure";
import { requireBattalionEditor } from "@/lib/auth/scope";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const assignmentId = Number(id);
  if (!Number.isInteger(assignmentId)) {
    return NextResponse.json({ error: "invalid id" }, { status: 400 });
  }

  const body = await request.json();
  const parsed = assignmentMoveSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const battalionId = Number(new URL(request.url).searchParams.get("battalionId"));
  if (!Number.isInteger(battalionId)) {
    return NextResponse.json({ error: "invalid battalion" }, { status: 400 });
  }

  const gate = await requireBattalionEditor(battalionId);
  if (gate instanceof NextResponse) return gate;

  const result = await moveAssignment(assignmentId, battalionId, parsed.data.target);
  if (!result.ok) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
