"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Trash2, Plus, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { BattalionRequestSoldier } from "@/lib/types";

/** Designated soldiers on a battalion request. When the brigade opens a certification
 * from this request, these are auto-added to the roster as reserve. Mirrors the
 * roster-entry add/remove UX. Soldiers belong to the request's own battalion. */
export function RequestSoldiersSection({
  requestId,
  soldiers,
  battalionId,
  canEdit,
}: {
  requestId: number;
  soldiers: BattalionRequestSoldier[];
  battalionId: number;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [fullName, setFullName] = useState("");
  const [personalNumber, setPersonalNumber] = useState("");
  const [phone, setPhone] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  async function addSoldier() {
    if (!fullName.trim()) {
      toast.error("שם מלא נדרש");
      return;
    }
    setSubmitting(true);
    const res = await fetch(`/api/requests/${requestId}/soldiers`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        full_name: fullName.trim(),
        personal_number: personalNumber.trim() || null,
        phone: phone.trim() || null,
        battalion_id: battalionId,
      }),
    });
    setSubmitting(false);
    if (!res.ok) {
      toast.error("הוספת החייל נכשלה");
      return;
    }
    toast.success("החייל נוסף לדרישה");
    setFullName("");
    setPersonalNumber("");
    setPhone("");
    router.refresh();
  }

  async function removeSoldier(id: number) {
    setDeletingId(id);
    const res = await fetch(`/api/requests/${requestId}/soldiers/${id}`, { method: "DELETE" });
    if (!res.ok) {
      toast.error("הסרת החייל נכשלה");
      setDeletingId(null);
      return;
    }
    toast.success("החייל הוסר");
    setDeletingId(null);
    router.refresh();
  }

  return (
    <div className="space-y-3">
      <div>
        <h2 className="text-lg font-semibold">חיילים מיועדים</h2>
        <p className="text-sm text-muted-foreground">
          חיילים אלו יתווספו אוטומטית כעתודה כאשר תיפתח הסמכה מדרישה זו.
        </p>
      </div>

      <div className="space-y-2">
        {soldiers.length === 0 && (
          <p className="text-sm text-muted-foreground">לא צורפו חיילים לדרישה זו.</p>
        )}
        {soldiers.map((s) => (
          <div
            key={s.id}
            className="flex items-center justify-between gap-2 rounded-md border p-2.5"
          >
            <div className="text-sm">
              <span className="font-medium">{s.full_name}</span>
              {s.personal_number ? (
                <span className="text-muted-foreground"> · {s.personal_number}</span>
              ) : null}
              {s.phone ? (
                <span className="text-muted-foreground" dir="ltr">
                  {" "}
                  · {s.phone}
                </span>
              ) : null}
            </div>
            {canEdit && (
              <Button
                variant="ghost"
                size="icon"
                className="text-destructive"
                aria-label="הסר חייל"
                disabled={deletingId === s.id}
                onClick={() => removeSoldier(s.id)}
              >
                {deletingId === s.id ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Trash2 className="size-4" />
                )}
              </Button>
            )}
          </div>
        ))}
      </div>

      {canEdit && (
        <div className="rounded-md border p-3 space-y-3 bg-muted/30">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">שם מלא</Label>
              <Input value={fullName} onChange={(e) => setFullName(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">מספר אישי</Label>
              <Input value={personalNumber} onChange={(e) => setPersonalNumber(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">טלפון</Label>
              <Input value={phone} onChange={(e) => setPhone(e.target.value)} dir="ltr" />
            </div>
          </div>
          <Button size="sm" disabled={submitting} onClick={addSoldier}>
            {submitting ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
            הוסף חייל
          </Button>
        </div>
      )}
    </div>
  );
}
