import { execute, query } from "@/lib/db/client";
import type { EntityType, Notification, NotificationType } from "@/lib/types";
import type { PoolClient } from "pg";

/** Pseudo target_role used for notifications aimed at super-admins (user approvals). */
export const SUPER_ADMIN_NOTIFICATION_ROLE = "super_admin";

export async function createNotification(
  input: {
    type: NotificationType;
    target_role: string;
    entity_type?: EntityType;
    entity_id?: number;
    message: string;
  },
  client?: PoolClient
) {
  await execute(
    `INSERT INTO notifications (type, target_role, entity_type, entity_id, message)
     VALUES ($1, $2, $3, $4, $5)`,
    [input.type, input.target_role, input.entity_type ?? null, input.entity_id ?? null, input.message],
    client
  );
}

function resolveTargetRoles(targetRole: string, extraRoles: string[] = []): string[] {
  const base = targetRole === "brigade" ? ["brigade"] : [targetRole, "battalion:all"];
  return [...new Set([...base, ...extraRoles])];
}

export async function listNotifications(
  targetRole: string,
  unreadOnly = false,
  extraRoles: string[] = []
): Promise<Notification[]> {
  const roles = resolveTargetRoles(targetRole, extraRoles);
  const placeholders = roles.map((_, index) => `$${index + 1}`).join(",");
  const sql = `SELECT * FROM notifications WHERE target_role IN (${placeholders}) ${
    unreadOnly ? "AND is_read = 0" : ""
  } ORDER BY created_at DESC`;
  return query<Notification>(sql, roles);
}

export async function markNotificationRead(id: number) {
  await execute("UPDATE notifications SET is_read = 1 WHERE id = $1", [id]);
}

export async function markAllNotificationsRead(targetRole: string, extraRoles: string[] = []) {
  const roles = resolveTargetRoles(targetRole, extraRoles);
  const placeholders = roles.map((_, index) => `$${index + 1}`).join(",");
  await execute(`UPDATE notifications SET is_read = 1 WHERE target_role IN (${placeholders})`, roles);
}
