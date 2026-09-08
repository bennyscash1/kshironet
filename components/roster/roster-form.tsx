"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import type { z } from "zod";
import { rosterEntrySchema, type RosterFormValues } from "@/lib/validation/roster";

type RosterInputValues = z.input<typeof rosterEntrySchema>;
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import type { Battalion, RosterEntry } from "@/lib/types";

interface Props {
  certificationId: number;
  battalions: Battalion[];
  entry?: RosterEntry;
  defaultBattalionId?: number;
  hasPrerequisite?: boolean;
  defaultIsReserve?: boolean;
}

export function RosterForm({
  certificationId,
  battalions,
  entry,
  defaultBattalionId,
  hasPrerequisite,
  defaultIsReserve,
}: Props) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<RosterInputValues, unknown, RosterFormValues>({
    resolver: zodResolver(rosterEntrySchema),
    defaultValues: {
      battalion_id: entry?.battalion_id ?? defaultBattalionId ?? battalions[0]?.id,
      full_name: entry?.full_name ?? "",
      personal_number: entry?.personal_number ?? "",
      company_platoon: entry?.company_platoon ?? "",
      phone: entry?.phone ?? "",
      commander_name: entry?.commander_name ?? "",
      commander_phone: entry?.commander_phone ?? "",
      has_prior_certification: Boolean(entry?.has_prior_certification),
      prior_certification_details: entry?.prior_certification_details ?? "",
      requires_lodging: Boolean(entry?.requires_lodging),
      meets_prerequisite: entry?.meets_prerequisite ? true : hasPrerequisite ? false : null,
      notes: entry?.notes ?? "",
      is_reserve: entry ? Boolean(entry.is_reserve) : Boolean(defaultIsReserve),
    },
  });

  async function onSubmit(values: RosterFormValues) {
    setSubmitting(true);
    const url = entry ? `/api/roster/${entry.id}` : `/api/certifications/${certificationId}/roster`;
    const method = entry ? "PATCH" : "POST";
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(values),
    });
    setSubmitting(false);
    if (!res.ok) {
      toast.error("שמירת החייל נכשלה");
      return;
    }
    toast.success(entry ? "פרטי החייל עודכנו" : "החייל נוסף להסמכה");
    router.push(`/certifications/${certificationId}`);
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 max-w-xl">
      <div className="space-y-1.5">
        <Label>גדוד</Label>
        <select
          className="border rounded-md h-9 px-2 w-full bg-background"
          {...register("battalion_id", { valueAsNumber: true })}
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
          <Input {...register("full_name")} />
          {errors.full_name && <p className="text-xs text-destructive">{errors.full_name.message}</p>}
        </div>
        <div className="space-y-1.5">
          <Label>מספר אישי</Label>
          <Input {...register("personal_number")} />
          {errors.personal_number && (
            <p className="text-xs text-destructive">{errors.personal_number.message}</p>
          )}
        </div>
        <div className="space-y-1.5">
          <Label>פלוגה / מסגרת</Label>
          <Input {...register("company_platoon")} />
        </div>
        <div className="space-y-1.5">
          <Label>טלפון</Label>
          <Input {...register("phone")} />
        </div>
        <div className="space-y-1.5">
          <Label>שם המפקד</Label>
          <Input {...register("commander_name")} />
        </div>
        <div className="space-y-1.5">
          <Label>טלפון המפקד</Label>
          <Input {...register("commander_phone")} />
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Checkbox
          checked={Boolean(watch("has_prior_certification"))}
          onCheckedChange={(v) => setValue("has_prior_certification", Boolean(v))}
          id="has_prior_certification"
        />
        <Label htmlFor="has_prior_certification">קיימת הסמכה קודמת בתחום</Label>
      </div>
      {watch("has_prior_certification") && (
        <div className="space-y-1.5">
          <Label>פירוט ההסמכה הקודמת</Label>
          <Textarea {...register("prior_certification_details")} />
        </div>
      )}

      {/* Plain checkbox, matching the flag above it — deliberately NOT the amber
          highlighted container used for רישום כעתודה, which is styled that way because
          עתודה changes the seat quota. This one is purely informational. */}
      <div className="flex items-center gap-2">
        <Checkbox
          checked={Boolean(watch("requires_lodging"))}
          onCheckedChange={(v) => setValue("requires_lodging", Boolean(v))}
          id="requires_lodging"
        />
        <Label htmlFor="requires_lodging">נדרש לינה</Label>
      </div>

      {hasPrerequisite && (
        <div className="flex items-center gap-2">
          <Checkbox
            checked={Boolean(watch("meets_prerequisite"))}
            onCheckedChange={(v) => setValue("meets_prerequisite", Boolean(v))}
            id="meets_prerequisite"
          />
          <Label htmlFor="meets_prerequisite">עומד בדרישת הקדם להסמכה זו</Label>
        </div>
      )}

      <div className="flex items-center gap-2 rounded-md border border-amber-200 bg-amber-50 p-2.5">
        <Checkbox
          checked={Boolean(watch("is_reserve"))}
          onCheckedChange={(v) => setValue("is_reserve", Boolean(v))}
          id="is_reserve"
        />
        <Label htmlFor="is_reserve" className="text-amber-800">
          רישום כעתודה (מחוץ למכסת ההקצאות הרגילה)
        </Label>
      </div>

      <div className="space-y-1.5">
        <Label>הערות</Label>
        <Textarea {...register("notes")} />
      </div>

      <div className="flex gap-2">
        <Button type="submit" disabled={submitting}>
          {entry ? "שמור שינויים" : watch("is_reserve") ? "הוסף לעתודה" : "הוסף חייל"}
        </Button>
        <Button type="button" variant="outline" onClick={() => router.back()}>
          ביטול
        </Button>
      </div>
    </form>
  );
}
