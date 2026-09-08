import { NextResponse } from "next/server";
import { deleteSession, updateSession } from "@/lib/db/repositories/trainings";
import { trainingSessionSchema } from "@/lib/validation/training";
import { getCurrentRole } from "@/lib/auth/current-role";
import { canManageTrainings } from "@/lib/auth/permissions";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; sessionId: string }> }
) {
  const role = await getCurrentRole();
  if (!canManageTrainings(role)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const { sessionId } = await params;
  const body = await request.json();
  const parsed = trainingSessionSchema.partial().safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  await updateSession(Number(sessionId), parsed.data);
  return NextResponse.json({ ok: true });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string; sessionId: string }> }
) {
  const role = await getCurrentRole();
  if (!canManageTrainings(role)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const { sessionId } = await params;
  await deleteSession(Number(sessionId));
  return NextResponse.json({ ok: true });
}
