import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/user";
import { canManageBattalions, canManageBrigades } from "@/lib/auth/permissions";
import type { AppUser } from "@/lib/types";

/**
 * Route-handler gate for the brigade admin API, following the house idiom exactly:
 *
 *   const gate = await requireBrigadeManager();
 *   if (gate instanceof NextResponse) return gate;
 *   const me = gate; // AppUser
 *
 * This is the `canManageBrigades` equivalent of `requireSuperAdmin()` from
 * lib/auth/user.ts. It gates on `canManageBrigades` rather than reusing
 * `requireSuperAdmin` (which is built on `canManageUsers`) so that the capability actually
 * being exercised is the one being checked — the two predicates answer different questions
 * and will diverge when a brigade-level administrator role lands.
 *
 * It lives here rather than beside its siblings in lib/auth/user.ts only to keep this
 * slice's footprint on pre-existing files to a minimum. It belongs in lib/auth/user.ts and
 * should move there when the main Phase 2 plan adds the rest of the brigade guards.
 *
 * The proxy already restricts /api/admin to super_admin, but that block is wrapped in a
 * `try { } catch { }` and falls through on any error, so it is defence in depth and never
 * the gate. This is the gate.
 */
export async function requireBrigadeManager(): Promise<AppUser | NextResponse> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!canManageBrigades(user)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  return user;
}

/**
 * The same gate for battalion administration, on `canManageBattalions`.
 *
 * Separate from `requireBrigadeManager` even though both resolve to super_admin today,
 * because the two capabilities diverge as soon as the brigade-level administrator role
 * exists: it will manage battalions inside its own brigade but must never create a
 * brigade. Gating both on one predicate now would hide that difference and have to be
 * unpicked later.
 */
export async function requireBattalionManager(): Promise<AppUser | NextResponse> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!canManageBattalions(user)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  return user;
}
