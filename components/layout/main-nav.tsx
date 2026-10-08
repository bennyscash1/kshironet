"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Menu, X } from "lucide-react";
import { RoleSwitcher } from "@/components/layout/role-switcher";
import { BrigadeSwitcher, type BrigadeOption } from "@/components/layout/brigade-switcher";
import { NotificationBell } from "@/components/notifications/notification-bell";
import { isAuthRoute } from "@/lib/auth/routes";
import type { NavLink } from "@/lib/auth/nav";
import { cn } from "@/lib/utils";
import { APP_LOGO, APP_NAME_WITH_BRIGADE, APP_SLOGAN } from "@/lib/config/app";

/**
 * `links` is resolved on the server from the authenticated user's row (see
 * `navLinksFor`) and passed in as a prop. It is deliberately NOT derived here from a
 * client fetch: doing so rendered every tab — including the forbidden ones — until
 * /api/me came back.
 *
 * `scopedBattalionName` is set only for the battalion-scoped roles; it pins the view
 * selector to their own battalion instead of offering the whole brigade.
 *
 * `brigades` is EMPTY for anyone who may not switch brigade — absent from the payload
 * rather than hidden with CSS, so a non-super-admin's HTML never contains the other
 * brigades' names. It is also empty when only one brigade exists: there is nothing to
 * switch between, and a selector with a single option is noise.
 *
 * `canSwitchBattalionView` gates the battalion selector separately, because the two are
 * different capabilities — a brigade commander will switch battalions within their own
 * brigade without being able to change brigade.
 */
export function MainNav({
  links,
  scopedBattalionName,
  brigades,
  activeBrigade,
  canSwitchBattalionView,
}: {
  links: NavLink[];
  scopedBattalionName?: string | null;
  brigades: BrigadeOption[];
  activeBrigade: BrigadeOption | null;
  canSwitchBattalionView: boolean;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  // Auth pages render a clean centered card with no app chrome.
  if (isAuthRoute(pathname)) return null;

  return (
    <header className="bg-card relative border-b-2 border-primary/20">
      <div className="absolute inset-x-0 bottom-0 h-[3px] bg-gradient-to-l from-primary via-chart-2 to-chart-4" />
      <div className="max-w-7xl mx-auto flex items-center justify-between gap-4 p-3">
        {/* RTL: DOM order runs right-to-left, so the logo after the title text renders
            to its visual left. Height-driven classes with `w-auto` keep the artwork's
            aspect ratio at every breakpoint. */}
        <Link href="/calendar" className="flex items-center gap-2 shrink-0">
          <span className="flex flex-col leading-tight">
            <span className="font-extrabold text-lg bg-gradient-to-l from-primary to-chart-2 bg-clip-text text-transparent">
              {APP_NAME_WITH_BRIGADE}
            </span>
            {/* The slogan only appears once there is room for it — on a phone the header
                already carries the burger, the bell and the role switcher, and a second
                line of text there pushes the nav into a wrap. */}
            <span className="hidden lg:block text-[11px] text-muted-foreground font-medium">
              {APP_SLOGAN}
            </span>
          </span>
          <Image
            src={APP_LOGO.src}
            alt={APP_LOGO.alt}
            width={APP_LOGO.width}
            height={APP_LOGO.height}
            priority
            className="h-8 md:h-10 lg:h-12 w-auto"
          />
        </Link>

        <nav className="hidden md:flex items-center gap-1 flex-1">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={cn(
                "px-3 py-2 rounded-md text-sm font-medium hover:bg-accent transition-colors",
                pathname?.startsWith(link.href) && "bg-primary text-primary-foreground hover:bg-primary/90"
              )}
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="hidden md:flex items-center gap-2">
          {brigades.length > 0 && (
            <BrigadeSwitcher brigades={brigades} activeBrigade={activeBrigade} />
          )}
          {(canSwitchBattalionView || scopedBattalionName) && (
            <RoleSwitcher scopedBattalionName={scopedBattalionName} />
          )}
          <NotificationBell />
        </div>

        <button
          className="md:hidden p-2"
          onClick={() => setOpen((o) => !o)}
          aria-label="תפריט"
        >
          {open ? <X className="size-5" /> : <Menu className="size-5" />}
        </button>
      </div>

      {open && (
        <div className="md:hidden border-t p-3 flex flex-col gap-1">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              onClick={() => setOpen(false)}
              className={cn(
                "px-3 py-2 rounded-md text-sm font-medium hover:bg-accent transition-colors",
                pathname?.startsWith(link.href) && "bg-primary text-primary-foreground"
              )}
            >
              {link.label}
            </Link>
          ))}
          <div className="flex flex-wrap items-center gap-2 pt-2 border-t mt-1">
            {brigades.length > 0 && (
              <BrigadeSwitcher brigades={brigades} activeBrigade={activeBrigade} />
            )}
            {(canSwitchBattalionView || scopedBattalionName) && (
              <RoleSwitcher scopedBattalionName={scopedBattalionName} />
            )}
            <NotificationBell />
          </div>
        </div>
      )}
    </header>
  );
}
