import { NextResponse } from "next/server";
import { requireApprovedUser } from "@/lib/auth/user";
import { denyOutOfScope } from "@/lib/auth/scope";
import {
  listCertificationFamilies,
  listComputedGaps,
  listGapKeys,
  listUnitCounts,
} from "@/lib/db/repositories/gaps";

export async function GET(request: Request) {
  const gate = await requireApprovedUser();
  if (gate instanceof NextResponse) return gate;

  const battalionId = Number(new URL(request.url).searchParams.get("battalionId"));
  if (!Number.isInteger(battalionId)) {
    return NextResponse.json({ error: "invalid battalion" }, { status: 400 });
  }
  const denied = await denyOutOfScope(battalionId);
  if (denied) return denied;

  const [families, rows, keys, units] = await Promise.all([
    listCertificationFamilies(),
    listComputedGaps(battalionId),
    listGapKeys(battalionId),
    listUnitCounts(battalionId),
  ]);
  return NextResponse.json({ families, rows, keys, units });
}
