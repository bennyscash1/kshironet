import { NextResponse } from "next/server";
import { lookupSoldiers } from "@/lib/db/repositories/force-structure";
import { requireApprovedUser } from "@/lib/auth/user";
import { denyOutOfScope } from "@/lib/auth/scope";

export async function GET(request: Request) {
  const gate = await requireApprovedUser();
  if (gate instanceof NextResponse) return gate;

  const url = new URL(request.url);
  const q = url.searchParams.get("q") ?? "";
  const battalionId = Number(url.searchParams.get("battalionId"));
  if (!Number.isInteger(battalionId)) {
    return NextResponse.json({ error: "invalid battalion" }, { status: 400 });
  }
  const denied = await denyOutOfScope(battalionId);
  if (denied) return denied;

  return NextResponse.json(await lookupSoldiers(battalionId, q));
}
