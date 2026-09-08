"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import type { z } from "zod";
import { requestSchema, type RequestFormValues } from "@/lib/validation/request";

type RequestInputValues = z.input<typeof requestSchema>;
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Plus, Trash2 } from "lucide-react";
import { URGENCY_LABELS, URGENCY_LEVELS, type Battalion } from "@/lib/types";

/** One soldier sub-form's state. Mirrors `requestSoldierSchema` exactly — this is what
 * gets posted in the `soldiers` array. */
interface SoldierDraft {
  /** Local key for React only; never sent. */
  key: number;
  battalion_id: number;
  full_name: string;
  personal_number: string;
  company_platoon: string;
  phone: string;
  commander_name: string;
  commander_phone: string;
  has_prior_certification: boolean;
  requires_lodging: boolean;
  is_reserve: boolean;
  notes: string;
}

function emptySoldier(key: number, battalionId: number): SoldierDraft {
  return {
    key,
    battalion_id: battalionId,
    full_name: "",
    personal_number: "",
    company_platoon: "",
    phone: "",
    commander_name: "",
    commander_phone: "",
    has_prior_certification: false,
    requires_lodging: false,
    is_reserve: false,
    notes: "",
  };
}

/** A row the user never touched — dropped silently on submit so the default empty
 * sub-form does not force anyone to fill it in. */
function isBlank(s: SoldierDraft): boolean {
  return (
    !s.full_name.trim() &&
    !s.personal_number.trim() &&
    !s.company_platoon.trim() &&
    !s.phone.trim() &&
    !s.commander_name.trim() &&
    !s.commander_phone.trim() &&
    !s.notes.trim() &&
    !s.has_prior_certification &&
    !s.is_reserve
  );
}

export function RequestForm({
  battalions,
  defaultBattalionId,
}: {
  battalions: Battalion[];
  defaultBattalionId?: number;
}) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<RequestInputValues, unknown, RequestFormValues>({
    resolver: zodResolver(requestSchema),
    defaultValues: {
      battalion_id: defaultBattalionId ?? battalions[0]?.id,
      requested_cert_type: "",
      quantity_needed: 1,
      reason: "",
      urgency: "normal",
      desired_date: "",
      notes: "",
    },
  });

  const requestBattalionId = Number(watch("battalion_id")) || battalions[0]?.id;

  // One sub-form is rendered by default; the list is unlimited. Monotonic keys stay
  // stable when a row in the middle is removed.
  const [soldiers, setSoldiers] = useState<SoldierDraft[]>(() => [
    emptySoldier(1, defaultBattalionId ?? battalions[0]?.id),
  ]);
  const [nextKey, setNextKey] = useState(2);

  function addSoldier() {
    // New rows follow the request's currently selected battalion; rows already on
    // screen keep whatever the user picked for them.
    setSoldiers((prev) => [...prev, emptySoldier(nextKey, requestBattalionId)]);
    setNextKey((k) => k + 1);
  }

  function removeSoldier(key: number) {
    setSoldiers((prev) => prev.filter((s) => s.key !== key));
  }

  function updateSoldier(key: number, patch: Partial<SoldierDraft>) {
    setSoldiers((prev) => prev.map((s) => (s.key === key ? { ...s, ...patch } : s)));
  }

  async function onSubmit(values: RequestFormValues) {
    const filled = soldiers.filter((s) => !isBlank(s));
    // Mirrors requestSoldierSchema: anything the user started must be identifiable.
    if (filled.some((s) => !s.full_name.trim() || !s.personal_number.trim())) {
      toast.error("לכל חייל שנוסף נדרשים שם מלא ומספר אישי");
      return;
    }

    setSubmitting(true);
    const res = await fetch("/api/requests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...values,
        // Built field by field so the local React `key` never leaks into the payload.
        // Names must match lib/validation/request.ts exactly.
        soldiers: filled.map((s) => ({
          battalion_id: s.battalion_id,
          full_name: s.full_name.trim(),
          personal_number: s.personal_number.trim(),
          company_platoon: s.company_platoon,
          phone: s.phone,
          commander_name: s.commander_name,
          commander_phone: s.commander_phone,
          has_prior_certification: s.has_prior_certification,
          requires_lodging: s.requires_lodging,
          is_reserve: s.is_reserve,
          notes: s.notes,
        })),
      }),
    });
    setSubmitting(false);
    if (!res.ok) {
      toast.error("שליחת הדרישה נכשלה");
      return;
    }
    toast.success("הדרישה נשלחה");
    router.push("/requests");
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 max-w-xl">
      <div className="space-y-1.5">
        <Label>גדוד</Label>
        <select
          className="border rounded-md h-9 px-2 w-full bg-background"
          disabled={battalions.length === 1}
          {...register("battalion_id", { valueAsNumber: true })}
        >
          {battalions.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>
      </div>
      <div className="space-y-1.5">
        <Label>סוג ההסמכה הנדרשת</Label>
        <Input {...register("requested_cert_type")} placeholder="לדוגמה: נהגי טיגריס" />
        {errors.requested_cert_type && (
          <p className="text-xs text-destructive">{errors.requested_cert_type.message}</p>
        )}
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label>כמות חיילים נדרשת</Label>
          <Input type="number" min={1} {...register("quantity_needed", { valueAsNumber: true })} />
        </div>
        <div className="space-y-1.5">
          <Label>דחיפות</Label>
          <select className="border rounded-md h-9 px-2 w-full bg-background" {...register("urgency")}>
            {URGENCY_LEVELS.map((u) => (
              <option key={u} value={u}>
                {URGENCY_LABELS[u]}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="space-y-1.5">
        <Label>תאריך רצוי (אופציונלי)</Label>
        <Input type="date" {...register("desired_date")} />
      </div>
      <div className="space-y-1.5">
        <Label>סיבה / פער מבצעי</Label>
        <Textarea {...register("reason")} />
      </div>
      <div className="space-y-1.5">
        <Label>הערות נוספות</Label>
        <Textarea {...register("notes")} />
      </div>

      <div className="space-y-3 border-t pt-4">
        <div>
          <h2 className="text-lg font-semibold">חיילים</h2>
          <p className="text-sm text-muted-foreground">
            ניתן לצרף לדרישה חיילים מסוימים. השדות אינם חובה — חייל שיצורף חייב שם מלא
            ומספר אישי.
          </p>
        </div>

        {soldiers.map((soldier, index) => (
          <div key={soldier.key} className="rounded-md border p-3 space-y-4">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-medium">חייל {index + 1}</span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="text-destructive"
                onClick={() => removeSoldier(soldier.key)}
              >
                <Trash2 className="size-4" />
                הסר
              </Button>
            </div>

            <div className="space-y-1.5">
              <Label>גדוד</Label>
              <select
                className="border rounded-md h-9 px-2 w-full bg-background"
                value={soldier.battalion_id}
                onChange={(e) =>
                  updateSoldier(soldier.key, { battalion_id: Number(e.target.value) })
                }
              >
                {battalions.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>שם מלא</Label>
                <Input
                  value={soldier.full_name}
                  onChange={(e) => updateSoldier(soldier.key, { full_name: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label>מספר אישי</Label>
                <Input
                  value={soldier.personal_number}
                  onChange={(e) =>
                    updateSoldier(soldier.key, { personal_number: e.target.value })
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label>פלוגה / מסגרת</Label>
                <Input
                  value={soldier.company_platoon}
                  onChange={(e) =>
                    updateSoldier(soldier.key, { company_platoon: e.target.value })
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label>טלפון</Label>
                <Input
                  value={soldier.phone}
                  onChange={(e) => updateSoldier(soldier.key, { phone: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label>שם המפקד</Label>
                <Input
                  value={soldier.commander_name}
                  onChange={(e) =>
                    updateSoldier(soldier.key, { commander_name: e.target.value })
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label>טלפון המפקד</Label>
                <Input
                  value={soldier.commander_phone}
                  onChange={(e) =>
                    updateSoldier(soldier.key, { commander_phone: e.target.value })
                  }
                />
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Checkbox
                checked={soldier.has_prior_certification}
                onCheckedChange={(v) =>
                  updateSoldier(soldier.key, { has_prior_certification: Boolean(v) })
                }
                id={`has_prior_certification-${soldier.key}`}
              />
              <Label htmlFor={`has_prior_certification-${soldier.key}`}>
                קיימת הסמכה קודמת בתחום
              </Label>
            </div>

            {/* Plain row, matching the flag above — not the amber עתודה container below,
                which is highlighted because it affects the allocation quota. */}
            <div className="flex items-center gap-2">
              <Checkbox
                checked={soldier.requires_lodging}
                onCheckedChange={(v) =>
                  updateSoldier(soldier.key, { requires_lodging: Boolean(v) })
                }
                id={`requires_lodging-${soldier.key}`}
              />
              <Label htmlFor={`requires_lodging-${soldier.key}`}>נדרש לינה</Label>
            </div>

            <div className="flex items-center gap-2 rounded-md border border-amber-200 bg-amber-50 p-2.5">
              <Checkbox
                checked={soldier.is_reserve}
                onCheckedChange={(v) => updateSoldier(soldier.key, { is_reserve: Boolean(v) })}
                id={`is_reserve-${soldier.key}`}
              />
              <Label htmlFor={`is_reserve-${soldier.key}`} className="text-amber-800">
                רישום כעתודה (מחוץ למכסת ההקצאות הרגילה)
              </Label>
            </div>

            <div className="space-y-1.5">
              <Label>הערות</Label>
              <Textarea
                value={soldier.notes}
                onChange={(e) => updateSoldier(soldier.key, { notes: e.target.value })}
              />
            </div>
          </div>
        ))}

        <Button type="button" variant="outline" size="sm" onClick={addSoldier}>
          <Plus className="size-4" />
          הוסף חייל
        </Button>
      </div>

      <div className="flex gap-2">
        <Button type="submit" disabled={submitting}>
          שלח דרישה
        </Button>
        <Button type="button" variant="outline" onClick={() => router.back()}>
          ביטול
        </Button>
      </div>
    </form>
  );
}
