import { NextResponse } from "next/server";
import { listNotifications, SUPER_ADMIN_NOTIFICATION_ROLE } from "@/lib/db/repositories/notifications";
import { getCurrentRole } from "@/lib/auth/current-role";
import { getCurrentUser } from "@/lib/auth/user";
import { isSuperAdmin } from "@/lib/auth/permissions";
import { getBattalionScope } from "@/lib/auth/scope";

export async function GET(request: Request) {
  // A battalion-scoped role reads its own battalion's queue, taken from their user row —
  // not the active_role cookie, which would otherwise hand them the brigade's queue.
  const scope = await getBattalionScope();
  const role = scope ? `battalion:${scope.code}` : await getCurrentRole();
  const user = await getCurrentUser();
  const extraRoles = isSuperAdmin(user) ? [SUPER_ADMIN_NOTIFICATION_ROLE] : [];
  const url = new URL(request.url);
  const unreadOnly = url.searchParams.get("unreadOnly") === "1";
  return NextResponse.json(await listNotifications(role, unreadOnly, extraRoles));
}
