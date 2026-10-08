import { NextResponse } from "next/server";
import {
  listActiveBattalionsForBrigade,
  listBattalions,
} from "@/lib/db/repositories/battalions";
import { getBattalionScope } from "@/lib/auth/scope";
import { getCurrentUser } from "@/lib/auth/user";
import { canSwitchActiveBrigade } from "@/lib/auth/permissions";
import { activeBrigadeId } from "@/lib/auth/active-brigade";

/**
 * The battalions a caller may pick from.
 *
 * Three cases, in order:
 *   1. A battalion-scoped role is offered only its own battalion (unchanged).
 *   2. A super admin is offered the ACTIVE brigade's battalions — filtered in SQL, not by
 *      narrowing an unscoped list — and an EMPTY list when no brigade is selected. Empty
 *      is correct: falling back to every brigade's battalions is the exact confusion the
 *      brigade selector exists to remove.
 *   3. Every other global role behaves exactly as before.
 *
 * The brigade filter here is application-level and is NOT a security boundary. It is
 * correct for a super admin because a super admin is authorised across every brigade. It
 * must not be relied on for any other role before row level security lands.
 */
export async function GET() {
  const scope = await getBattalionScope();
  if (scope) {
    const battalions = await listBattalions();
    return NextResponse.json(battalions.filter((b) => b.id === scope.battalionId));
  }

  const me = await getCurrentUser();
  if (canSwitchActiveBrigade(me)) {
    const brigadeId = await activeBrigadeId();
    if (brigadeId === null) return NextResponse.json([]);
    return NextResponse.json(await listActiveBattalionsForBrigade(brigadeId));
  }

  return NextResponse.json(await listBattalions());
}
