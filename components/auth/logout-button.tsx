"use client";

import { useState } from "react";
import { LogOut } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";

export function LogoutButton({ className }: { className?: string }) {
  const [loading, setLoading] = useState(false);

  async function logout() {
    setLoading(true);
    const supabase = createClient();
    await supabase.auth.signOut();
    // Hard navigation so the server drops the session immediately.
    window.location.assign("/login");
  }

  return (
    <Button variant="outline" className={className} onClick={logout} disabled={loading}>
      <LogOut className="size-4" />
      {loading ? "מתנתק…" : "התנתקות"}
    </Button>
  );
}
