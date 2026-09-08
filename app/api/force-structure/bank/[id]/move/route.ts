import { NextResponse } from "next/server";
import { placeBankOnRole } from "@/lib/db/repositories/force-structure";
import { requireBattalionEditor } from "@/lib/auth/scope";
import { z } from "zod";

const schema = z.strictObject({
  role_id: z.coerce.number().int().positive(),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const bankId = Number(id);
  if (!Number.isInteger(bankId)) {
    return NextResponse.json({ error: "invalid id" }, { status: 400 });
  }

  const body = await request.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const battalionId = Number(new URL(request.url).searchParams.get("battalionId"));
  if (!Number.isInteger(battalionId)) {
    return NextResponse.json({ error: "invalid battalion" }, { status: 400 });
  }

  const gate = await requireBattalionEditor(battalionId);
  if (gate instanceof NextResponse) return gate;

  const result = await placeBankOnRole(bankId, parsed.data.role_id, battalionId);
  if (!result.ok) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
