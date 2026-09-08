import { NextResponse } from "next/server";
import { addSession, getTrainingById } from "@/lib/db/repositories/trainings";
import { trainingSessionSchema } from "@/lib/validation/training";
import { getCurrentRole } from "@/lib/auth/current-role";
import { canManageTrainings } from "@/lib/auth/permissions";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const role = await getCurrentRole();
  if (!canManageTrainings(role)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const { id } = await params;
  const training = await getTrainingById(Number(id));
  if (!training) return NextResponse.json({ error: "not found" }, { status: 404 });
  const body = await request.json();
  const parsed = trainingSessionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  await addSession(training.id, parsed.data);
  return NextResponse.json({ ok: true }, { status: 201 });
}
