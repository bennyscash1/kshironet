import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/user";
import { canEditBattalion, getScopedBattalionId } from "@/lib/auth/permissions";
import { getBattalionById } from "@/lib/db/repositories/battalions";
import type { AppUser, Battalion } from "@/lib/types";

/** A code that matches no battalion, so a broken scope shows nothing instead of
 * everything. Only reachable if a battalion row were deleted from under the FK. */
const NO_BATTALION_CODE = "__no_battalion__";

export interface BattalionScope {
  user: AppUser;
  /** Authoritative id from the user's database row. */
  battalionId: number;
  /** The battalion row itself, for name/colour display. */
  battalion: Battalion | null;
  /** Code to pass to code-based repository filters. Never widens the result set. */
  code: string;
}

/**
 * Resolves the caller's battalion confinement from the AUTHENTICATED SESSION and their
 * database row — never from the `active_role` cookie, which any client can set.
 *
 * Returns null for every global role (super_admin / editor / viewer), meaning "apply no
 * battalion filter", which preserves their existing system-wide behaviour exactly.
 *
 *   const scope = await getBattalionScope();
 *   const battalionCode = scope?.code;   // undefined → unfiltered (global roles)
 */
export async function getBattalionScope(): Promise<BattalionScope | null> {
  const user = await getCurrentUser();
  const battalionId = getScopedBattalionId(user);
  if (!user || battalionId === null) return null;

  const battalion = (await getBattalionById(battalionId)) ?? null;
  return {
    user,
    battalionId,
    battalion,
    // Fails closed: a missing battalion must not turn into "see every battalion".
    code: battalion?.code ?? NO_BATTALION_CODE,
  };
}

/**
 * Route-handler guard for a row that belongs to one battalion. Returns a 404 response
 * when a battalion-scoped caller asks for another battalion's row, and null when the
 * request may proceed (always null for global roles, whose reach is unchanged):
 *
 *   const denied = await denyOutOfScope(request.battalion_id);
 *   if (denied) return denied;
 */
export async function denyOutOfScope(battalionId: number): Promise<NextResponse | null> {
  const scope = await getBattalionScope();
  if (scope && scope.battalionId !== battalionId) {
    // 404, not 403: whether a row exists in another battalion is itself not theirs to learn.
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  return null;
}

export interface BattalionEditorContext {
  user: AppUser;
  battalion: Battalion;
  /** `battalion:CODE`, for the audit trail — which battalion the write was made for. */
  changedByRole: string;
}

/**
 * Guard for a write that belongs to one battalion (a soldier on a certification):
 *
 *   const gate = await requireBattalionEditor(battalionId);
 *   if (gate instanceof NextResponse) return gate;
 *
 * Refuses a battalion-scoped caller aiming at another battalion (404), and anyone who may
 * not edit that battalion (403) — which includes `viewer_battalion`, who is read-only.
 * Global editors/admins pass for any battalion, so their reach is unchanged.
 */
export async function requireBattalionEditor(
  battalionId: number
): Promise<BattalionEditorContext | NextResponse> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const denied = await denyOutOfScope(battalionId);
  if (denied) return denied;

  if (!canEditBattalion(user, battalionId)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const battalion = await getBattalionById(battalionId);
  if (!battalion) return NextResponse.json({ error: "not found" }, { status: 404 });

  return { user, battalion, changedByRole: `battalion:${battalion.code}` };
}
