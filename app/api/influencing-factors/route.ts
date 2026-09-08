import { NextResponse } from "next/server";
import {
  createInfluencingFactor,
  listInfluencingFactors,
} from "@/lib/db/repositories/influencing-factors";
import { listBattalions } from "@/lib/db/repositories/battalions";
import { influencingFactorSchema } from "@/lib/validation/influencing-factor";
import { requireEditor } from "@/lib/auth/user";

async function invalidBattalionIds(ids: number[]): Promise<number[]> {
  if (ids.length === 0) return [];
  const valid = new Set((await listBattalions()).map((b) => b.id));
  return ids.filter((id) => !valid.has(id));
}

export async function GET() {
  return NextResponse.json(await listInfluencingFactors());
}

export async function POST(request: Request) {
  const gate = await requireEditor();
  if (gate instanceof NextResponse) return gate;

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
  const id = await createInfluencingFactor(input, battalion_ids);
  return NextResponse.json({ id }, { status: 201 });
}
