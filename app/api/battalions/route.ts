import { NextResponse } from "next/server";
import { listBattalions } from "@/lib/db/repositories/battalions";
import { getBattalionScope } from "@/lib/auth/scope";

export async function GET() {
  // A battalion-scoped role is offered only its own battalion (view selector, pickers,
  // filters); global roles get the full list exactly as before.
  const scope = await getBattalionScope();
  const battalions = await listBattalions();
  return NextResponse.json(
    scope ? battalions.filter((b) => b.id === scope.battalionId) : battalions
  );
}
