"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { RosterStatusBadge } from "@/components/certifications/status-badge";
import { ROSTER_STATUS_LABELS, ROSTER_STATUSES, type RosterEntry, type RosterStatus } from "@/lib/types";

export function RosterStatusChanger({
  entry,
  canManage = true,
}: {
  entry: RosterEntry;
  canManage?: boolean;
}) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [outcomeReason, setOutcomeReason] = useState(entry.outcome_reason ?? "");

  async function changeStatus(status: RosterStatus) {
    setSubmitting(true);
    const res = await fetch(`/api/roster/${entry.id}/status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        status,
        outcome_reason: status === "failed" || status === "did_not_participate" ? outcomeReason : undefined,
      }),
    });
    setSubmitting(false);
    if (!res.ok) {
      toast.error("שינוי הסטטוס נכשל");
      return;
    }
    toast.success("הסטטוס עודכן");
    router.refresh();
  }

  return (
    <div className="border rounded-md p-3 space-y-3">
      <div className="flex items-center gap-2">
        <span className="text-sm text-muted-foreground">סטטוס נוכחי:</span>
        <RosterStatusBadge status={entry.status} />
      </div>
      {canManage && (entry.status === "failed" || entry.status === "did_not_participate") && (
        <Textarea
          placeholder="סיבה"
          value={outcomeReason}
          onChange={(e) => setOutcomeReason(e.target.value)}
        />
      )}
      {canManage && (
        <div className="flex flex-wrap gap-2">
          {ROSTER_STATUSES.filter((s) => s !== entry.status).map((s) => (
            <Button key={s} size="sm" variant="outline" disabled={submitting} onClick={() => changeStatus(s)}>
              {ROSTER_STATUS_LABELS[s]}
            </Button>
          ))}
        </div>
      )}
    </div>
  );
}
