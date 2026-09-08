import { NextResponse } from "next/server";
import { deleteRequest, getRequest, updateRequest } from "@/lib/db/repositories/requests";
import { requestSchema } from "@/lib/validation/request";
import { requireEditor } from "@/lib/auth/user";
import { getCurrentRole } from "@/lib/auth/current-role";
import { isBrigade } from "@/lib/auth/permissions";
import { denyOutOfScope } from "@/lib/auth/scope";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const req = await getRequest(Number(id));
  if (!req) return NextResponse.json({ error: "not found" }, { status: 404 });
  const denied = await denyOutOfScope(req.battalion_id);
  if (denied) return denied;
  return NextResponse.json(req);
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await request.json();
  const parsed = requestSchema.partial().safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  await updateRequest(Number(id), parsed.data);
  return NextResponse.json({ ok: true });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  // Authoritative privilege gate (server-side identity). Deleting a request is a
  // brigade action; the brigade/battalion distinction is a cookie-based view scope.
  const gate = await requireEditor();
  if (gate instanceof NextResponse) return gate;
  const role = await getCurrentRole();
  if (!isBrigade(role)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const { id } = await params;
  await deleteRequest(Number(id));
  return NextResponse.json({ ok: true });
}
