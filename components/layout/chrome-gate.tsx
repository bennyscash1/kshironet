"use client";

import { usePathname } from "next/navigation";
import { isAuthRoute } from "@/lib/auth/routes";

/** Hides its children on auth pages (login/signup/reset/update-password). */
export function ChromeGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  if (isAuthRoute(pathname)) return null;
  return <>{children}</>;
}
