import { NextResponse } from "next/server";
import { runPivotReport } from "@/lib/db/repositories/certification-pivot";
import { pivotQuerySchema } from "@/lib/validation/pivot";
import { requireApprovedUser } from "@/lib/auth/user";
import { getBattalionScope } from "@/lib/auth/scope";

/** Per-battalion soldier counts for the certification-pivot widgets.
 * POST (not GET) because the payload is two id arrays plus a range. */
export async function POST(request: Request) {
  // Read-only report: any approved user may run it. Gated on the server-side identity
  // — the active_role cookie is a view-scope selector, never an authorization source.
  const gate = await requireApprovedUser();
  if (gate instanceof NextResponse) return gate;

  const body = await request.json();
  const parsed = pivotQuerySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  // A battalion-scoped role may only chart its own battalion, whatever the payload asks
  // for, so the battalion list is clamped rather than trusted. Clamping (not rejecting)
  // means a shared saved widget that names several battalions still renders — as their
  // own column alone. Global roles are unaffected.
  const scope = await getBattalionScope();
  const filters = scope
    ? {
        ...parsed.data,
        battalionIds: parsed.data.battalionIds.filter((id) => id === scope.battalionId),
      }
    : parsed.data;

  return NextResponse.json(await runPivotReport(filters));
}
