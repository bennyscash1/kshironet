import { NextResponse } from "next/server";
import { getRequest } from "@/lib/db/repositories/requests";
import { createRequestSoldier, listByRequest } from "@/lib/db/repositories/request-soldiers";
import { requestSoldierSchema } from "@/lib/validation/request-soldier";
import { requireApprovedUser, requireEditor } from "@/lib/auth/user";
import { getCurrentRole } from "@/lib/auth/current-role";
import { battalionCodeOf, isBrigade } from "@/lib/auth/permissions";
import { denyOutOfScope } from "@/lib/auth/scope";
import { getBattalionByCode } from "@/lib/db/repositories/battalions";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const gate = await requireApprovedUser();
  if (gate instanceof NextResponse) return gate;
  const { id } = await params;
  const req = await getRequest(Number(id));
  if (!req) return NextResponse.json({ error: "not found" }, { status: 404 });
  // Soldiers on another battalion's request are not theirs to read.
  const denied = await denyOutOfScope(req.battalion_id);
  if (denied) return denied;
  return NextResponse.json(await listByRequest(Number(id)));
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  // Authoritative privilege gate (server-side identity), independent of the
  // active_role cookie.
  const gate = await requireEditor();
  if (gate instanceof NextResponse) return gate;

  const { id } = await params;
  const req = await getRequest(Number(id));
  if (!req) return NextResponse.json({ error: "not found" }, { status: 404 });

  const body = await request.json();
  const parsed = requestSoldierSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  // Org-scope: a battalion may only attach soldiers for its own battalion; brigade
  // may act on any. (Same cookie-based scoping the rest of the app uses.)
  const role = await getCurrentRole();
  if (!isBrigade(role)) {
    const battalion = await getBattalionByCode(battalionCodeOf(role) ?? "");
    if (!battalion || battalion.id !== parsed.data.battalion_id || battalion.id !== req.battalion_id) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
  }

  const soldierId = await createRequestSoldier({ request_id: Number(id), ...parsed.data });
  return NextResponse.json({ id: soldierId }, { status: 201 });
}
