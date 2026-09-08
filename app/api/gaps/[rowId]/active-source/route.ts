import { NextResponse } from "next/server";
import { requireBattalionEditor } from "@/lib/auth/scope";
import { setActiveSource } from "@/lib/db/repositories/gaps";
import { z } from "zod";

const schema = z.strictObject({
  battalion_id: z.coerce.number().int().positive(),
  source: z.enum(["operational", "establishment"]),
});

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ rowId: string }> }
) {
  const { rowId } = await params;
  const gapRowId = Number(rowId);
  if (!Number.isInteger(gapRowId)) {
    return NextResponse.json({ error: "invalid id" }, { status: 400 });
  }
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const gate = await requireBattalionEditor(parsed.data.battalion_id);
  if (gate instanceof NextResponse) return gate;

  await setActiveSource(gapRowId, parsed.data.battalion_id, parsed.data.source);
  return NextResponse.json({ ok: true });
}
