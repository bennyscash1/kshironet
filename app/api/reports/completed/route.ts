import { NextResponse } from "next/server";
import { completedCertifications } from "@/lib/db/repositories/reports";
import { requireApprovedUser } from "@/lib/auth/user";
import { getBattalionScope } from "@/lib/auth/scope";

export async function GET() {
  const gate = await requireApprovedUser();
  if (gate instanceof NextResponse) return gate;

  // Battalion-scoped roles get their own battalion only; global roles stay unfiltered.
  const scope = await getBattalionScope();
  return NextResponse.json(await completedCertifications(scope?.battalionId));
}
