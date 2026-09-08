"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import type { Notification } from "@/lib/types";

export function NotificationList() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const router = useRouter();

  useEffect(() => {
    fetch("/api/notifications")
      .then((r) => r.json())
      .then(setNotifications);
  }, []);

  async function markRead(id: number) {
    await fetch(`/api/notifications/${id}/read`, { method: "PATCH" });
    setNotifications((rows) => rows.map((n) => (n.id === id ? { ...n, is_read: 1 } : n)));
    router.refresh();
  }

  async function markAllRead() {
    await fetch("/api/notifications/read-all", { method: "PATCH" });
    setNotifications((rows) => rows.map((n) => ({ ...n, is_read: 1 })));
    router.refresh();
  }

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Button variant="outline" size="sm" onClick={markAllRead}>
          סמן הכל כנקרא
        </Button>
      </div>
      <div className="space-y-2">
        {notifications.map((n) => (
          <div
            key={n.id}
            className={`border rounded-md p-3 text-sm flex items-center justify-between gap-2 ${
              n.is_read ? "opacity-60" : "bg-accent/40"
            }`}
          >
            <div>
              <p>{n.message}</p>
              <p className="text-xs text-muted-foreground">
                {new Date(n.created_at).toLocaleString("he-IL")}
              </p>
            </div>
            {!n.is_read && (
              <Button size="sm" variant="ghost" onClick={() => markRead(n.id)}>
                סמן כנקרא
              </Button>
            )}
          </div>
        ))}
        {notifications.length === 0 && (
          <p className="text-muted-foreground text-sm">אין התראות.</p>
        )}
      </div>
    </div>
  );
}
