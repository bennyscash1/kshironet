"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const REPORT_LINKS = [
  { href: "/reports", label: "סיכום לפי טווח תאריכים" },
  { href: "/reports/battalion-roster", label: "חיילים לפי הסמכה וגדוד" },
  { href: "/reports/other", label: "דוחות נוספים" },
  { href: "/reports/pivot", label: "פילוח הסמכות" },
];

export function ReportsSidebar() {
  const pathname = usePathname();

  return (
    <nav className="flex sm:flex-col gap-1 sm:w-48 shrink-0">
      {REPORT_LINKS.map((link) => {
        const active = pathname === link.href;
        return (
          <Link
            key={link.href}
            href={link.href}
            className={cn(
              "px-3 py-2 rounded-md text-sm font-medium hover:bg-accent transition-colors",
              active && "bg-primary text-primary-foreground hover:bg-primary/90"
            )}
          >
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}
