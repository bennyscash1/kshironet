import { NextResponse } from "next/server";
import { listDomainsWithCertifications } from "@/lib/db/repositories/certification-pivot";
import { requireApprovedUser } from "@/lib/auth/user";

/** Domains (תחום) with their certifications, for the widget pickers. */
export async function GET() {
  const gate = await requireApprovedUser();
  if (gate instanceof NextResponse) return gate;

  return NextResponse.json(await listDomainsWithCertifications());
}
