import { NextResponse } from "next/server";
import {
  deleteInfluencingFactor,
  getInfluencingFactorBattalionIds,
  getInfluencingFactorById,
  updateInfluencingFactor,
} from "@/lib/db/repositories/influencing-factors";
import { listBattalions } from "@/lib/db/repositories/battalions";
import { influencingFactorSchema } from "@/lib/validation/influencing-factor";
import { requireEditor } from "@/lib/auth/user";

async function invalidBattalionIds(ids: number[]): Promise<number[]> {
  if (ids.length === 0) return [];
  const valid = new Set((await listBattalions()).map((b) => b.id));
  return ids.filter((id) => !valid.has(id));
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const factor = await getInfluencingFactorById(Number(id));
  if (!factor) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({
    ...factor,
    battalion_ids: await getInfluencingFactorBattalionIds(factor.id),
  });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const gate = await requireEditor();
  if (gate instanceof NextResponse) return gate;

  const { id } = await params;
  const body = await request.json();
  const parsed = influencingFactorSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const { battalion_ids, ...input } = parsed.data;
  const bad = await invalidBattalionIds(battalion_ids);
  if (bad.length) {
    return NextResponse.json({ error: "יחידות לא תקינות" }, { status: 400 });
  }
  await updateInfluencingFactor(Number(id), input, battalion_ids);
  return NextResponse.json({ ok: true });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const gate = await requireEditor();
  if (gate instanceof NextResponse) return gate;

  const { id } = await params;
  await deleteInfluencingFactor(Number(id));
  return NextResponse.json({ ok: true });
}
