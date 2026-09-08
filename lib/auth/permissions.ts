import { BATTALION_SCOPED_ROLES, type AppUser, type Role } from "@/lib/types";

// --- Real per-user authorization (privilege axis: super_admin/editor/viewer) ---
// These operate on the authenticated AppUser (from lib/auth/user.ts) and are the
// authoritative gate. They are orthogonal to the organizational role below
// (brigade / battalion:CODE), which remains a view-scope selector.

/** Any approved user may read the app. */
export function canView(user: AppUser | null): boolean {
  return !!user && user.status === "approved";
}

/** Super-admins and editors (approved) may create/update/delete app data. */
export function canEdit(user: AppUser | null): boolean {
  return (
    !!user &&
    user.status === "approved" &&
    (user.role === "super_admin" || user.role === "editor")
  );
}

/** Only super-admins may manage users (approve, change roles, delete). */
export function canManageUsers(user: AppUser | null): boolean {
  return !!user && user.status === "approved" && user.role === "super_admin";
}

export function isSuperAdmin(user: AppUser | null): boolean {
  return canManageUsers(user);
}

// --- Battalion-scoped roles (additive; the functions above are untouched) ----------
// viewer_battalion / editor_battalion are limited to their own `battalion_id`.
//
// Note that `canEdit()` above deliberately returns FALSE for editor_battalion. That is
// what keeps them out of every pre-existing write endpoint (certifications, trainings,
// roster, files, …), which are all gated on `canEdit()` and are none of their business.
// Their one permitted write — a request for their own battalion — is gated by
// `canEditBattalion()` below, which takes the target battalion and can therefore check it.

/** True for the two battalion-scoped roles, regardless of approval status. */
export function isBattalionScoped(user: AppUser | null): boolean {
  return !!user && BATTALION_SCOPED_ROLES.includes(user.role);
}

/**
 * The battalion a user is confined to, or null when they are global (super_admin /
 * editor / viewer) and therefore see everything.
 *
 * Repository and API layers use this to decide whether to apply a battalion filter:
 * non-null → filter to that battalion; null → no filter (existing behaviour).
 */
export function getScopedBattalionId(user: AppUser | null): number | null {
  if (!user || user.status !== "approved") return null;
  return isBattalionScoped(user) ? user.battalion_id : null;
}

/** May this user edit data belonging to `battalionId`?
 *  - global editors/admins: yes (unchanged, any battalion)
 *  - editor_battalion: only their own battalion
 *  - everyone else (incl. viewer_battalion): no */
export function canEditBattalion(user: AppUser | null, battalionId: number): boolean {
  if (canEdit(user)) return true;
  return (
    !!user &&
    user.status === "approved" &&
    user.role === "editor_battalion" &&
    user.battalion_id === battalionId
  );
}

/** May this user perform ANY edit (without naming a target yet)? Use for showing an
 * "add" affordance; the actual write must still be checked with `canEditBattalion()`. */
export function canEditAnything(user: AppUser | null): boolean {
  return canEdit(user) || (!!user && user.status === "approved" && user.role === "editor_battalion");
}

// --- Certification lifecycle --------------------------------------------------------

/**
 * May this user move a certification between statuses — in particular draft -> open?
 *
 * WHAT THIS REPLACES. The status route authorized with
 * `canManageCertifications(await getCurrentRole())`, i.e. from the `active_role` cookie,
 * which is a view selector any client can set and which `getCurrentRole()` defaults to
 * "brigade" when absent. It failed in both directions: the route trusted a client-supplied
 * value and had no session check of its own, while a genuine super-admin or editor whose
 * cookie was parked on a battalion preview — the normal state after using the role switcher
 * — silently lost both the button and the endpoint. Only 6 of 109 recorded draft creations
 * were ever opened; that lockout is the leading explanation.
 *
 * It delegates to `canEdit`, so it is exactly the set of global write roles
 * (super_admin / editor) and no brigade capability is narrowed. Battalion-scoped roles are
 * excluded, as they were before: a battalion manages names on a cycle, never the cycle.
 *
 * TAKES THE AUTHENTICATED `AppUser`, NEVER A `Role`. The `Role` axis is the cookie.
 */
export function canManageCertificationStatus(user: AppUser | null): boolean {
  return canEdit(user);
}

// --- Roster entries -----------------------------------------------------------------

/**
 * THE roster-write permission: may this user create, edit, delete or re-status a roster
 * entry belonging to `battalionId`?
 *
 * CAPABILITY AND OWNERSHIP IN ONE CALL, deliberately. Every roster write needs both
 * answers, and a design where the caller asks "can you edit?" and then separately
 * remembers to ask "is it yours?" is one where a route eventually forgets the second
 * question. There is no variant of this function that skips the battalion.
 *
 * - global editors / super-admins: any battalion, exactly as before
 * - editor_battalion: their OWN battalion only
 * - viewer_battalion, viewer, unapproved: never
 *
 * It delegates to `canEditBattalion` rather than restating the rule, so a battalion
 * editor's roster reach can never drift from their reach over their own data generally,
 * and a brigade editor's reach cannot be narrowed here by accident.
 *
 * IT TAKES THE AUTHENTICATED `AppUser`, NOT A `Role`. The `Role` axis comes from the
 * `active_role` cookie, which is a view selector any client can set — see the status route
 * for what trusting it used to cost.
 */
export function canManageRosterEntry(user: AppUser | null, battalionId: number): boolean {
  return canEditBattalion(user, battalionId);
}

/**
 * May this user manage roster entries for at least one battalion? For deciding whether to
 * render an "add soldier" affordance at all, before a battalion has been picked.
 *
 * NOT AN AUTHORIZATION CHECK. The write itself must still go through
 * `canManageRosterEntry()` with the target battalion.
 */
export function canManageAnyRoster(user: AppUser | null): boolean {
  return canEditAnything(user);
}

/**
 * The role string stamped on the audit trail (`status_history.changed_by_role`) for a write
 * by `user`.
 *
 * SAME VOCABULARY AS BEFORE, DIFFERENT SOURCE. The column already holds "brigade" (707
 * rows) and "battalion:CODE", and this keeps producing exactly those two shapes — emitting
 * "editor"/"super_admin" instead would fragment a column the history is read from. What
 * changes is where the value comes from: the authenticated row rather than
 * `getCurrentRole()`, so the trail can no longer record whatever the `active_role` cookie
 * claimed the writer to be.
 */
export function auditRoleOf(user: AppUser | null, battalionCode?: string | null): string {
  if (!user) return "unknown";
  if (isBattalionScoped(user)) return `battalion:${battalionCode ?? user.battalion_id ?? "?"}`;
  return "brigade";
}

// --- Organizational scope (unchanged): brigade vs battalion:CODE ---

export function isBrigade(role: Role): boolean {
  return role === "brigade";
}

export function battalionCodeOf(role: Role): string | null {
  return role.startsWith("battalion:") ? role.slice("battalion:".length) : null;
}

export function canManageCertifications(role: Role): boolean {
  return isBrigade(role);
}

export function canApproveRoster(role: Role): boolean {
  return isBrigade(role);
}

export function canManageTrainings(role: Role): boolean {
  return isBrigade(role);
}

export function canApproveRequests(role: Role): boolean {
  return isBrigade(role);
}

export function canSubmitRequest(role: Role, battalionId: number, battalionCodeById: (id: number) => string | null): boolean {
  if (isBrigade(role)) return true;
  return battalionCodeOf(role) === battalionCodeById(battalionId);
}

export function canRegisterSoldier(role: Role): boolean {
  // Brigade or any battalion may register a soldier to an open certification.
  return true;
}

export function canViewBattalionData(role: Role, battalionCode: string): boolean {
  if (isBrigade(role)) return true;
  return battalionCodeOf(role) === battalionCode;
}
