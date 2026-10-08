"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Building2, Check, ChevronDown, Loader2 } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";

export interface BrigadeOption {
  public_id: string;
  name: string;
}

/**
 * Which brigade the whole application is showing. Super admin only.
 *
 * Deliberately NOT the same control as the battalion view selector next to it, and
 * deliberately not extra items inside it: a brigade and a battalion are not two entries in
 * one list, and if the two selectors looked alike nobody would know which one they were
 * changing. This one is solid/primary with a building icon and the brigade's name; the
 * battalion selector is outline with a coloured dot.
 *
 * The options and the current value are resolved on the SERVER and passed in as props.
 * `main-nav.tsx` records why: deriving them from a client fetch rendered the wrong state
 * until the request came back.
 *
 * Selecting POSTs to /api/admin/active-brigade and only then navigates. It is not a link
 * to /admin/brigades/<id>, because Next.js prefetches links in the viewport — a GET that
 * switched the brigade would fire merely because the menu scrolled into view.
 */
export function BrigadeSwitcher({
  brigades,
  activeBrigade,
}: {
  brigades: BrigadeOption[];
  activeBrigade: BrigadeOption | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function choose(publicId: string) {
    if (busy || publicId === activeBrigade?.public_id) return;
    setBusy(true);
    const res = await fetch("/api/admin/active-brigade", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "select", brigade_public_id: publicId }),
    });
    setBusy(false);

    if (!res.ok) {
      let message = "המעבר בין חטיבות נכשל";
      try {
        const body = await res.json();
        if (typeof body?.error === "string") message = body.error;
      } catch {
        // keep the fallback
      }
      toast.error(message);
      return;
    }

    // Navigate to the brigade's page and refresh, so every server component re-resolves
    // against the new active brigade rather than showing the previous one's data.
    router.push(`/admin/brigades/${publicId}`);
    router.refresh();
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="sm" className="gap-2 font-semibold" disabled={busy}>
          {busy ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Building2 className="size-4" />
          )}
          {activeBrigade ? activeBrigade.name : "בחר חטיבה"}
          <ChevronDown className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        <DropdownMenuLabel>חטיבה פעילה</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {brigades.map((b) => (
          <DropdownMenuItem
            key={b.public_id}
            onClick={() => choose(b.public_id)}
            className="gap-2"
          >
            {b.public_id === activeBrigade?.public_id ? (
              <Check className="size-4 text-primary" />
            ) : (
              <span className="size-4" />
            )}
            {b.name}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
