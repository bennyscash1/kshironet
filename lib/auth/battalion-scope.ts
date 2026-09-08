import type { AppUser } from "@/lib/types";
import { BATTALION_SCOPED_ROLES } from "@/lib/types";

/**
 * The only sections a battalion-scoped user may reach: calendar, requests, battalions,
 * reports. Single source of truth — the navigation and the proxy's page gate both read
 * this list, so they can never drift apart.
 */
export const BATTALION_SCOPED_SECTIONS: string[] = [
  "/calendar",
  "/requests",
  "/battalions",
  "/reports",
  // The force-structure and gaps tabs are battalion-only by design: they show one
  // battalion's establishment and its derived gaps, take their battalion from the
  // session, and carry no battalion in the URL.
  "/force-structure",
  "/gaps",
];

/** Where a scoped user lands when they aim at a section that is not theirs. */
export const BATTALION_SCOPED_HOME = "/calendar";

/**
 * Paths every authenticated user needs regardless of section (identity, notifications,
 * auth pages, the pending screen). Kept separate so the section list above stays purely
 * about the four visible tabs.
 */
const ALWAYS_ALLOWED_PREFIXES = [
  "/api",
  "/login",
  "/signup",
  "/reset-password",
  "/update-password",
  "/auth",
  "/pending",
  "/notifications",
];

/**
 * The only API subtrees a battalion-scoped role may call. Hiding a section's page is not
 * enough — its API would still answer — so everything outside the four sections
 * (certifications, trainings, templates, roster, files, audit, admin, …) is refused in
 * the proxy. Each handler listed here scopes its own rows to the caller's battalion.
 */
const BATTALION_SCOPED_API_PREFIXES = [
  "/api/me",
  "/api/role",
  "/api/notifications",
  "/api/battalions",
  "/api/requests",
  "/api/reports",
  "/api/certification-gaps",
  "/api/force-structure",
  "/api/gaps",
  "/api/battalion",
  // The two roster sub-resources a battalion tracks for its own soldiers: administrative
  // confirmation and required documents. Both are separate tracking layers that never
  // mutate the roster entry itself.
  "/api/roster",
];

function matches(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

/** True when the role string is one of the two battalion-scoped roles. Takes a raw
 * string so the proxy can call it with a value read straight from the database. */
export function isBattalionScopedRole(role: string): boolean {
  return (BATTALION_SCOPED_ROLES as string[]).includes(role);
}

/**
 * May a battalion-scoped user open this page path?
 *
 * THE WHOLE `/certifications` SUBTREE IS CLOSED, including the per-certification detail
 * page. It was briefly opened so a battalion editor could reach the brigade roster screens,
 * which had the side effect of showing them every OTHER battalion's soldiers on the same
 * cycle — read-only, but visible, and not intended. The battalion route
 * (`/battalions/{code}/certifications/{id}`) is self-contained: it carries its own inline
 * add, edit, delete and reserve controls and links nowhere under `/certifications`, so
 * closing this costs a scoped user nothing.
 */
export function isPathAllowedForScopedRole(pathname: string): boolean {
  if (pathname === "/") return true; // the root redirects onward
  if (ALWAYS_ALLOWED_PREFIXES.some((p) => matches(pathname, p))) return true;
  return BATTALION_SCOPED_SECTIONS.some((p) => matches(pathname, p));
}

/** May a battalion-scoped user call this API path at all? Read-scoping to their own
 * battalion still happens inside each handler; this only keeps them out of the APIs
 * belonging to sections they cannot see. */
export function isApiAllowedForScopedRole(pathname: string): boolean {
  return BATTALION_SCOPED_API_PREFIXES.some((p) => matches(pathname, p));
}

/**
 * The battalion-scoped roster endpoints:
 * `/api/battalions/{id}/certifications/{certId}/roster[/{entryId}]`. Each one takes the
 * battalion from the path, refuses a caller confined to a different battalion, and bounds
 * an addition by that battalion's allocation.
 */
const BATTALION_ROSTER_WRITE = /^\/api\/battalions\/\d+\/certifications\/\d+\/roster(\/\d+)?$/;

const ROSTER_WRITE_METHODS = ["POST", "PATCH", "DELETE"];

/**
 * The force-structure writes a battalion editor may perform: moving soldiers between
 * posts and the bank, and recording certifications they hold.
 *
 * `/api/force-structure/admin/roles` is deliberately NOT matched here. That is the
 * seeding path — the only writer of `roles` — and it is gated on super-admin instead,
 * because the establishment is reference data that a battalion editor may never change.
 */
const FORCE_STRUCTURE_WRITE =
  /^\/api\/force-structure\/(assignments|bank|soldier-certifications)(\/\d+)?(\/move)?$/;

/** Editing the operational requirement key, switching source, and nominating candidates.
 * The establishment key has no route at all — see gap_requirement_keys' lock. */
const GAPS_WRITE = /^\/api\/gaps\/\d+\/(key|active-source|nominations)(\/\d+)?$/;

/** Administrative confirmation and required-document tracking for one roster entry.
 * Neither touches `roster_entries` itself. */
const ROSTER_TRACKING_WRITE = /^\/api\/roster\/\d+\/(admin-confirmation|documents)$/;



/** The two writes a battalion editor may perform: a request for their own battalion, and
 * managing their own battalion's soldiers on a certification within its allocation.
 * Everything else stays denied by `canEdit()` inside the individual handlers. */
export function isWriteAllowedForBattalionEditor(pathname: string, method: string): boolean {
  if (method === "POST" && pathname === "/api/requests") return true;
  if (ROSTER_WRITE_METHODS.includes(method) && BATTALION_ROSTER_WRITE.test(pathname)) return true;
  // The new subtrees additionally accept PUT (replacing a requirement key, setting a
  // document's state); the roster rule above keeps its original three methods.
  if (!ROSTER_WRITE_METHODS.includes(method) && method !== "PUT") return false;
  return (
    FORCE_STRUCTURE_WRITE.test(pathname) ||
    GAPS_WRITE.test(pathname) ||
    ROSTER_TRACKING_WRITE.test(pathname)
  );
}

/** Convenience for server components: the battalion a user is confined to, or null. */
export function scopedBattalionIdOf(user: AppUser | null): number | null {
  if (!user || user.status !== "approved") return null;
  return isBattalionScopedRole(user.role) ? user.battalion_id : null;
}
