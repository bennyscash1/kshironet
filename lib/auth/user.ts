import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { ensureUser } from "@/lib/db/repositories/users";
import { canEdit, canManageUsers, canView } from "@/lib/auth/permissions";
import type { AppUser } from "@/lib/types";

/**
 * Resolves the current authenticated user into an app-level user row (role +
 * approval status), creating the row on first sight. Returns null when there is
 * no valid Supabase session. Use in Server Components and Route Handlers.
 */
export async function getCurrentUser(): Promise<AppUser | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  return ensureUser({
    id: user.id,
    email: user.email ?? "",
    full_name: (user.user_metadata?.full_name as string | undefined) ?? null,
    // Free text captured at signup. Persisted on first sight as an indication for the
    // admin — it never influences the role or battalion the user actually gets.
    requested_role_text:
      (user.user_metadata?.requested_role_text as string | undefined) ?? null,
    requested_battalion_text:
      (user.user_metadata?.requested_battalion_text as string | undefined) ?? null,
  });
}

// --- Route Handler guards -------------------------------------------------
// Each returns the AppUser when allowed, or a NextResponse to return directly:
//   const gate = await requireEditor();
//   if (gate instanceof NextResponse) return gate;
//   const user = gate; // AppUser

export async function requireApprovedUser(): Promise<AppUser | NextResponse> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!canView(user)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  return user;
}

export async function requireEditor(): Promise<AppUser | NextResponse> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!canEdit(user)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  return user;
}

export async function requireSuperAdmin(): Promise<AppUser | NextResponse> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!canManageUsers(user)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  return user;
}
