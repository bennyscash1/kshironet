import { NextResponse } from "next/server";
import { markAllNotificationsRead, SUPER_ADMIN_NOTIFICATION_ROLE } from "@/lib/db/repositories/notifications";
import { getCurrentRole } from "@/lib/auth/current-role";
import { getCurrentUser } from "@/lib/auth/user";
import { isSuperAdmin } from "@/lib/auth/permissions";
import { getBattalionScope } from "@/lib/auth/scope";

export async function PATCH() {
  // Same scoping as the GET: a scoped user marks their own battalion's notifications
  // read, never the brigade's.
  const scope = await getBattalionScope();
  const role = scope ? `battalion:${scope.code}` : await getCurrentRole();
  const user = await getCurrentUser();
  const extraRoles = isSuperAdmin(user) ? [SUPER_ADMIN_NOTIFICATION_ROLE] : [];
  await markAllNotificationsRead(role, extraRoles);
  return NextResponse.json({ ok: true });
}
