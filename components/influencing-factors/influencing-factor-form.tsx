"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import type { z } from "zod";
import {
  influencingFactorSchema,
  type InfluencingFactorFormValues,
} from "@/lib/validation/influencing-factor";

type InfluencingFactorInputValues = z.input<typeof influencingFactorSchema>;
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import type { Battalion } from "@/lib/types";

interface Props {
  battalions: Battalion[];
  factorId?: number;
  defaultValues?: Partial<InfluencingFactorFormValues>;
  defaultBattalionIds?: number[];
}

export function InfluencingFactorForm({
  battalions,
  factorId,
  defaultValues,
  defaultBattalionIds = [],
}: Props) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [selected, setSelected] = useState<number[]>(defaultBattalionIds);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<InfluencingFactorInputValues, unknown, InfluencingFactorFormValues>({
    resolver: zodResolver(influencingFactorSchema),
    defaultValues: {
      name: "",
      start_date: "",
      end_date: "",
      notes: "",
      battalion_ids: defaultBattalionIds,
      ...defaultValues,
    },
  });

  function toggleBattalion(id: number) {
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  async function onSubmit(values: InfluencingFactorFormValues) {
    setSubmitting(true);
    const payload = { ...values, battalion_ids: selected };
    const url = factorId ? `/api/influencing-factors/${factorId}` : "/api/influencing-factors";
    const method = factorId ? "PATCH" : "POST";
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
    const data = factorId ? { id: factorId } : await res.json();
    toast.success(factorId ? "הגורם המשפיע עודכן" : "הגורם המשפיע נוצר");
    router.push(`/influencing-factors/${data.id}`);
    router.refresh();
  }

  async function onDelete() {
    if (!factorId) return;
    if (!confirm("למחוק את הגורם המשפיע?")) return;
    setDeleting(true);
    const res = await fetch(`/api/influencing-factors/${factorId}`, { method: "DELETE" });
    setDeleting(false);
    if (!res.ok) {
      toast.error("המחיקה נכשלה");
      return;
    }
    toast.success("הגורם המשפיע נמחק");
    router.push("/calendar");
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 max-w-2xl">
      <div className="space-y-1.5">
        <Label>שם הגורם המשפיע</Label>
        <Input {...register("name")} placeholder='לדוגמה: תרג"ד' />
        {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label>תאריך התחלה</Label>
          <Input type="date" {...register("start_date")} />
          {errors.start_date && (
            <p className="text-xs text-destructive">{errors.start_date.message}</p>
          )}
        </div>
        <div className="space-y-1.5">
          <Label>תאריך סיום (אופציונלי)</Label>
          <Input type="date" {...register("end_date")} />
          {errors.end_date && (
            <p className="text-xs text-destructive">{errors.end_date.message}</p>
          )}
        </div>
      </div>

      <div className="space-y-1.5">
        <Label>הערות</Label>
        <Textarea {...register("notes")} />
      </div>

      <div className="space-y-2">
        <Label>יחידות מושפעות</Label>
        <div className="flex flex-wrap gap-x-6 gap-y-2">
          {battalions.map((b) => (
            <label key={b.id} className="flex items-center gap-2 cursor-pointer text-sm">
              <Checkbox
                checked={selected.includes(b.id)}
                onCheckedChange={() => toggleBattalion(b.id)}
              />
              <span className="font-medium" style={{ color: b.color_hex }}>
                {b.name}
              </span>
            </label>
          ))}
        </div>
      </div>

      <div className="flex gap-2">
        <Button type="submit" disabled={submitting}>
          {factorId ? "שמור שינויים" : "הוסף גורם משפיע"}
        </Button>
        <Button type="button" variant="outline" onClick={() => router.back()}>
          ביטול
        </Button>
        {factorId && (
          <Button
            type="button"
            variant="ghost"
            className="text-destructive hover:text-destructive ms-auto"
            onClick={onDelete}
            disabled={deleting}
          >
            <Trash2 className="size-4" />
            מחק
          </Button>
        )}
      </div>
    </form>
  );
}
