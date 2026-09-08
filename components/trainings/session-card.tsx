"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Pencil, Trash2, Check, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { TimeCombobox, timeToMinutes } from "@/components/ui/time-combobox";
import type { Battalion, TrainingSession } from "@/lib/types";
import { battalionLabel } from "@/lib/battalions/label";

interface Props {
  trainingId: number;
  session: TrainingSession;
  battalion?: Battalion;
  battalions: Battalion[];
  canManage: boolean;
}

export function SessionCard({ trainingId, session, battalion, battalions, canManage }: Props) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    battalion_id: session.battalion_id,
    session_date: session.session_date,
    start_time: session.start_time,
    end_time: session.end_time,
    location: session.location ?? "",
    instructor_name: session.instructor_name ?? "",
    instructor_phone: session.instructor_phone ?? "",
    notes: session.notes ?? "",
  });

  const color = battalion?.color_hex ?? "#64748B";

  async function save() {
    const start = timeToMinutes(form.start_time);
    const end = timeToMinutes(form.end_time);
    if (start == null || end == null) {
      toast.error("שעה לא תקינה — יש להזין בפורמט HH:MM");
      return;
    }
    if (end <= start) {
      toast.error("שעת הסיום חייבת להיות מאוחרת משעת ההתחלה");
      return;
    }
    setSaving(true);
    const res = await fetch(`/api/trainings/${trainingId}/sessions/${session.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    setSaving(false);
    if (!res.ok) {
      toast.error("העדכון נכשל");
      return;
    }
    toast.success("הבלוק עודכן");
    setEditing(false);
    router.refresh();
  }

  async function remove() {
    if (!confirm("למחוק את הבלוק?")) return;
    const res = await fetch(`/api/trainings/${trainingId}/sessions/${session.id}`, {
      method: "DELETE",
    });
    if (!res.ok) {
      toast.error("המחיקה נכשלה");
      return;
    }
    toast.success("הבלוק נמחק");
    router.refresh();
  }

  if (editing) {
    return (
      <div className="rounded-lg border p-3 space-y-2 bg-card">
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1 col-span-2">
            <Label className="text-xs">יחידה</Label>
            <select
              className="border rounded-md h-9 px-2 w-full bg-background text-sm"
              value={form.battalion_id}
              onChange={(e) => setForm((f) => ({ ...f, battalion_id: Number(e.target.value) }))}
            >
              {battalions.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1 col-span-2">
            <Label className="text-xs">תאריך</Label>
            <Input
              type="date"
              value={form.session_date}
              onChange={(e) => setForm((f) => ({ ...f, session_date: e.target.value }))}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">שעת התחלה</Label>
            <TimeCombobox
              value={form.start_time}
              onChange={(v) => setForm((f) => ({ ...f, start_time: v }))}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">שעת סיום</Label>
            <TimeCombobox
              value={form.end_time}
              referenceTime={form.start_time}
              onChange={(v) => setForm((f) => ({ ...f, end_time: v }))}
            />
          </div>
          <div className="space-y-1 col-span-2">
            <Label className="text-xs">מיקום</Label>
            <Input
              value={form.location}
              onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">מדריך</Label>
            <Input
              value={form.instructor_name}
              onChange={(e) => setForm((f) => ({ ...f, instructor_name: e.target.value }))}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">טלפון מדריך</Label>
            <Input
              value={form.instructor_phone}
              onChange={(e) => setForm((f) => ({ ...f, instructor_phone: e.target.value }))}
            />
          </div>
          <div className="space-y-1 col-span-2">
            <Label className="text-xs">הערות</Label>
            <Textarea
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              rows={3}
            />
          </div>
        </div>
        <div className="flex gap-2 justify-end">
          <button
            type="button"
            onClick={save}
            disabled={saving}
            className="inline-flex items-center gap-1 text-sm text-emerald-600 hover:text-emerald-700 disabled:opacity-50"
          >
            <Check className="size-4" /> שמור
          </button>
          <button
            type="button"
            onClick={() => setEditing(false)}
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <X className="size-4" /> ביטול
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      className="rounded-lg p-3 shadow-sm text-white"
      style={{ backgroundColor: color }}
    >
      {/* Action row: time on the right (start), edit/delete grouped on the left
          (end). A normal flex row with space-between — no absolute positioning,
          so the time and icons can never overlap regardless of width. */}
      <div className="flex items-center justify-between gap-2">
        <span
          className="shrink-0 rounded bg-white/20 px-1.5 py-0.5 text-xs font-medium"
          dir="ltr"
        >
          {session.start_time}–{session.end_time}
        </span>
        {canManage && (
          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={() => setEditing(true)}
              aria-label="עריכה"
              className="p-1 rounded hover:bg-white/20"
            >
              <Pencil className="size-3.5" />
            </button>
            <button
              type="button"
              onClick={remove}
              aria-label="מחיקה"
              className="p-1 rounded hover:bg-white/20"
            >
              <Trash2 className="size-3.5" />
            </button>
          </div>
        )}
      </div>
      <div className="font-semibold text-sm mt-1">
        {/* The battalion's own name, not "גדוד" + its code: the code is a Latin slug for
            the non-numeric units, which rendered "גדוד gdsm" here. */}
        {battalionLabel(battalion, "?")}
        {session.instructor_name ? ` · ${session.instructor_name}` : ""}
      </div>
      {session.location && <div className="text-sm mt-1">{session.location}</div>}
      {session.instructor_phone && (
        <div className="text-sm mt-0.5" dir="ltr">
          {session.instructor_phone}
        </div>
      )}
      {session.notes && (
        <div className="text-sm mt-1 whitespace-pre-wrap opacity-90">{session.notes}</div>
      )}
    </div>
  );
}
