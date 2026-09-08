"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useRole } from "@/lib/auth/role-context";

export function NotificationBell() {
  const [unread, setUnread] = useState(0);
  const { role } = useRole();

  useEffect(() => {
    let cancelled = false;
    fetch("/api/notifications?unreadOnly=1")
      .then((r) => r.json())
      .then((rows) => {
        if (!cancelled) setUnread(rows.length);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [role]);

  return (
    <Button variant="ghost" size="icon" asChild className="relative">
      <Link href="/notifications">
        <Bell className="size-5" />
        {unread > 0 && (
          <span className="absolute -top-1 -end-1 flex size-4 items-center justify-center rounded-full bg-destructive text-[10px] text-white">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </Link>
    </Button>
  );
}
