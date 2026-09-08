import { NextResponse } from "next/server";
import { requireBattalionEditor } from "@/lib/auth/scope";
import { replaceOperationalKey } from "@/lib/db/repositories/gaps";
import { z } from "zod";

const schema = z.strictObject({
  battalion_id: z.coerce.number().int().positive(),
  lines: z.array(
    z.strictObject({
      qty: z.coerce.number().int().min(0),
      unitType: z.string().min(1),
    })
  ),
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

  await replaceOperationalKey(gapRowId, parsed.data.battalion_id, parsed.data.lines);
  return NextResponse.json({ ok: true });
}
