"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Loader2, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CertificationStatusBadge } from "@/components/certifications/status-badge";
import {
  allowedTransitionsFrom,
  OPEN_FOR_REGISTRATION,
} from "@/lib/certifications/transitions";
import {
  CERTIFICATION_STATUS_LABELS,
  type Certification,
  type CertificationStatus,
} from "@/lib/types";

/** The action wording for the one transition the brigade actually needs to find.
 * "פתח להרשמה" is an instruction; the status label "פתוחה להרשמה" reads as a state and is
 * what made this control easy to walk past. */
const OPEN_ACTION_LABEL = "פתח להרשמה";

export function CertificationStatusChanger({
  certification,
  canManage,
}: {
  certification: Certification;
  canManage: boolean;
}) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState<CertificationStatus | null>(null);

  async function changeStatus(status: CertificationStatus) {
    setSubmitting(status);
    const res = await fetch(`/api/certifications/${certification.id}/status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    setSubmitting(null);
    if (!res.ok) {
      toast.error("שינוי הסטטוס נכשל");
      return;
    }
    toast.success("הסטטוס עודכן");
    router.refresh();
  }

  // The map now lives in lib/certifications/transitions.ts, shared with the repository that
  // enforces it — so this cannot offer a button the server would reject.
  const options = allowedTransitionsFrom(certification.status);
  const canOpen = options.includes(OPEN_FOR_REGISTRATION);
  // Everything except "open" keeps the previous secondary treatment. Promoting only the
  // one action stops it competing with "בוטלה", which sat beside it at identical weight.
  const secondary = options.filter((s) => s !== OPEN_FOR_REGISTRATION);
  const busy = submitting !== null;

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <span className="text-sm text-muted-foreground">סטטוס:</span>
      <CertificationStatusBadge status={certification.status} />
      {canManage && canOpen && (
        <Button
          size="sm"
          disabled={busy}
          onClick={() => changeStatus(OPEN_FOR_REGISTRATION)}
          title="פתיחת ההסמכה להרשמת הגדודים"
        >
          {submitting === OPEN_FOR_REGISTRATION ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Send className="size-4" />
          )}
          {OPEN_ACTION_LABEL}
        </Button>
      )}
      {canManage &&
        secondary.map((s) => (
          <Button
            key={s}
            size="sm"
            variant="outline"
            // Destructive ink on "בוטלה" only, so it cannot be mistaken for the primary
            // open action sitting next to it.
            className={s === "cancelled" ? "text-destructive hover:text-destructive" : undefined}
            disabled={busy}
            onClick={() => changeStatus(s)}
          >
            {submitting === s && <Loader2 className="size-4 animate-spin" />}
            {CERTIFICATION_STATUS_LABELS[s]}
          </Button>
        ))}
    </div>
  );
}
