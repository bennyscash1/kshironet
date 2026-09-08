import { NextResponse } from "next/server";
import { renameCourse } from "@/lib/db/repositories/templates";
import { getCurrentRole } from "@/lib/auth/current-role";
import { canManageCertifications } from "@/lib/auth/permissions";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ name: string }> }
) {
  const role = await getCurrentRole();
  if (!canManageCertifications(role)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const { name: encodedOldName } = await params;
  const oldName = decodeURIComponent(encodedOldName);
  const body = await request.json();
  const newName = typeof body.name === "string" ? body.name.trim() : "";
  const domain = typeof body.domain === "string" && body.domain.trim() ? body.domain.trim() : null;
  if (!newName) {
    return NextResponse.json({ error: "name required" }, { status: 400 });
  }
  await renameCourse(oldName, newName, domain);
  return NextResponse.json({ name: newName });
}
