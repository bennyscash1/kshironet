"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useRole } from "@/lib/auth/role-context";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { ChevronDown, LogOut, Shield } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type { Battalion } from "@/lib/types";

/** `scopedBattalionName` is passed by the server for the two battalion-scoped roles. It
 * turns the view selector into a fixed label for their own battalion: switching view is
 * a brigade affordance, and offering it to a scoped user would suggest a reach they do
 * not have (the server ignores the cookie for them either way). */
export function RoleSwitcher({ scopedBattalionName }: { scopedBattalionName?: string | null }) {
  const router = useRouter();
  const { role, setRole } = useRole();
  const [battalions, setBattalions] = useState<Battalion[]>([]);

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  useEffect(() => {
    fetch("/api/battalions")
      .then((r) => r.json())
      .then(setBattalions)
      .catch(() => {});
  }, []);

  const currentBattalion = battalions.find((b) => `battalion:${b.code}` === role);
  const label = scopedBattalionName ?? (role === "brigade" ? "מטה חטיבה" : currentBattalion?.name ?? role);

  // Scoped roles: their own battalion, plus logout. No other view to switch to.
  if (scopedBattalionName) {
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className="gap-2 font-semibold">
            <Shield className="size-4 text-primary" />
            {label}
            <ChevronDown className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <DropdownMenuLabel>{label}</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={handleLogout}
            className="text-destructive focus:text-destructive"
          >
            <LogOut className="size-4" />
            התנתקות
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="gap-2 font-semibold"
          style={
            currentBattalion
              ? { borderColor: currentBattalion.color_hex, color: currentBattalion.color_hex }
              : undefined
          }
        >
          {currentBattalion ? (
            <span
              className="inline-block size-2.5 rounded-full shadow-sm"
              style={{ backgroundColor: currentBattalion.color_hex }}
            />
          ) : (
            <Shield className="size-4 text-primary" />
          )}
          תצוגה כ: {label}
          <ChevronDown className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        <DropdownMenuLabel>בחר תצוגת משתמש</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => setRole("brigade")} className="font-medium">
          <Shield className="size-4 text-primary" />
          מטה חטיבה
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        {battalions.map((b) => (
          <DropdownMenuItem key={b.code} onClick={() => setRole(`battalion:${b.code}`)}>
            <span
              className="inline-block size-2.5 rounded-full shadow-sm"
              style={{ backgroundColor: b.color_hex }}
            />
            {b.name}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={handleLogout}
          className="text-destructive focus:text-destructive"
        >
          <LogOut className="size-4" />
          התנתקות
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
