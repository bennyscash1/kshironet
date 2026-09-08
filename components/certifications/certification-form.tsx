"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import type { z } from "zod";
import {
  certificationSchema,
  certificationCreateSchema,
  type CertificationFormValues,
} from "@/lib/validation/certification";

type CertificationInputValues = z.input<typeof certificationSchema>;
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { ColorSelect } from "@/components/ui/color-select";
import { Plus, Trash2 } from "lucide-react";
import type { Battalion, CertificationTemplate } from "@/lib/types";
import type { GapRow } from "@/lib/db/repositories/certification-gaps";
import { getWeekNumber } from "@/lib/utils/dates";

interface TaxRow {
  role_name: string;
  is_fulfilled: boolean;
}

interface Props {
  battalions: Battalion[];
  templates: CertificationTemplate[];
  gapRows?: GapRow[];
  palette: string[];
  certificationId?: number;
  defaultValues?: Partial<CertificationInputValues>;
  defaultQuotas?: Record<number, number>;
  defaultTaxes?: TaxRow[];
}

export function CertificationForm({
  battalions,
  templates,
  gapRows = [],
  palette,
  certificationId,
  defaultValues,
  defaultQuotas,
  defaultTaxes,
}: Props) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [prereqText, setPrereqText] = useState(
    (defaultValues?.prerequisites ?? []).join("\n")
  );
  const [quotas, setQuotas] = useState<Record<number, number>>(defaultQuotas ?? {});
  const [taxes, setTaxes] = useState<TaxRow[]>(defaultTaxes ?? []);

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<CertificationInputValues, unknown, CertificationFormValues>({
    resolver: zodResolver(certificationCreateSchema),
    defaultValues: {
      name: "",
      domain: "",
      start_date: "",
      end_date: "",
      location: "",
      total_slots: undefined,
      is_unlimited: false,
      registration_open: false,
      notes: "",
      color_hex: "",
      prerequisites: [],
      quotas: [],
      ...defaultValues,
    },
  });

  const isUnlimited = Boolean(watch("is_unlimited"));

  function applyTemplate(templateId: number) {
    const tpl = templates.find((t) => t.id === templateId);
    if (!tpl) return;
    setValue("name", tpl.name);
    setValue("domain", tpl.domain ?? "");
    setValue("location", tpl.default_location ?? "");
    setValue("total_slots", tpl.default_slots ?? undefined);
    setValue("notes", tpl.default_notes ?? "");
    setValue("template_id", tpl.id);
  }

  async function onSubmit(values: CertificationFormValues) {
    setSubmitting(true);
    const payload = {
      ...values,
      prerequisites: prereqText.split("\n").map((s) => s.trim()).filter(Boolean),
      quotas: Object.entries(quotas)
        .filter(([, v]) => v > 0)
        .map(([battalion_id, allocated_slots]) => ({
          battalion_id: Number(battalion_id),
          allocated_slots,
        })),
      taxes: taxes.filter((t) => t.role_name.trim()),
    };
    const url = certificationId ? `/api/certifications/${certificationId}` : "/api/certifications";
    const method = certificationId ? "PATCH" : "POST";
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    setSubmitting(false);
    if (!res.ok) {
      toast.error("שמירה נכשלה, בדוק את הנתונים");
      return;
    }
    const data = await res.json();
    toast.success(certificationId ? "ההסמכה עודכנה" : "ההסמכה נוצרה");
    router.push(`/certifications/${certificationId ?? data.id}`);
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 max-w-2xl">
      {!certificationId && templates.length > 0 && (
        <div className="space-y-1.5">
          <Label>התחל מתבנית (אופציונלי)</Label>
          <select
            className="border rounded-md h-9 px-2 w-full bg-background"
            onChange={(e) => e.target.value && applyTemplate(Number(e.target.value))}
            defaultValue=""
          >
            <option value="">— ללא —</option>
            {templates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label>שם ההסמכה</Label>
          <Input {...register("name")} />
          {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
        </div>
        <div className="space-y-1.5">
          <Label>צבע</Label>
          <ColorSelect
            value={(watch("color_hex") as string) ?? ""}
            onChange={(hex) => setValue("color_hex", hex)}
            palette={palette}
          />
        </div>
        <div className="space-y-1.5">
          <Label>תחום</Label>
          <Input {...register("domain")} />
        </div>
        <div className="space-y-1.5">
          <Label>מיקום</Label>
          <Input {...register("location")} />
        </div>
        <div className="space-y-1.5">
          <Label className="flex items-center justify-between">
            <span>תאריך התחלה</span>
            {watch("start_date") && (
              <span className="text-xs font-normal text-muted-foreground">
                שבוע {getWeekNumber(watch("start_date") as string)}
              </span>
            )}
          </Label>
          <Input type="date" {...register("start_date")} />
          {errors.start_date && (
            <p className="text-xs text-destructive">{errors.start_date.message}</p>
          )}
        </div>
        <div className="space-y-1.5">
          <Label className="flex items-center justify-between">
            <span>תאריך סיום (אופציונלי)</span>
            {watch("end_date") && (
              <span className="text-xs font-normal text-muted-foreground">
                שבוע {getWeekNumber(watch("end_date") as string)}
              </span>
            )}
          </Label>
          <Input type="date" {...register("end_date")} />
        </div>
        <div className="space-y-1.5">
          <Label className="flex items-center justify-between gap-2">
            <span>מספר מקומות</span>
            <label className="flex items-center gap-1.5 text-xs font-normal text-muted-foreground cursor-pointer">
              <Checkbox
                id="is_unlimited"
                checked={isUnlimited}
                onCheckedChange={(v) => {
                  const checked = Boolean(v);
                  setValue("is_unlimited", checked);
                  if (checked) setValue("total_slots", undefined);
                }}
              />
              אין מגבלה
            </label>
          </Label>
          <Input
            type="number"
            min={1}
            disabled={isUnlimited}
            className={isUnlimited ? "opacity-50" : undefined}
            {...register("total_slots")}
          />
          {isUnlimited ? (
            <p className="text-xs text-muted-foreground">ללא הגבלת מספר מקומות</p>
          ) : (
            errors.total_slots && (
              <p className="text-xs text-destructive">{errors.total_slots.message}</p>
            )
          )}
        </div>
        {/* The checkbox is the ONLY thing that decides draft vs open at creation (see
            createCertification), and it used to sit here unlabelled as to its consequence —
            so a certification could be created as a טיוטה without the creator ever being
            told. The default is deliberately unchanged; only the explanation is new. */}
        <div className="pt-6 space-y-1.5">
          <div className="flex items-center gap-2">
            <Checkbox
              checked={Boolean(watch("registration_open"))}
              onCheckedChange={(v) => setValue("registration_open", Boolean(v))}
              id="registration_open"
            />
            <Label htmlFor="registration_open">פתוחה להרשמת גדודים</Label>
          </div>
          <p
            className={
              watch("registration_open")
                ? "text-xs text-emerald-700"
                : "text-xs text-amber-800"
            }
          >
            {watch("registration_open")
              ? "ההסמכה תיווצר בסטטוס „פתוחה להרשמה“ — הגדודים יוכלו לשבץ אליה חיילים מיד."
              : "ההסמכה תיווצר בסטטוס „טיוטה“ — הגדודים לא יוכלו לשבץ אליה חיילים עד שתיפתח להרשמה מדף ההסמכה."}
          </p>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label>דרישות קדם (שורה לכל דרישה)</Label>
        <Textarea
          value={prereqText}
          onChange={(e) => setPrereqText(e.target.value)}
          placeholder={"רישיון C1"}
        />
      </div>

      <div className="space-y-1.5">
        <Label>מיסים להסמכה (תפקידים שיש להקצות, לדוגמה: חובש, נהג)</Label>
        <div className="space-y-2">
          {taxes.map((tax, i) => (
            <div key={i} className="flex items-center gap-2">
              <Input
                value={tax.role_name}
                placeholder="נהג"
                onChange={(e) =>
                  setTaxes((rows) =>
                    rows.map((r, idx) => (idx === i ? { ...r, role_name: e.target.value } : r))
                  )
                }
              />
              <label className="flex items-center gap-1.5 text-sm shrink-0 whitespace-nowrap">
                <Checkbox
                  checked={tax.is_fulfilled}
                  onCheckedChange={(v) =>
                    setTaxes((rows) =>
                      rows.map((r, idx) => (idx === i ? { ...r, is_fulfilled: Boolean(v) } : r))
                    )
                  }
                />
                סגור
              </label>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => setTaxes((rows) => rows.filter((_, idx) => idx !== i))}
              >
                <Trash2 className="size-4" />
              </Button>
            </div>
          ))}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setTaxes((rows) => [...rows, { role_name: "", is_fulfilled: false }])}
          >
            <Plus className="size-4" />
            הוסף מס
          </Button>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label>הערות</Label>
        <Textarea {...register("notes")} />
      </div>

      <div className="space-y-1.5">
        <Label>הקצאת מקומות לפי גדוד (אופציונלי)</Label>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2">
          {battalions.map((b) => (
            <div key={b.id} className="space-y-1">
              <Label className="text-xs" style={{ color: b.color_hex }}>
                {b.name}
              </Label>
              <Input
                type="number"
                min={0}
                value={quotas[b.id] ?? 0}
                onChange={(e) =>
                  setQuotas((q) => ({ ...q, [b.id]: Number(e.target.value) || 0 }))
                }
              />
            </div>
          ))}
        </div>
      </div>

      <div className="flex gap-2">
        <Button type="submit" disabled={submitting}>
          {certificationId ? "שמור שינויים" : "פתח הסמכה"}
        </Button>
        <Button type="button" variant="outline" onClick={() => router.back()}>
          ביטול
        </Button>
      </div>
    </form>
  );
}
