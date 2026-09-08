import { NextResponse } from "next/server";
import { battalionRosterReport } from "@/lib/db/repositories/reports";
import { requireApprovedUser } from "@/lib/auth/user";
import { getBattalionScope } from "@/lib/auth/scope";

/** "מי יוצא לאיזו הסמכה", filtered by battalion. A battalion-scoped caller is pinned to
 * their own battalion and cannot widen the result set with `?battalion=`; for a global role
 * the parameter is an optional filter and omitting it returns every battalion. */
export async function GET(request: Request) {
  const gate = await requireApprovedUser();
  if (gate instanceof NextResponse) return gate;

  const url = new URL(request.url);
  const scope = await getBattalionScope();
  const requested = url.searchParams.get("battalion");
  const battalionId = scope
    ? scope.battalionId
    : requested
    ? Number(requested)
    : undefined;
  if (battalionId !== undefined && !Number.isInteger(battalionId)) {
    return NextResponse.json({ error: "invalid battalion" }, { status: 400 });
  }

  return NextResponse.json(
    await battalionRosterReport({
      battalionId,
      from: url.searchParams.get("from") ?? undefined,
      to: url.searchParams.get("to") ?? undefined,
    })
  );
}
