import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/user";
import { BATTALION_SCOPED_HOME, scopedBattalionIdOf } from "@/lib/auth/battalion-scope";
import { getBattalionScope } from "@/lib/auth/scope";
import { getCurrentRole } from "@/lib/auth/current-role";
import { battalionCodeOf, canEditBattalion } from "@/lib/auth/permissions";
import { getBattalionByCode } from "@/lib/db/repositories/battalions";
import { activeBrigadeId } from "@/lib/auth/active-brigade";
import type { Battalion } from "@/lib/types";

/**
 * Server guard for the sections a battalion-scoped role may not open (הדרכות, הסמכות,
 * בנק הסמכות, ניהול…). Call it from the section's `layout.tsx` so every nested route is
 * covered.
 *
 * The proxy already redirects these paths, but it is deliberately best-effort (it swallows
 * database errors so a hiccup never locks the whole app out). This is the authoritative
 * check, run inside the page render with the user's real row — a hidden tab must not be
 * reachable by typing its URL.
 *
 * Global roles fall straight through, so their pages are unchanged.
 */
export async function requireGlobalSection(): Promise<void> {
  const user = await getCurrentUser();
  if (scopedBattalionIdOf(user) !== null) redirect(BATTALION_SCOPED_HOME);
}

export interface BattalionContext {
  battalion: Battalion;
  canEdit: boolean;
}

/**
 * The inverse of {@link requireGlobalSection}: the battalion that the two battalion-only
 * sections (שניים לפנים, פערים) operate on.
 *
 * Those screens take their battalion from the session and never from the URL — they have
 * no battalion segment to spoof (spec §0.2.1). Resolution, in order:
 *
 *   1. a battalion-scoped user gets the battalion on their authenticated database row.
 *      This is authoritative and cannot be influenced by the client.
 *   2. a global user gets the battalion they selected in the existing role switcher,
 *      validated against the battalions table.
 *
 * The cookie is only ever consulted for someone who is not confined to begin with, so it
 * can narrow a global user's view but can never widen a scoped one's. A plain brigade
 * view has selected no battalion and there is nothing to show, so it is sent back to the
 * battalion list to pick one.
 *
 * Call from the section's `layout.tsx` so every nested route is covered, and take the id
 * for every query from the returned battalion.
 */
export async function requireBattalionContext(): Promise<BattalionContext> {
  const scope = await getBattalionScope();
  if (scope?.battalion) {
    return {
      battalion: scope.battalion,
      canEdit: canEditBattalion(scope.user, scope.battalionId),
    };
  }

  const user = await getCurrentUser();
  if (!user || user.status !== "approved") redirect(BATTALION_SCOPED_HOME);

  // The battalion a global user selected in the view switcher, resolved WITHIN the active
  // brigade. The cookie supplies only WHICH BATTALION; which BRIGADE comes from
  // users.active_brigade_id on the authenticated row, so the cookie can still narrow the
  // view but can never reach into another brigade.
  //
  // A null brigade means either "super admin has selected none" or "this role has no
  // brigade yet" (editor/viewer, until users.brigade_id lands in migration 032). Both fail
  // CLOSED to the battalion index, which carries the Hebrew "no brigade selected" state
  // and points at the brigade selector. Never an unscoped cross-brigade lookup.
  const brigadeId = await activeBrigadeId();
  if (brigadeId === null) redirect("/battalions");

  const code = battalionCodeOf(await getCurrentRole());
  const battalion = code ? await getBattalionByCode(code, brigadeId) : undefined;

  // A code in another brigade and a code that does not exist are the same outcome here:
  // both leave `battalion` undefined and redirect. Nothing distinguishes them, so this
  // cannot be used to discover that a battalion exists elsewhere.
  if (!battalion) redirect("/battalions");

  return { battalion, canEdit: canEditBattalion(user, battalion.id) };
}
