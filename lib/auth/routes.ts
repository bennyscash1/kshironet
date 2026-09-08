/** Public auth routes — no authenticated session required, and the app chrome
 * (MainNav / OpenTasksBar) is hidden on these pages. */
export const AUTH_ROUTES = [
  "/login",
  "/signup",
  "/reset-password",
  "/update-password",
  "/pending",
] as const;

/** True for any auth page (used to suppress the app header/chrome). */
export function isAuthRoute(pathname: string | null | undefined): boolean {
  if (!pathname) return false;
  return AUTH_ROUTES.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`)
  );
}
