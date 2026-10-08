"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, Loader2, Pencil, Power, PowerOff, Plus, X } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  battalionCreateSchema,
  battalionUpdateSchema,
} from "@/lib/validation/battalion";
import { cn } from "@/lib/utils";
import type { Battalion, Brigade } from "@/lib/types";

const DEFAULT_COLOR = "#64748B"; // battalions.color_hex default, 001_init.sql:8

/**
 * Pulls a Hebrew message out of a failed response.
 *
 * Two shapes are safe to render: a plain string, and a Zod flatten object whose messages the
 * server put there deliberately. A duplicate battalion code is the case that needs the
 * second — the database rejects it, not the schema, so it cannot surface as a client-side
 * validation error and arrives only here. Nothing in this component renders raw error text
 * from an exception.
 */
async function messageFrom(res: Response, fallback: string): Promise<string> {
  try {
    const body = await res.json();
    if (typeof body?.error === "string") return body.error;

    // Zod-flatten shape. The routes answer with it for field-level failures — including a
    // duplicate battalion code, which the database rejects rather than the schema, so it
    // arrives here and nowhere else. Only the first message per field is shown; the form
    // has one control per field.
    const fieldErrors = body?.error?.fieldErrors as Record<string, string[]> | undefined;
    if (fieldErrors) {
      const first = Object.values(fieldErrors).find((msgs) => msgs?.length);
      if (first?.[0]) return first[0];
    }
    return fallback;
  } catch {
    return fallback;
  }
}

/** A colour swatch paired with a text field, so a value can be picked or typed and the
 * schema's Hebrew regex message still applies to what was typed. */
function ColorField({
  id,
  value,
  onChange,
  disabled,
}: {
  id: string;
  value: string;
  onChange: (next: string) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-center gap-2">
      <input
        type="color"
        aria-label="בחירת צבע"
        value={/^#[0-9a-fA-F]{6}$/.test(value) ? value : DEFAULT_COLOR}
        onChange={(e) => onChange(e.target.value.toUpperCase())}
        disabled={disabled}
        className="size-9 shrink-0 cursor-pointer rounded-md border bg-transparent p-0.5 disabled:cursor-not-allowed"
      />
      <Input
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        dir="ltr"
        className="w-32 font-mono"
        placeholder={DEFAULT_COLOR}
      />
    </div>
  );
}

export function BattalionsManager({
  brigades,
  selectedBrigadeId,
  battalions,
}: {
  brigades: Brigade[];
  selectedBrigadeId: number;
  battalions: Battalion[];
}) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<number | null>(null);
  const [creating, setCreating] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [draft, setDraft] = useState({ code: "", name: "", color_hex: DEFAULT_COLOR });
  const [createError, setCreateError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [edit, setEdit] = useState({ name: "", color_hex: DEFAULT_COLOR });
  const [pendingDeactivate, setPendingDeactivate] = useState<Battalion | null>(null);

  const brigadeName =
    brigades.find((b) => b.id === selectedBrigadeId)?.name ?? `#${selectedBrigadeId}`;

  /** Switching brigade is a navigation, so the selection survives a refresh and is
   * shareable — and the battalion list is re-fetched on the server rather than filtered
   * on the client from a payload containing every brigade's battalions. */
  function selectBrigade(id: string) {
    router.push(`/admin/battalions?brigade=${encodeURIComponent(id)}`);
  }

  async function handleCreate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCreateError(null);

    const parsed = battalionCreateSchema.safeParse({
      brigade_id: selectedBrigadeId,
      code: draft.code,
      name: draft.name,
      color_hex: draft.color_hex,
    });
    if (!parsed.success) {
      setCreateError(parsed.error.issues[0]?.message ?? "אחד מהשדות אינו תקין");
      return;
    }

    setCreating(true);
    const res = await fetch("/api/admin/battalions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(parsed.data),
    });
    setCreating(false);

    if (!res.ok) {
      setCreateError(await messageFrom(res, "יצירת הגדוד נכשלה"));
      return;
    }
    setDraft({ code: "", name: "", color_hex: DEFAULT_COLOR });
    setShowCreate(false);
    toast.success("הגדוד נוצר");
    router.refresh();
  }

  async function patchBattalion(
    id: number,
    body: Record<string, unknown>,
    successMsg: string,
    fallbackMsg: string
  ) {
    setBusyId(id);
    const res = await fetch(`/api/admin/battalions/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setBusyId(null);

    if (!res.ok) {
      toast.error(await messageFrom(res, fallbackMsg));
      return false;
    }
    toast.success(successMsg);
    router.refresh();
    return true;
  }

  async function saveEdit(id: number) {
    const parsed = battalionUpdateSchema.safeParse({
      action: "update",
      name: edit.name,
      color_hex: edit.color_hex,
    });
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "אחד מהשדות אינו תקין");
      return;
    }
    if (await patchBattalion(id, parsed.data, "הגדוד עודכן", "עדכון הגדוד נכשל")) {
      setEditingId(null);
    }
  }

  async function confirmDeactivate() {
    if (!pendingDeactivate) return;
    await patchBattalion(
      pendingDeactivate.id,
      { action: "set_active", is_active: false },
      "הגדוד הושבת",
      "השבתת הגדוד נכשלה"
    );
    setPendingDeactivate(null);
  }

  return (
    <div className="space-y-6">
      {brigades.length > 1 ? (
        <div className="flex flex-wrap items-center gap-2">
          <Label htmlFor="brigade-picker" className="text-sm">
            חטיבה
          </Label>
          <select
            id="brigade-picker"
            value={selectedBrigadeId}
            onChange={(e) => selectBrigade(e.target.value)}
            className="h-9 rounded-md border bg-background px-3 text-sm"
          >
            {brigades.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
          <span className="text-xs text-muted-foreground">
            מספר גדוד פעיל הוא ייחודי בכל הצבא — אותו מספר אינו יכול לשמש שני גדודים
            פעילים, גם לא בחטיבות שונות. מספר של גדוד מושבת מתפנה לשימוש מחדש.
          </span>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          חטיבה: <span className="font-medium text-foreground">{brigadeName}</span>
        </p>
      )}

      <section className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">הוספת גדוד</h2>
          {!showCreate && (
            <Button variant="outline" size="sm" onClick={() => setShowCreate(true)}>
              <Plus className="size-4" />
              גדוד חדש
            </Button>
          )}
        </div>

        {showCreate && (
          // noValidate: native constraint bubbles render LTR in the browser's own locale,
          // contradicting every Hebrew message the Zod schema provides.
          <form noValidate onSubmit={handleCreate} className="space-y-3">
            <div className="flex flex-wrap items-end gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="battalion-code">קוד הגדוד</Label>
                <Input
                  id="battalion-code"
                  value={draft.code}
                  onChange={(e) => {
                    setDraft({ ...draft, code: e.target.value });
                    setCreateError(null);
                  }}
                  placeholder="לדוגמה: 5030"
                  dir="ltr"
                  className="w-40"
                  disabled={creating}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="battalion-name">שם הגדוד</Label>
                <Input
                  id="battalion-name"
                  value={draft.name}
                  onChange={(e) => {
                    setDraft({ ...draft, name: e.target.value });
                    setCreateError(null);
                  }}
                  placeholder="לדוגמה: גדוד 5030"
                  className="w-56"
                  disabled={creating}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="battalion-color">צבע</Label>
                <ColorField
                  id="battalion-color"
                  value={draft.color_hex}
                  onChange={(color_hex) => {
                    setDraft({ ...draft, color_hex });
                    setCreateError(null);
                  }}
                  disabled={creating}
                />
              </div>
              <Button type="submit" disabled={creating}>
                {creating && <Loader2 className="size-4 animate-spin" />}
                יצירת גדוד
              </Button>
              <Button
                type="button"
                variant="ghost"
                disabled={creating}
                onClick={() => {
                  setShowCreate(false);
                  setCreateError(null);
                }}
              >
                ביטול
              </Button>
            </div>
            {createError && <p className="text-sm text-destructive">{createError}</p>}
            <p className="text-xs text-muted-foreground">
              קוד הגדוד קבוע ואינו ניתן לשינוי לאחר היצירה — הוא נשמר ברשומות התיעוד של
              המערכת. גדוד שקודו שגוי יש להשבית וליצור מחדש.
            </p>
          </form>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">גדודים ({battalions.length})</h2>
        {battalions.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            טרם הוגדרו גדודים בחטיבה זו.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>קוד</TableHead>
                <TableHead>שם</TableHead>
                <TableHead>צבע</TableHead>
                <TableHead>סטטוס</TableHead>
                <TableHead>פעולות</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {battalions.map((battalion) => {
                const busy = busyId === battalion.id;
                const isEditing = editingId === battalion.id;
                return (
                  <TableRow key={battalion.id}>
                    <TableCell className="font-mono" dir="ltr">
                      {battalion.code}
                    </TableCell>
                    <TableCell className="font-medium">
                      {isEditing ? (
                        <Input
                          value={edit.name}
                          onChange={(e) => setEdit({ ...edit, name: e.target.value })}
                          className="w-52"
                          disabled={busy}
                          aria-label="שם הגדוד"
                        />
                      ) : (
                        battalion.name
                      )}
                    </TableCell>
                    <TableCell>
                      {isEditing ? (
                        <ColorField
                          id={`color-${battalion.id}`}
                          value={edit.color_hex}
                          onChange={(color_hex) => setEdit({ ...edit, color_hex })}
                          disabled={busy}
                        />
                      ) : (
                        <div className="flex items-center gap-2">
                          <span
                            className="inline-block size-4 rounded border"
                            style={{ backgroundColor: battalion.color_hex }}
                          />
                          <span className="font-mono text-xs text-muted-foreground" dir="ltr">
                            {battalion.color_hex}
                          </span>
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge
                        className={
                          battalion.is_active === 1
                            ? "bg-emerald-500 text-white"
                            : "bg-rose-500 text-white"
                        }
                      >
                        {battalion.is_active === 1 ? "פעיל" : "מושבת"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-2">
                        {isEditing ? (
                          <>
                            <Button size="sm" disabled={busy} onClick={() => saveEdit(battalion.id)}>
                              {busy ? (
                                <Loader2 className="size-4 animate-spin" />
                              ) : (
                                <Check className="size-4" />
                              )}
                              שמירה
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              disabled={busy}
                              onClick={() => setEditingId(null)}
                            >
                              <X className="size-4" />
                              ביטול
                            </Button>
                          </>
                        ) : (
                          <>
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={busy}
                              onClick={() => {
                                setEditingId(battalion.id);
                                setEdit({
                                  name: battalion.name,
                                  color_hex: battalion.color_hex,
                                });
                              }}
                            >
                              <Pencil className="size-4" />
                              עריכה
                            </Button>
                            {battalion.is_active === 1 ? (
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={busy}
                                onClick={() => setPendingDeactivate(battalion)}
                              >
                                <PowerOff className="size-4" />
                                השבתה
                              </Button>
                            ) : (
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={busy}
                                onClick={() =>
                                  patchBattalion(
                                    battalion.id,
                                    { action: "set_active", is_active: true },
                                    "הגדוד הופעל",
                                    "הפעלת הגדוד נכשלה"
                                  )
                                }
                              >
                                <Power className="size-4" />
                                הפעלה
                              </Button>
                            )}
                          </>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </section>

      {/* A real dialog rather than window.confirm(): the native one renders LTR in the
          browser's locale, which no Hebrew warning survives. */}
      <AlertDialog
        open={pendingDeactivate !== null}
        onOpenChange={(open) => !open && setPendingDeactivate(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>השבתת גדוד</AlertDialogTitle>
            <AlertDialogDescription>
              הגדוד ייעלם מרשימות הבחירה ומטבלת הפערים, אך הנתונים שלו — רישומים, דרישות,
              הקצאות ופלוגות — יישמרו וימשיכו להיספר בדוחות. ניתן להפעיל אותו מחדש בכל עת.
              להשבית את &quot;{pendingDeactivate?.name}&quot;?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busyId !== null}>ביטול</AlertDialogCancel>
            <AlertDialogAction
              className={cn(buttonVariants({ variant: "destructive" }))}
              disabled={busyId !== null}
              onClick={(e) => {
                // Keep the dialog open while the request runs; close on outcome.
                e.preventDefault();
                confirmDeactivate();
              }}
            >
              {busyId !== null && <Loader2 className="size-4 animate-spin" />}
              השבתה
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
