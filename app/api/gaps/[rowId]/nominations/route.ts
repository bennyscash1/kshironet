import { NextResponse } from "next/server";
import { requireBattalionEditor } from "@/lib/auth/scope";
import { addNomination, deleteNomination } from "@/lib/db/repositories/gaps";
import { assertAssignmentNominable } from "@/lib/force-structure/nominate";
import { z } from "zod";

const createSchema = z
  .strictObject({
    battalion_id: z.coerce.number().int().positive(),
    certification_id: z.coerce.number().int().positive().nullish(),
    role_assignment_id: z.coerce.number().int().positive().nullish(),
    free_text_name: z.string().min(1).nullish(),
    note: z.string().nullish(),
  })
  .refine(
    (v) =>
      (v.role_assignment_id != null && !v.free_text_name) ||
      (v.role_assignment_id == null && !!v.free_text_name),
    { message: "exactly one of role_assignment_id or free_text_name" }
  );

export async function POST(
  request: Request,
  { params }: { params: Promise<{ rowId: string }> }
) {
  const { rowId } = await params;
  const gapRowId = Number(rowId);
  if (!Number.isInteger(gapRowId)) {
    return NextResponse.json({ error: "invalid id" }, { status: 400 });
  }
  const parsed = createSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const gate = await requireBattalionEditor(parsed.data.battalion_id);
  if (gate instanceof NextResponse) return gate;

  if (parsed.data.role_assignment_id) {
    const allowed = await assertAssignmentNominable(
      parsed.data.role_assignment_id,
      parsed.data.battalion_id
    );
    if (!allowed.allowed) {
      return NextResponse.json({ error: allowed.error }, { status: allowed.status });
    }
  }

  const id = await addNomination({
    gapRowId,
    battalionId: parsed.data.battalion_id,
    certificationId: parsed.data.certification_id,
    roleAssignmentId: parsed.data.role_assignment_id,
    freeTextName: parsed.data.free_text_name,
    note: parsed.data.note,
    createdByRole: gate.changedByRole,
  });
  return NextResponse.json({ id }, { status: 201 });
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ rowId: string }> }
) {
  const { rowId } = await params;
  const url = new URL(request.url);
  const nominationId = Number(url.searchParams.get("id"));
  const battalionId = Number(url.searchParams.get("battalionId"));
  if (!Number.isInteger(nominationId) || !Number.isInteger(battalionId)) {
    return NextResponse.json({ error: "invalid id" }, { status: 400 });
  }
  const gate = await requireBattalionEditor(battalionId);
  if (gate instanceof NextResponse) return gate;
  void rowId;
  await deleteNomination(nominationId, battalionId);
  return NextResponse.json({ ok: true });
}
