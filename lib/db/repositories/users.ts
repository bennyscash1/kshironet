import { execute, query, queryOne, withTransaction } from "@/lib/db/client";
import { createNotification } from "@/lib/db/repositories/notifications";
import { SUPER_ADMIN_NOTIFICATION_ROLE } from "@/lib/db/repositories/notifications";
import type { AppUser, UserRole } from "@/lib/types";

export async function getUserById(id: string): Promise<AppUser | undefined> {
  return queryOne<AppUser>("SELECT * FROM users WHERE id = $1", [id]);
}

export async function listPendingUsers(): Promise<AppUser[]> {
  return query<AppUser>(
    "SELECT * FROM users WHERE status = 'pending' ORDER BY created_at ASC"
  );
}

export async function listAllUsers(): Promise<AppUser[]> {
  return query<AppUser>(
    "SELECT * FROM users ORDER BY (status = 'pending') DESC, created_at DESC"
  );
}

/**
 * Ensures an app-level row exists for an authenticated Supabase user.
 * First-seen users are inserted as pending/viewer, and a notification is raised
 * for super-admins. Existing users (incl. those backfilled by the migration as
 * approved viewers) are left untouched. Returns the current row.
 */
export async function ensureUser(input: {
  id: string;
  email: string;
  full_name?: string | null;
  /** Free-text signup indications carried over from the auth user's metadata. Stored
   * for the admin to read; never used for authorization. */
  requested_role_text?: string | null;
  requested_battalion_text?: string | null;
}): Promise<AppUser> {
  const existing = await getUserById(input.id);
  if (existing) return existing;

  return withTransaction(async (client) => {
    const result = await execute(
      `INSERT INTO users (id, email, full_name, requested_role_text, requested_battalion_text)
         VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (id) DO NOTHING`,
      [
        input.id,
        input.email,
        input.full_name ?? null,
        input.requested_role_text ?? null,
        input.requested_battalion_text ?? null,
      ],
      client
    );

    // A row was actually inserted (not a race with a concurrent request):
    // notify super-admins about the new pending registration.
    if (result.rowCount > 0) {
      await createNotification(
        {
          type: "user_registered",
          target_role: SUPER_ADMIN_NOTIFICATION_ROLE,
          message: `משתמש חדש נרשם וממתין לאישור: ${input.full_name || input.email}`,
        },
        client
      );
    }

    const rows = await query<AppUser>(
      "SELECT * FROM users WHERE id = $1",
      [input.id],
      client
    );
    return rows[0];
  });
}

/** Approves a pending user with a role. `battalionId` is required for the two
 * battalion-scoped roles and must be null for every global role (the DB enforces both). */
export async function approveUser(input: {
  id: string;
  role: Extract<UserRole, "viewer" | "editor" | "viewer_battalion" | "editor_battalion">;
  battalionId?: number | null;
  approvedBy: string;
}): Promise<void> {
  await execute(
    `UPDATE users
        SET status = 'approved', role = $2, battalion_id = $3,
            approved_by = $4, approved_at = NOW()
      WHERE id = $1`,
    [input.id, input.role, input.battalionId ?? null, input.approvedBy]
  );
}

/** Sets role and battalion together — they are one decision, and the DB constraint
 * rejects any combination where a scoped role lacks a battalion (or vice versa). */
export async function updateUserRole(
  id: string,
  role: UserRole,
  battalionId?: number | null
): Promise<void> {
  await execute("UPDATE users SET role = $2, battalion_id = $3 WHERE id = $1", [
    id,
    role,
    battalionId ?? null,
  ]);
}

/**
 * Soft-delete: revoke access by marking the row rejected. The Supabase Auth
 * account remains (we intentionally do not use a service-role key); the access
 * gate blocks rejected users, and ensureUser leaves the rejected row intact.
 */
export async function rejectUser(id: string): Promise<void> {
  await execute("UPDATE users SET status = 'rejected' WHERE id = $1", [id]);
}
