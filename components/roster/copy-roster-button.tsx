"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Check, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { copyToClipboard } from "@/lib/utils/clipboard";
import { formatSoldierBlocks, rosterEntryToCopyInput } from "@/lib/roster/copy-format";
import type { Battalion, RosterEntry } from "@/lib/types";

/**
 * Copies every soldier in the roster table as one pasteable message.
 *
 * The caller passes exactly the rows it renders, which is how the button stays limited to
 * the non-reserve list: the עתודה table is a separate `entries` array and simply never
 * reaches this component. Nothing is fetched — the rows are already on the page.
 *
 * The block format lives in lib/roster/copy-format.ts and is shared with the per-row copy
 * button, so a single soldier copied here and copied from their own row are identical.
 */
export function CopyRosterButton({
  certificationName,
  entries,
  battalions,
}: {
  certificationName: string;
  entries: RosterEntry[];
  battalions: Battalion[];
}) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  async function copyAll() {
    if (entries.length === 0) return;
    const battalionMap = new Map(battalions.map((b) => [b.id, b]));
    const text = formatSoldierBlocks(
      entries.map((e) =>
        rosterEntryToCopyInput(e, certificationName, battalionMap.get(e.battalion_id))
      )
    );
    if (!(await copyToClipboard(text))) {
      toast.error("ההעתקה נכשלה");
      return;
    }
    toast.success(`${entries.length} חיילים הועתקו`);
    if (timer.current) clearTimeout(timer.current);
    setCopied(true);
    timer.current = setTimeout(() => setCopied(false), 1500);
  }

  return (
    <Button
      size="sm"
      variant="outline"
      // Disabled rather than hidden on an empty roster: the control staying put explains
      // why there is nothing to copy, where a vanishing button reads as a missing feature.
      disabled={entries.length === 0}
      onClick={copyAll}
      title="העתקת כל החיילים ברשימה"
    >
      {copied ? <Check className="size-4 text-emerald-600" /> : <Copy className="size-4" />}
      העתק את כל החיילים
    </Button>
  );
}
