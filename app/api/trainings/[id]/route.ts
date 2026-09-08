import { NextResponse } from "next/server";
import {
  deleteTraining,
  getTrainingById,
  listSessionsForTraining,
  replaceTrainingSessions,
  updateTraining,
} from "@/lib/db/repositories/trainings";
import { trainingSchema } from "@/lib/validation/training";
import { getCurrentRole } from "@/lib/auth/current-role";
import { canManageTrainings } from "@/lib/auth/permissions";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const training = await getTrainingById(Number(id));
  if (!training) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({
    ...training,
    sessions: await listSessionsForTraining(training.id),
  });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const role = await getCurrentRole();
  if (!canManageTrainings(role)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const { id } = await params;
  const body = await request.json();
  const parsed = trainingSchema.partial().safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const { sessions, ...trainingInput } = parsed.data;
  await updateTraining(Number(id), trainingInput);
  if (sessions) await replaceTrainingSessions(Number(id), sessions);
  return NextResponse.json({ ok: true });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const role = await getCurrentRole();
  if (!canManageTrainings(role)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const { id } = await params;
  await deleteTraining(Number(id));
  return NextResponse.json({ ok: true });
}
