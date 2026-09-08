import { NextResponse } from "next/server";
import { listStatusHistory } from "@/lib/db/repositories/audit";
import type { EntityType } from "@/lib/types";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const entityType = url.searchParams.get("entityType") as EntityType | null;
  const entityId = url.searchParams.get("entityId");
  if (!entityType || !entityId) {
    return NextResponse.json({ error: "entityType and entityId required" }, { status: 400 });
  }
  return NextResponse.json(await listStatusHistory(entityType, Number(entityId)));
}
