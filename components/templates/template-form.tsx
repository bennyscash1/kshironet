"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import type { z } from "zod";
import { templateSchema, type TemplateFormValues } from "@/lib/validation/template";

type TemplateInputValues = z.input<typeof templateSchema>;
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { CertificationTemplate } from "@/lib/types";
import type { GapRow } from "@/lib/db/repositories/certification-gaps";

export function TemplateForm({
  template,
  gapRows,
  defaultName,
  defaultDomain,
}: {
  template?: CertificationTemplate;
  gapRows: GapRow[];
  defaultName?: string;
  defaultDomain?: string;
}) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<TemplateInputValues, unknown, TemplateFormValues>({
    resolver: zodResolver(templateSchema),
    defaultValues: {
      name: template?.name ?? defaultName ?? "",
      domain: template?.domain ?? defaultDomain ?? "",
      default_location: template?.default_location ?? "",
      default_slots: template?.default_slots ?? undefined,
      gap_row_id: template?.gap_row_id ?? undefined,
      default_notes: template?.default_notes ?? "",
      checkin_details: template?.checkin_details ?? "",
      duration_text: template?.duration_text ?? "",
      trainee_ratio: template?.trainee_ratio ?? "",
      ammo_required: template?.ammo_required ?? "",
      requirements_text: template?.requirements_text ?? "",
      equipment_text: template?.equipment_text ?? "",
      contacts_text: template?.contacts_text ?? "",
    },
  });

  async function onSubmit(values: TemplateFormValues) {
    setSubmitting(true);
    const url = template ? `/api/templates/${template.id}` : "/api/templates";
    const method = template ? "PATCH" : "POST";
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(values),
    });
    setSubmitting(false);
    if (!res.ok) {
      toast.error("שמירה נכשלה");
      return;
    }
    toast.success(template ? "התבנית עודכנה" : "התבנית נוצרה");
    router.push("/templates");
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 max-w-xl">
      <div className="space-y-1.5">
        <Label>שם התבנית</Label>
        <Input {...register("name")} />
        {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
      </div>
      <div className="space-y-1.5">
        <Label>תחום</Label>
        <Input {...register("domain")} />
      </div>
      <div className="space-y-1.5">
        <Label>מיקום ברירת מחדל</Label>
        <Input {...register("default_location")} />
      </div>
      <div className="space-y-1.5">
        <Label>מספר מקומות ברירת מחדל</Label>
        <Input type="number" min={1} {...register("default_slots")} />
      </div>
      <div className="space-y-1.5">
        <Label>מקצוע / שורת פער מקושרת (אופציונלי)</Label>
        <select
          className="border rounded-md h-9 px-2 w-full bg-background"
          value={(watch("gap_row_id") as number | string | undefined) ?? ""}
          onChange={(e) =>
            setValue("gap_row_id", e.target.value ? (Number(e.target.value) as never) : undefined)
          }
        >
          <option value="">— ללא —</option>
          {gapRows.map((row) => (
            <option key={row.id} value={row.id}>
              {row.certification_name}
            </option>
          ))}
        </select>
      </div>
      <div className="space-y-1.5">
        <Label>התייצבות (שעה/מקום)</Label>
        <Input {...register("checkin_details")} />
      </div>
      <div className="space-y-1.5">
        <Label>אורך ההסמכה</Label>
        <Input {...register("duration_text")} />
      </div>
      <div className="space-y-1.5">
        <Label>יחס חניכה נדרש</Label>
        <Input {...register("trainee_ratio")} />
      </div>
      <div className="space-y-1.5">
        <Label>תחמושת נדרשת</Label>
        <Textarea {...register("ammo_required")} />
      </div>
      <div className="space-y-1.5">
        <Label>דרישות / הגבלות (רישיון, גיל, רפואי וכו')</Label>
        <Textarea {...register("requirements_text")} />
      </div>
      <div className="space-y-1.5">
        <Label>ציוד נדרש</Label>
        <Textarea {...register("equipment_text")} />
      </div>
      <div className="space-y-1.5">
        <Label>אנשי קשר (שם - טלפון, שורה לכל איש קשר)</Label>
        <Textarea {...register("contacts_text")} />
      </div>
      <div className="space-y-1.5">
        <Label>הערות ברירת מחדל</Label>
        <Textarea {...register("default_notes")} />
      </div>
      <div className="flex gap-2">
        <Button type="submit" disabled={submitting}>
          שמור
        </Button>
        <Button type="button" variant="outline" onClick={() => router.back()}>
          ביטול
        </Button>
      </div>
    </form>
  );
}
