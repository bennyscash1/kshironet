"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import type { Battalion, RosterEntry } from "@/lib/types";

export function ConfirmCompletionPanel({
  certificationId,
  roster,
  battalionMap,
}: {
  certificationId: number;
  roster: RosterEntry[];
  battalionMap: Map<number, Battalion>;
}) {
  const router = useRouter();
  const [passedIds, setPassedIds] = useState<Set<number>>(
    () => new Set(roster.map((r) => r.id))
  );
  const [submitting, setSubmitting] = useState(false);

  function toggle(id: number, checked: boolean) {
    setPassedIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  async function confirm() {
    setSubmitting(true);
    try {
      const res = await fetch(`/api/certifications/${certificationId}/confirm-completion`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ passed_ids: Array.from(passedIds) }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "failed");
      }
      toast.success("ההסמכה סומנה כבוצעה");
      router.refresh();
    } catch (err) {
      toast.error((err as Error).message || "אישור ההשלמה נכשל");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 space-y-3">
      <div>
        <h2 className="font-semibold text-amber-900">אישור השלמת הסמכה</h2>
        <p className="text-sm text-amber-800">
          סמן מי עבר. מי שלא יסומן יסומן כ״לא עבר הסמכה״, וההסמכה תעבור לסטטוס בוצעה.
        </p>
      </div>
      <div className="space-y-2 max-h-64 overflow-auto">
        {roster.map((entry) => (
          <label key={entry.id} className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={passedIds.has(entry.id)}
              onCheckedChange={(v) => toggle(entry.id, Boolean(v))}
            />
            <span className="font-medium">{entry.full_name}</span>
            <span className="text-muted-foreground">
              ({battalionMap.get(entry.battalion_id)?.name ?? "—"} · {entry.personal_number})
            </span>
          </label>
        ))}
      </div>
      <Button onClick={confirm} disabled={submitting}>
        {submitting ? "שומר..." : "אשר השלמה"}
      </Button>
    </div>
  );
}
