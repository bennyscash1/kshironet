import { cache } from "react";
import { getCurrentUser } from "@/lib/auth/user";
import { canSwitchActiveBrigade } from "@/lib/auth/permissions";
import { getBrigadeById } from "@/lib/db/repositories/brigades";
import type { AppUser, Brigade } from "@/lib/types";

/**
 * The brigade a super admin is currently acting in.
 *
 * Shaped after `getBattalionScope()` in lib/auth/scope.ts, and it follows the same three
 * rules that file established:
 *
 *   1. RESOLVED FROM THE DATABASE, NEVER FROM THE CLIENT. The value comes from
 *      `users.active_brigade_id` on the authenticated row. Not a cookie, not a header, not
 *      a query parameter, not a request body. Changing it means calling
 *      POST /api/admin/active-brigade.
 *   2. NULL MEANS "NO BRIGADE SELECTED", never "every brigade". Callers must render an
 *      explicit empty state rather than falling back to an unfiltered list — showing every
 *      brigade's data is the exact confusion this feature exists to remove.
 *   3. FAILS CLOSED. A dangling or deactivated `active_brigade_id` resolves to null, the
 *      same way `scope.ts` uses NO_BATTALION_CODE so a broken scope shows nothing rather
 *      than everything.
 *
 * WHY THIS IS NOT A SECURITY BOUNDARY, AND MUST NOT BECOME ONE
 * A super admin is authorised across every brigade by definition, so filtering their view
 * is a convenience and application-level filtering is enough for it. Every other role's
 * brigade scoping IS a boundary and has to wait for row level security (migrations
 * 033-035). `canSwitchActiveBrigade` is super_admin-only for exactly this reason — do not
 * widen it before RLS lands.
 */
export interface ActiveBrigade {
  user: AppUser;
  brigade: Brigade;
}

/**
 * Memoised per request with React `cache()`.
 *
 * `getCurrentUser()` already runs about twice per request (the root layout and then the
 * page or route gate), each time costing a Supabase `auth.getUser()` call plus a `users`
 * SELECT. This adds a third consumer of the same row, so without memoisation the auth path
 * would get slower; with it, the header resolves the brigade for free.
 */
export const getActiveBrigade = cache(async (): Promise<ActiveBrigade | null> => {
  const user = await getCurrentUser();
  if (!canSwitchActiveBrigade(user) || !user) return null;
  if (user.active_brigade_id === null) return null;

  const brigade = await getBrigadeById(user.active_brigade_id);

  // Fails closed on both halves: a row that no longer exists, and a brigade that has been
  // deactivated. Either way the answer is "no brigade selected" and the caller shows its
  // empty state — a stale selection must not silently widen into everything.
  if (!brigade || brigade.is_active !== 1) return null;

  return { user, brigade };
});

/** The active brigade's id, or null. The shape most callers want. */
export async function activeBrigadeId(): Promise<number | null> {
  return (await getActiveBrigade())?.brigade.id ?? null;
}
