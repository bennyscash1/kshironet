"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { ArrowLeftRight, Loader2, Lock, Plus, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { RosterStatusBadge } from "@/components/certifications/status-badge";
import type { RosterEntry } from "@/lib/types";
import type { BattalionQuotaUsage } from "@/lib/battalions/types";
import { SoldierSearch } from "@/components/battalions/soldier-search";
import type { SoldierLookupRow } from "@/lib/force-structure/types";
import { formatLockMoment } from "@/lib/utils/registration-lock";
import { DRAFT_REFUSAL_MESSAGE } from "@/lib/battalions/allocation-opportunities";

interface Draft {
  full_name: string;
  personal_number: string;
  company_platoon: string;
  phone: string;
  commander_name: string;
  commander_phone: string;
  notes: string;
  is_reserve: boolean;
  has_prior_certification: boolean;
  requires_lodging: boolean;
  fromFs: boolean;
  heldCerts: string[];
}

function emptyDraft(isReserve: boolean): Draft {
  return {
    full_name: "",
    personal_number: "",
    company_platoon: "",
    phone: "",
    commander_name: "",
    commander_phone: "",
    notes: "",
    is_reserve: isReserve,
    has_prior_certification: false,
    requires_lodging: false,
    fromFs: false,
    heldCerts: [],
  };
}

/**
 * The battalion's own list of soldiers on one certification, plus the add form, bounded by
 * the allocation the brigade gave it. The counter and the disabled state here are a
 * convenience only — the limit itself is enforced by the endpoint, which is also what
 * produces the Hebrew message shown on refusal.
 */
export function BattalionRosterPanel({
  battalionId,
  certificationId,
  entries,
  quota,
  canEdit,
  variant = "page",
  onSaved,
}: {
  battalionId: number;
  certificationId: number;
  entries: Array<
    Pick<
      RosterEntry,
      "id" | "full_name" | "personal_number" | "company_platoon" | "phone" | "status" | "is_reserve"
    >
  >;
  quota: BattalionQuotaUsage;
  canEdit: boolean;
  variant?: "page" | "inline";
  onSaved?: () => void;
}) {
  const router = useRouter();
  const [draft, setDraft] = useState<Draft | null>(variant === "inline" ? emptyDraft(false) : null);
  const [submitting, setSubmitting] = useState(false);
  const [removingId, setRemovingId] = useState<number | null>(null);
  const [movingId, setMovingId] = useState<number | null>(null);

  const base = `/api/battalions/${battalionId}/certifications/${certificationId}/roster`;
  // Mode B with no allocation for this battalion. Deliberately NOT `allocated === null`,
  // which also matched a Mode A certification with unlimited capacity and wrongly told the
  // battalion it had been left out of a cycle it was in fact free to join.
  const noAllocation = quota.missing_quota === true;
  // A טיוטה is brigade working state — its dates can still move and it can be cancelled.
  const notOpen = quota.registration_open === false;
  const full = quota.remaining !== null && quota.remaining < 1;
  const openToAll = quota.mode === "open_to_all";
  const canRegister = !quota.locked && !noAllocation && !notOpen;
  // The full deadline, date + hour — a battalion told only the date would not know which
  // hour of it they were locked out at.
  const lockMoment = formatLockMoment(quota);
  // With the allocation full the only way left in is the עתודה, which by design sits
  // outside it — so a new row starts pre-marked as reserve.
  const startsAsReserve = full;

  function patch(next: Partial<Draft>) {
    setDraft((prev) => (prev ? { ...prev, ...next } : prev));
  }

  async function submit() {
    if (!draft) return;
    if (!draft.full_name.trim() || !draft.personal_number.trim()) {
      toast.error("שם מלא ומספר אישי נדרשים");
      return;
    }
    setSubmitting(true);
    const res = await fetch(base, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        full_name: draft.full_name.trim(),
        personal_number: draft.personal_number.trim(),
        company_platoon: draft.company_platoon,
        phone: draft.phone,
        commander_name: draft.commander_name,
        commander_phone: draft.commander_phone,
        notes: draft.notes,
        is_reserve: draft.is_reserve,
        has_prior_certification: draft.has_prior_certification,
        requires_lodging: draft.requires_lodging,
      }),
    });
    setSubmitting(false);
    if (!res.ok) {
      // The server's own Hebrew wording (quota full, no allocation, deadline passed) is
      // the most precise thing to show.
      const body = (await res.json().catch(() => null)) as { error?: unknown } | null;
      toast.error(
        typeof body?.error === "string" ? body.error : "הוספת החייל נכשלה"
      );
      return;
    }
    toast.success(draft.is_reserve ? "החייל נוסף לעתודה" : "החייל נוסף להסמכה");
    setDraft(variant === "inline" ? emptyDraft(startsAsReserve) : null);
    onSaved?.();
    router.refresh();
  }

  /** Moves a soldier between the עתודה and the allocation. Going INTO the allocation takes a
   * slot, so the server applies the same limit an addition faces. */
  async function toggleReserve(entry: { id: number; is_reserve: number; full_name: string }) {
    const toReserve = entry.is_reserve === 0;
    setMovingId(entry.id);
    const res = await fetch(`${base}/${entry.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_reserve: toReserve }),
    });
    setMovingId(null);
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { error?: unknown } | null;
      toast.error(typeof body?.error === "string" ? body.error : "העברת החייל נכשלה");
      return;
    }
    toast.success(toReserve ? "החייל הועבר לעתודה" : "החייל הועבר להקצאה");
    onSaved?.();
    router.refresh();
  }

  async function remove(entry: { id: number; full_name: string }) {
    if (!confirm(`להסיר את ${entry.full_name} מההסמכה?`)) return;
    setRemovingId(entry.id);
    const res = await fetch(`${base}/${entry.id}`, { method: "DELETE" });
    setRemovingId(null);
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { error?: unknown } | null;
      toast.error(typeof body?.error === "string" ? body.error : "המחיקה נכשלה");
      return;
    }
    toast.success("החייל הוסר");
    onSaved?.();
    router.refresh();
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        {variant === "page" && <h2 className="text-lg font-semibold">חיילי הגדוד בהסמכה</h2>}
        {canEdit && canRegister && variant === "page" && (
          <Button
            size="sm"
            variant={draft ? "outline" : "default"}
            onClick={() => setDraft(draft ? null : emptyDraft(startsAsReserve))}
          >
            {draft ? <X className="size-4" /> : <Plus className="size-4" />}
            {draft ? "ביטול" : "הוסף חייל"}
          </Button>
        )}
      </div>

      {/* Three distinct reasons the add button can be missing, each said out loud. An
          unexplained absent control is the thing this replaces. */}
      {notOpen && (
        <p className="text-sm rounded-md border border-slate-200 bg-slate-50 p-2.5 text-slate-700">
          {DRAFT_REFUSAL_MESSAGE}. שיבוץ חיילים יתאפשר לאחר שהחטיבה תפתח את ההסמכה להרשמה.
        </p>
      )}
      {!notOpen && noAllocation && (
        <p className="text-sm rounded-md border border-amber-200 bg-amber-50 p-2.5 text-amber-800">
          לא הוקצו לגדוד מקומות בהסמכה זו. שיבוץ חיילים יתאפשר לאחר שהחטיבה תקצה מקומות
          לגדוד.
        </p>
      )}
      {quota.locked && (
        <p className="text-sm rounded-md border border-rose-200 bg-rose-50 p-2.5 text-rose-800 inline-flex items-center gap-1.5">
          <Lock className="size-4" />
          ההרשמה נסגרה — חלף מועד הנעילה
          {lockMoment ? ` (${lockMoment})` : ""}
          .
        </p>
      )}
      {canRegister && full && (
        <p className="text-sm rounded-md border border-amber-200 bg-amber-50 p-2.5 text-amber-800">
          {/* Two different pools, so two different sentences: a shared brigade-wide pool is
              not "your allocation". */}
          {openToAll
            ? `כל המקומות בהסמכה זו תפוסים (${quota.used} מתוך ${quota.allocated}).`
            : `ההקצאה לגדוד מלאה (${quota.used} מתוך ${quota.allocated}).`}{" "}
          ניתן להוסיף חיילים נוספים כעתודה בלבד.
        </p>
      )}

      {draft && (
        <div className="rounded-md border p-3 space-y-4 bg-slate-50">
          <div className="space-y-1.5">
            <Label>חייל — שם מלא או מספר אישי</Label>
            <SoldierSearch
              battalionId={battalionId}
              onPick={(row: SoldierLookupRow) =>
                patch({
                  full_name: row.full_name,
                  personal_number: row.personal_number,
                  company_platoon: row.frame,
                  phone: row.phone ?? "",
                  fromFs: true,
                  heldCerts: row.certs,
                })
              }
              onFreeText={(value) => {
                const parts = value.split("·").map((s) => s.trim());
                if (parts.length >= 2 && /^\d+$/.test(parts[1] ?? "")) {
                  patch({ full_name: parts[0], personal_number: parts[1], fromFs: false });
                } else if (/^\d+$/.test(value.trim())) {
                  patch({ personal_number: value.trim(), fromFs: false });
                } else {
                  patch({ full_name: value, fromFs: false, heldCerts: [] });
                }
              }}
            />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>
                שם מלא
                {draft.fromFs && (
                  <i className="not-italic text-[0.6rem] font-bold text-primary bg-accent rounded-full px-1.5 ms-1">
                    מ״שניים לפנים״
                  </i>
                )}
              </Label>
              <Input
                className={draft.fromFs ? "bg-blue-50 border-blue-200" : ""}
                value={draft.full_name}
                onChange={(e) => patch({ full_name: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>
                מספר אישי
                {draft.fromFs && (
                  <i className="not-italic text-[0.6rem] font-bold text-primary bg-accent rounded-full px-1.5 ms-1">
                    מ״שניים לפנים״
                  </i>
                )}
              </Label>
              <Input
                className={draft.fromFs ? "bg-blue-50 border-blue-200" : ""}
                value={draft.personal_number}
                onChange={(e) => patch({ personal_number: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>
                פלוגה / מסגרת
                {draft.fromFs && (
                  <i className="not-italic text-[0.6rem] font-bold text-primary bg-accent rounded-full px-1.5 ms-1">
                    מ״שניים לפנים״
                  </i>
                )}
              </Label>
              <Input
                className={draft.fromFs ? "bg-blue-50 border-blue-200" : ""}
                value={draft.company_platoon}
                onChange={(e) => patch({ company_platoon: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>
                טלפון
                {draft.fromFs && (
                  <i className="not-italic text-[0.6rem] font-bold text-primary bg-accent rounded-full px-1.5 ms-1">
                    מ״שניים לפנים״
                  </i>
                )}
              </Label>
              <Input
                className={draft.fromFs ? "bg-blue-50 border-blue-200" : ""}
                value={draft.phone}
                onChange={(e) => patch({ phone: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>שם המפקד</Label>
              <Input
                value={draft.commander_name}
                onChange={(e) => patch({ commander_name: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>טלפון המפקד</Label>
              <Input
                value={draft.commander_phone}
                onChange={(e) => patch({ commander_phone: e.target.value })}
              />
            </div>
          </div>

          <div className="flex items-center gap-2 rounded-md border p-2.5 bg-white">
            <Checkbox
              id={`prior-${certificationId}`}
              checked={draft.has_prior_certification}
              onCheckedChange={(v) => patch({ has_prior_certification: Boolean(v) })}
            />
            <Label htmlFor={`prior-${certificationId}`}>
              קיימת הסמכה קודמת בתחום
              {draft.heldCerts.length > 0 && (
                <span className="text-xs text-muted-foreground font-normal">
                  {" "}
                  · רשומות במבנה: {draft.heldCerts.join(", ")}
                </span>
              )}
            </Label>
          </div>

          {/* The same plain bordered row as the flag above — NOT the amber container used
              for עתודה below, which is highlighted because it changes the seat quota. */}
          <div className="flex items-center gap-2 rounded-md border p-2.5 bg-white">
            <Checkbox
              id={`lodging-${certificationId}`}
              checked={draft.requires_lodging}
              onCheckedChange={(v) => patch({ requires_lodging: Boolean(v) })}
            />
            <Label htmlFor={`lodging-${certificationId}`}>נדרש לינה</Label>
          </div>

          {!draft.fromFs && (draft.full_name.trim() || draft.personal_number.trim()) && (
            <p className="text-xs text-muted-foreground">
              אין התאמה במבנה. הרישום מסומן כהזנה חופשית — לא נוצר חייל ב״שניים לפנים״.
            </p>
          )}

          <div className="flex items-center gap-2 rounded-md border border-amber-200 bg-amber-50 p-2.5">
            <Checkbox
              id={`battalion-roster-reserve-${certificationId}`}
              checked={draft.is_reserve}
              onCheckedChange={(v) => patch({ is_reserve: Boolean(v) })}
            />
            <Label htmlFor={`battalion-roster-reserve-${certificationId}`} className="text-amber-800">
              רישום כעתודה (מחוץ למכסת ההקצאות של הגדוד)
            </Label>
          </div>

          <div className="space-y-1.5">
            <Label>הערות</Label>
            <Textarea value={draft.notes} onChange={(e) => patch({ notes: e.target.value })} />
          </div>

          <div className="flex gap-2">
            <Button onClick={submit} disabled={submitting || (full && !draft.is_reserve)}>
              {submitting && <Loader2 className="size-4 animate-spin" />}
              {draft.is_reserve ? "הוסף לעתודה" : "הוסף חייל"}
            </Button>
            {variant === "page" && (
              <Button variant="outline" onClick={() => setDraft(null)}>
                ביטול
              </Button>
            )}
          </div>
        </div>
      )}

      <div className="border rounded-md overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>שם</TableHead>
              <TableHead>מספר אישי</TableHead>
              <TableHead>פלוגה</TableHead>
              <TableHead>טלפון</TableHead>
              <TableHead>סטטוס</TableHead>
              <TableHead>עתודה</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {entries.map((e) => (
              <TableRow key={e.id}>
                <TableCell className="font-medium">{e.full_name}</TableCell>
                <TableCell>{e.personal_number}</TableCell>
                <TableCell>{e.company_platoon ?? "-"}</TableCell>
                <TableCell>{e.phone ?? "-"}</TableCell>
                <TableCell>
                  <RosterStatusBadge status={e.status} />
                </TableCell>
                <TableCell>
                  {e.is_reserve === 1 ? (
                    <span className="text-xs text-amber-700 font-semibold">עתודה</span>
                  ) : (
                    "-"
                  )}
                </TableCell>
                <TableCell className="text-end whitespace-nowrap">
                  {canEdit && !quota.locked && (
                    <>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-xs"
                        disabled={movingId === e.id || (e.is_reserve === 1 && full)}
                        onClick={() => toggleReserve(e)}
                      >
                        {movingId === e.id ? (
                          <Loader2 className="size-4 animate-spin" />
                        ) : (
                          <ArrowLeftRight className="size-4" />
                        )}
                        {e.is_reserve === 1 ? "העבר להקצאה" : "העבר לעתודה"}
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        disabled={removingId === e.id}
                        onClick={() => remove(e)}
                      >
                        {removingId === e.id ? (
                          <Loader2 className="size-4 animate-spin" />
                        ) : (
                          <Trash2 className="size-4" />
                        )}
                      </Button>
                    </>
                  )}
                </TableCell>
              </TableRow>
            ))}
            {entries.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-muted-foreground py-6">
                  הגדוד לא שיבץ עדיין חיילים להסמכה זו.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
