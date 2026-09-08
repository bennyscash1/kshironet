"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Loader2, Lock, LockOpen, CheckCircle2, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import {
  DEFAULT_LOCK_HOUR,
  LOCK_HOUR_OPTIONS,
  formatLockMoment,
  normalizeLockHour,
  type RegistrationLockFields,
} from "@/lib/utils/registration-lock";
import { RegistrationLockCountdown } from "@/components/certifications/registration-lock-countdown";
import type { Battalion, CertificationBattalionQuota } from "@/lib/types";

/**
 * Registration controls on the certification detail page.
 *
 * The deadline is a DATE AND AN HOUR (migration 022), Israel wall-clock, whole hours only.
 * A NULL hour keeps the original end-of-day meaning. Every battalion is shown the same
 * countdown to that one moment, because there is one moment.
 *
 * ONE registration deadline for the whole certification, not one per battalion. Each
 * allocation used to carry its own date input and save button, which repeated the same
 * control for every battalion down the page and let two battalions end up with deadlines
 * that disagreed. Migration 021 moved the date onto `certifications`, so the control moved
 * with it — up here, once, and collapsed by default.
 */

/** One allocation: its quota and its trainee-list approval. No deadline of its own. */
function QuotaRow({
  certificationId,
  quota,
  battalionName,
  canManage,
  isMine,
  locked,
}: {
  certificationId: number;
  quota: CertificationBattalionQuota;
  battalionName: string;
  canManage: boolean;
  isMine: boolean;
  /** The certification's lock state — the same value for every row. */
  locked: boolean;
}) {
  const router = useRouter();
  const [approving, setApproving] = useState(false);

  async function approveTrainees() {
    setApproving(true);
    const res = await fetch(
      `/api/certifications/${certificationId}/quotas/${quota.battalion_id}/approve-trainees`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ battalion_id: quota.battalion_id }),
      }
    );
    setApproving(false);
    if (res.status === 403) {
      toast.error("ההרשמה נסגרה — חלף מועד הנעילה");
      router.refresh();
      return;
    }
    if (!res.ok) {
      toast.error("אישור רשימת המתאמנים נכשל");
      return;
    }
    const data = (await res.json()) as { submitted: number };
    toast.success(`רשימת המתאמנים אושרה (${data.submitted} חיילים)`);
    router.refresh();
  }

  return (
    <div className="rounded-md border p-3 space-y-2">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <span className="font-medium text-sm">
          {battalionName} · הקצאה: {quota.allocated_slots}
        </span>
      </div>

      {(isMine || canManage) && (
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" disabled={approving || locked} onClick={approveTrainees}>
            {approving ? <Loader2 className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />}
            אשר רשימת מתאמנים
          </Button>
          {locked && (
            <span className="text-xs text-destructive">ההרשמה סגורה — חלף מועד הנעילה</span>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * The single certification-level deadline, collapsed by default.
 *
 * EDITOR ONLY. The caller renders this exclusively for users who may actually change the
 * lock, so there is no read-only variant in here any more — a battalion view gets the
 * countdown above instead, which is the part they were ever meant to read. Keeping a
 * disabled-looking editor around only advertised a control that would 403.
 *
 * Saves through the existing `PATCH /api/certifications/[id]` rather than an endpoint of its
 * own — the deadline is a field of the certification now, so it goes where every other
 * certification field goes. A partial PATCH carrying only this key leaves the rest alone.
 * That endpoint does its own server-side check, so hiding this is presentation, never the
 * authorization boundary.
 */
function LockDateSection({
  certificationId,
  lock,
  locked,
}: {
  certificationId: number;
  lock: RegistrationLockFields;
  locked: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [dateValue, setDateValue] = useState(lock.registration_lock_date ?? "");
  // The hour lives in state as a STRING because that is what a <select> deals in; "" is the
  // legitimate "no hour set" state (= end of the lock day), not a missing value.
  const [hourValue, setHourValue] = useState(
    normalizeLockHour(lock.registration_lock_hour)?.toString() ?? ""
  );
  const [saving, setSaving] = useState(false);

  const formatted = formatLockMoment(lock);

  /** Date and hour always travel together in one PATCH. Sending the date alone would leave
   * the previously stored hour attached to a new date — a deadline nobody chose. */
  async function save(nextDate: string | null, nextHour: number | null) {
    setSaving(true);
    const res = await fetch(`/api/certifications/${certificationId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        registration_lock_date: nextDate,
        // Clearing the date clears the hour — an hour with no date is rejected by both the
        // Zod schema and the column CHECK, so never send that combination.
        registration_lock_hour: nextDate ? nextHour : null,
      }),
    });
    setSaving(false);
    if (!res.ok) {
      toast.error("שמירת מועד נעילת ההרשמה נכשלה");
      return;
    }
    toast.success(nextDate ? "מועד נעילת ההרשמה נשמר" : "מועד נעילת ההרשמה בוטל");
    router.refresh();
  }

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger
        className={cn(
          "w-full flex items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm",
          "hover:bg-muted transition-colors"
        )}
      >
        <ChevronDown
          className={cn("size-4 shrink-0 transition-transform", open && "rotate-180")}
        />
        <span className="flex items-center gap-2 font-medium">
          {formatted ? (
            <span
              className={cn(
                "inline-flex items-center gap-1 text-xs",
                locked ? "text-destructive" : "text-muted-foreground"
              )}
            >
              <Lock className="size-3" />
              {formatted}
              {locked ? " (ההרשמה סגורה)" : ""}
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
              <LockOpen className="size-3" />
              ללא מועד נעילה
            </span>
          )}
          מועד נעילת הרשמה
        </span>
      </CollapsibleTrigger>

      <CollapsibleContent>
        <div className="rounded-md border border-t-0 rounded-t-none px-3 py-3 space-y-2">
          <p className="text-xs text-muted-foreground">
            מועד אחד לכל הגדודים, בשעון ישראל. ניתן להירשם עד השעה שנבחרה; מרגע זה ההרשמה
            נסגרת לכולם — גם למנהלי הגדודים וגם לחטיבה. ללא בחירת שעה, ההרשמה נסגרת בתום
            היום שנבחר.
          </p>
          <div className="flex items-end gap-2 flex-wrap">
            <div className="space-y-1">
              <Label className="text-xs" htmlFor="lock-date">
                מועד נעילת הרשמה
              </Label>
              <Input
                id="lock-date"
                type="date"
                className="h-8"
                value={dateValue}
                onChange={(e) => {
                  const nextDate = e.target.value;
                  setDateValue(nextDate);
                  // Picking a date for the first time offers a sane closing hour rather
                  // than leaving it blank; clearing the date takes the hour with it, since
                  // an hour with no date is not a deadline.
                  if (!nextDate) setHourValue("");
                  else if (!hourValue) setHourValue(String(DEFAULT_LOCK_HOUR));
                }}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs" htmlFor="lock-hour">
                שעת נעילה
              </Label>
              {/* Whole hours only — a <select> of the 24 hours cannot express a minute,
                  which is the constraint enforced again in Zod and by the column CHECK. */}
              <select
                id="lock-hour"
                dir="ltr"
                className="border rounded-md h-8 px-2 bg-background text-sm text-start disabled:opacity-50"
                disabled={!dateValue}
                value={hourValue}
                onChange={(e) => setHourValue(e.target.value)}
              >
                <option value="">— בתום היום —</option>
                {LOCK_HOUR_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
            <Button
              size="sm"
              disabled={saving}
              onClick={() => save(dateValue || null, normalizeLockHour(hourValue))}
            >
              {saving && <Loader2 className="size-4 animate-spin" />}
              שמור מועד
            </Button>
            {lock.registration_lock_date && (
              <Button
                size="sm"
                variant="outline"
                disabled={saving}
                onClick={() => {
                  setDateValue("");
                  setHourValue("");
                  save(null, null);
                }}
              >
                בטל נעילה
              </Button>
            )}
          </div>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

export function QuotaRegistrationPanel({
  certificationId,
  quotas,
  battalions,
  canManage,
  myBattalionId,
  lock,
  locked,
  serverNowMs,
}: {
  certificationId: number;
  quotas: CertificationBattalionQuota[];
  battalions: Battalion[];
  canManage: boolean;
  myBattalionId: number | null;
  /** The certification's single deadline: date + hour, or a null date for none. */
  lock: RegistrationLockFields;
  /** Computed on the SERVER against the real lock moment and passed down, rather than
   * recomputed here. The lock now turns on an hour, so a client that recomputed it during
   * render could disagree with the server it just rendered on — and the server is the one
   * that enforces it on every write. */
  locked: boolean;
  /** The server's instant at render, seeding the countdown so hydration matches. */
  serverNowMs: number;
}) {
  const nameById = new Map(battalions.map((b) => [b.id, b.name]));

  // The deadline belongs to the certification, so it shows even with no allocations yet —
  // otherwise there would be no way to set it before the quotas are entered.
  return (
    <div className="space-y-3">
      <h2 className="text-lg font-semibold">הרשמת מתאמנים לפי הקצאה</h2>

      {/* Everyone sees the countdown — it is the read-only face of the deadline, and the
          one thing a battalion actually needs from this section. Visible without expanding
          anything, because burying a countdown behind a collapsible defeats the point. */}
      <RegistrationLockCountdown lock={lock} serverNowMs={serverNowMs} />

      {/* The EDITOR is brigade-only. `canManage` is the guard the page already computed as
          `canManageCertifications(role) && canEdit(me)`: the first half is `isBrigade(role)`,
          so any battalion view is false regardless of how privileged the user is, and the
          second half is the real per-user check from lib/auth/permissions.ts. Reusing it
          rather than adding a new condition keeps the panel and the endpoint agreeing on
          who may move the lock.

          Not rendered at all, rather than rendered disabled: a battalion user was never
          authorized to use it, and `PATCH /api/certifications/[id]` enforces that
          server-side either way — this only stops advertising a control that would 403.
          Omitting the node leaves no gap, since `space-y-3` only spaces siblings that
          actually exist. */}
      {canManage && (
        <LockDateSection certificationId={certificationId} lock={lock} locked={locked} />
      )}

      {quotas.length > 0 && (
        <div className="space-y-2">
          {quotas.map((q) => (
            <QuotaRow
              key={q.id}
              certificationId={certificationId}
              quota={q}
              battalionName={nameById.get(q.battalion_id) ?? `גדוד ${q.battalion_id}`}
              canManage={canManage}
              isMine={myBattalionId === q.battalion_id}
              locked={locked}
            />
          ))}
        </div>
      )}
    </div>
  );
}
