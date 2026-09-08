"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { eachDayOfInterval, format, parseISO } from "date-fns";
import type { z } from "zod";
import { trainingSchema, type TrainingFormValues, KNOWN_TRAINING_DOMAINS } from "@/lib/validation/training";

type TrainingInputValues = z.input<typeof trainingSchema>;
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ColorSelect } from "@/components/ui/color-select";
import { TimeCombobox, timeToMinutes } from "@/components/ui/time-combobox";
import { Plus, Trash2 } from "lucide-react";
import { getHebrewWeekdayShort } from "@/lib/utils/dates";
import type { Battalion, TrainingSession } from "@/lib/types";

interface SessionBlock {
  key: string;
  session_date: string;
  battalion_id: number | "";
  start_time: string;
  end_time: string;
  location: string;
  instructor_name: string;
  instructor_phone: string;
  notes: string;
}

interface Props {
  battalions: Battalion[];
  palette: string[];
  trainingId?: number;
  defaultValues?: Partial<TrainingInputValues>;
  defaultSessions?: TrainingSession[];
}

let blockCounter = 0;
function newKey() {
  blockCounter += 1;
  return `b${blockCounter}`;
}

export function TrainingForm({ battalions, palette, trainingId, defaultValues, defaultSessions }: Props) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [blocks, setBlocks] = useState<SessionBlock[]>(
    (defaultSessions ?? []).map((s) => ({
      key: newKey(),
      session_date: s.session_date,
      battalion_id: s.battalion_id,
      start_time: s.start_time ?? "",
      end_time: s.end_time ?? "",
      location: s.location ?? "",
      instructor_name: s.instructor_name ?? "",
      instructor_phone: s.instructor_phone ?? "",
      notes: s.notes ?? "",
    }))
  );

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<TrainingInputValues, unknown, TrainingFormValues>({
    resolver: zodResolver(trainingSchema),
    defaultValues: {
      name: "",
      domain: "",
      start_date: "",
      end_date: "",
      contact_name: "",
      contact_phone: "",
      notes: "",
      color_hex: "",
      sessions: [],
      ...defaultValues,
    },
  });

  const startDate = watch("start_date");
  const endDate = watch("end_date");

  const days = useMemo(() => {
    if (!startDate) return [] as string[];
    try {
      const start = parseISO(startDate);
      const end = endDate ? parseISO(endDate) : start;
      if (end < start) return [format(start, "yyyy-MM-dd")];
      return eachDayOfInterval({ start, end }).map((d) => format(d, "yyyy-MM-dd"));
    } catch {
      return [] as string[];
    }
  }, [startDate, endDate]);

  function addBlock(day: string) {
    setBlocks((prev) => [
      ...prev,
      {
        key: newKey(),
        session_date: day,
        battalion_id: "",
        start_time: "",
        end_time: "",
        location: "",
        instructor_name: "",
        instructor_phone: "",
        notes: "",
      },
    ]);
  }

  function updateBlock(key: string, patch: Partial<SessionBlock>) {
    setBlocks((prev) => prev.map((b) => (b.key === key ? { ...b, ...patch } : b)));
  }

  function removeBlock(key: string) {
    setBlocks((prev) => prev.filter((b) => b.key !== key));
  }

  async function onSubmit(values: TrainingFormValues) {
    // Only keep blocks whose day is still within the selected range.
    const daySet = new Set(days);
    const keptBlocks = blocks.filter(
      (b) => daySet.has(b.session_date) && b.battalion_id !== "" && b.start_time && b.end_time
    );

    // Validate times: valid HH:mm and end strictly after start.
    for (const b of keptBlocks) {
      const start = timeToMinutes(b.start_time);
      const end = timeToMinutes(b.end_time);
      if (start == null || end == null) {
        toast.error("שעה לא תקינה — יש להזין בפורמט HH:MM");
        return;
      }
      if (end <= start) {
        toast.error("שעת הסיום חייבת להיות מאוחרת משעת ההתחלה");
        return;
      }
    }

    const sessions = keptBlocks.map((b) => ({
      battalion_id: Number(b.battalion_id),
      session_date: b.session_date,
      start_time: b.start_time,
      end_time: b.end_time,
      location: b.location || null,
      instructor_name: b.instructor_name || null,
      instructor_phone: b.instructor_phone || null,
      notes: b.notes || null,
    }));

    setSubmitting(true);
    const payload = { ...values, sessions };
    const url = trainingId ? `/api/trainings/${trainingId}` : "/api/trainings";
    const method = trainingId ? "PATCH" : "POST";
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
    toast.success(trainingId ? "ההדרכה עודכנה" : "ההדרכה נוצרה");
    router.push(`/trainings/${trainingId ?? data.id}`);
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 max-w-2xl">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label>שם ההדרכה</Label>
          <Input {...register("name")} placeholder="הדרכת עזרה ראשונה" />
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
        <div className="space-y-1.5 md:col-span-2">
          <Label>תחום</Label>
          <Input {...register("domain")} placeholder="רפואה" list="training-domains" />
          <datalist id="training-domains">
            {KNOWN_TRAINING_DOMAINS.map((d) => (
              <option key={d} value={d} />
            ))}
          </datalist>
        </div>
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
        </div>
        <div className="space-y-1.5">
          <Label>איש קשר</Label>
          <Input {...register("contact_name")} placeholder="שם איש הקשר המגיע" />
        </div>
        <div className="space-y-1.5">
          <Label>טלפון איש קשר</Label>
          <Input {...register("contact_phone")} />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label>הערות</Label>
        <Textarea {...register("notes")} />
      </div>

      <div className="space-y-3">
        <div>
          <h2 className="text-lg font-semibold">שעות הדרכה לפי יחידה, לכל יום בטווח</h2>
          {days.length === 0 && (
            <p className="text-sm text-muted-foreground">
              בחר תאריך התחלה כדי להגדיר שעות לכל יום.
            </p>
          )}
        </div>

        {days.map((day) => {
          const dayBlocks = blocks.filter((b) => b.session_date === day);
          return (
            <div key={day} className="rounded-lg border p-3 space-y-3">
              <div className="flex items-center justify-between">
                <div className="text-sm font-medium">
                  יום {getHebrewWeekdayShort(day)}, {format(parseISO(day), "dd/MM/yyyy")}
                </div>
                <Button type="button" variant="outline" size="sm" onClick={() => addBlock(day)}>
                  <Plus className="size-4" />
                  הוסף בלוק
                </Button>
              </div>

              {dayBlocks.length === 0 && (
                <p className="text-xs text-muted-foreground">אין בלוקים ליום זה.</p>
              )}

              {dayBlocks.map((b) => (
                <div key={b.key} className="rounded-md border p-2 space-y-2 bg-muted/30">
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1 col-span-2">
                      <Label className="text-xs">יחידה</Label>
                      <select
                        className="border rounded-md h-9 px-2 w-full bg-background text-sm"
                        value={b.battalion_id}
                        onChange={(e) =>
                          updateBlock(b.key, {
                            battalion_id: e.target.value ? Number(e.target.value) : "",
                          })
                        }
                      >
                        <option value="">— בחר יחידה —</option>
                        {battalions.map((bat) => (
                          <option key={bat.id} value={bat.id}>
                            {bat.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">שעת התחלה</Label>
                      <TimeCombobox
                        value={b.start_time}
                        onChange={(v) => {
                          // Convenience: default end to start + 1h when empty.
                          const start = timeToMinutes(v);
                          const patch: Partial<SessionBlock> = { start_time: v };
                          if (start != null && !b.end_time) {
                            const end = (start + 60) % (24 * 60);
                            patch.end_time = `${String(Math.floor(end / 60)).padStart(2, "0")}:${String(
                              end % 60
                            ).padStart(2, "0")}`;
                          }
                          updateBlock(b.key, patch);
                        }}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">שעת סיום</Label>
                      <TimeCombobox
                        value={b.end_time}
                        referenceTime={b.start_time}
                        onChange={(v) => updateBlock(b.key, { end_time: v })}
                      />
                    </div>
                    <div className="space-y-1 col-span-2">
                      <Label className="text-xs">מיקום</Label>
                      <Input
                        value={b.location}
                        onChange={(e) => updateBlock(b.key, { location: e.target.value })}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">מדריך</Label>
                      <Input
                        value={b.instructor_name}
                        onChange={(e) => updateBlock(b.key, { instructor_name: e.target.value })}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">טלפון מדריך</Label>
                      <Input
                        value={b.instructor_phone}
                        onChange={(e) => updateBlock(b.key, { instructor_phone: e.target.value })}
                      />
                    </div>
                    <div className="space-y-1 col-span-2">
                      <Label className="text-xs">הערות</Label>
                      <Textarea
                        value={b.notes}
                        onChange={(e) => updateBlock(b.key, { notes: e.target.value })}
                        rows={3}
                      />
                    </div>
                  </div>
                  <div className="flex justify-end">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => removeBlock(b.key)}
                    >
                      <Trash2 className="size-4" />
                      הסר בלוק
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          );
        })}
      </div>

      <div className="flex gap-2">
        <Button type="submit" disabled={submitting}>
          {trainingId ? "שמור שינויים" : "הוסף הדרכה"}
        </Button>
        <Button type="button" variant="outline" onClick={() => router.back()}>
          ביטול
        </Button>
      </div>
    </form>
  );
}
