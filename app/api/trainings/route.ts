import { NextResponse } from "next/server";
import { createTraining, listTrainings } from "@/lib/db/repositories/trainings";
import { trainingSchema } from "@/lib/validation/training";
import { getCurrentRole } from "@/lib/auth/current-role";
import { canManageTrainings } from "@/lib/auth/permissions";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const trainings = await listTrainings({
    domain: url.searchParams.get("domain") ?? undefined,
    from: url.searchParams.get("from") ?? undefined,
    to: url.searchParams.get("to") ?? undefined,
  });
  return NextResponse.json(trainings);
}

export async function POST(request: Request) {
  const role = await getCurrentRole();
  if (!canManageTrainings(role)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const body = await request.json();
  const parsed = trainingSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const { sessions, ...trainingInput } = parsed.data;
  const id = await createTraining(trainingInput, sessions);
  return NextResponse.json({ id }, { status: 201 });
}
