import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/proxy";
import { getUserById } from "@/lib/db/repositories/users";
import {
  BATTALION_SCOPED_HOME,
  isApiAllowedForScopedRole,
  isBattalionScopedRole,
  isPathAllowedForScopedRole,
  isWriteAllowedForBattalionEditor,
} from "@/lib/auth/battalion-scope";

/** Routes reachable without an authenticated session. */
const PUBLIC_ROUTES = [
  "/login", "/signup", "/reset-password", "/update-password", "/auth",
];

/** API paths any authenticated user may call (identity + own notifications + view switch).
 *
 * `/api/reports/pivot` covers the whole pivot-report subtree: running the report is a
 * POST only because its payload is two id arrays (it writes nothing), and saved widgets
 * are shared report configuration that viewers may save/delete too. Both are therefore
 * exempt from the viewers-are-read-only rule below. Approval and identity are still
 * enforced authoritatively by `requireApprovedUser()` inside each handler. */
const API_ALLOW_ANY = [
  "/api/me",
  "/api/role",
  "/api/notifications",
  "/api/reports/pivot",
];

const WRITE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

function forbidden() {
  return NextResponse.json({ error: "forbidden" }, { status: 403 });
}

export async function proxy(request: NextRequest) {
  // Always refresh the session so tokens stay valid across requests.
  const { response, user } = await updateSession(request);

  const { pathname } = request.nextUrl;
  const isPublic = PUBLIC_ROUTES.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`)
  );

  // Unauthenticated users are redirected to /login for any protected route.
  if (!user) {
    if (!isPublic) {
      const url = request.nextUrl.clone();
      url.pathname = "/login";
      return NextResponse.redirect(url);
    }
    return response;
  }

  // Authenticated: gate on approval status + role. Best-effort — the
  // authoritative checks also live in the admin page guard and admin handlers,
  // so a DB hiccup here never hard-fails the whole app.
  try {
    const appUser = await getUserById(user.id);
    const status = appUser?.status ?? "pending";
    const role = appUser?.role ?? "viewer";
    const approved = status === "approved";
    const canEditData = approved && (role === "super_admin" || role === "editor");

    const isApi = pathname.startsWith("/api");

    if (isApi) {
      const allowAny = API_ALLOW_ANY.some(
        (p) => pathname === p || pathname.startsWith(`${p}/`)
      );
      // Pending/rejected users get no API access (except identity/self endpoints).
      if (!approved && !allowAny) return forbidden();

      // Admin API is super-admin only.
      if (pathname.startsWith("/api/admin")) {
        if (role !== "super_admin") return forbidden();
      } else if (isBattalionScopedRole(role) && !isApiAllowedForScopedRole(pathname)) {
        // The APIs behind the sections a scoped role cannot see are refused outright —
        // otherwise hiding the tab would only hide the page, not the data behind it.
        return forbidden();
      } else if (WRITE_METHODS.has(request.method) && !allowAny) {
        // Viewers are read-only across all domain write endpoints.
        // A battalion-scoped editor is the one exception, and only for creating a
        // request; every other write stays denied here, and the handlers' own
        // `canEdit()` (false for scoped roles) denies them a second time.
        if (
          !canEditData &&
          !(
            role === "editor_battalion" &&
            isWriteAllowedForBattalionEditor(pathname, request.method)
          )
        ) {
          return forbidden();
        }
      }
      return response;
    }

    // Page routes.
    const onPending = pathname === "/pending" || pathname.startsWith("/pending/");
    if (!approved) {
      if (!onPending && !isPublic) {
        const url = request.nextUrl.clone();
        url.pathname = "/pending";
        return NextResponse.redirect(url);
      }
    } else {
      if (onPending) {
        const url = request.nextUrl.clone();
        url.pathname = "/";
        return NextResponse.redirect(url);
      }
      if (
        (pathname === "/admin" || pathname.startsWith("/admin/")) &&
        role !== "super_admin"
      ) {
        const url = request.nextUrl.clone();
        url.pathname = "/";
        return NextResponse.redirect(url);
      }
      // Battalion-scoped roles reach only their four sections (calendar, requests,
      // battalions, reports) — hiding the nav items is not enough on its own.
      if (isBattalionScopedRole(role) && !isPathAllowedForScopedRole(pathname)) {
        const url = request.nextUrl.clone();
        url.pathname = BATTALION_SCOPED_HOME;
        return NextResponse.redirect(url);
      }
    }
  } catch {
    // Best-effort gate; fall through and let page/handler guards enforce.
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
