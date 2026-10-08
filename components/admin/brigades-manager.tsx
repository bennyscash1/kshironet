"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AlertTriangle, Check, Loader2, Pencil, Power, PowerOff, X } from "lucide-react";
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
import { brigadeCreateSchema } from "@/lib/validation/brigade";
import { cn } from "@/lib/utils";
import type { Brigade } from "@/lib/types";

function formatDate(iso: string) {
  const [date] = iso.split("T");
  const [year, month, day] = (date ?? "").split("-");
  return year && month && day ? `${day}/${month}/${year}` : iso;
}

/**
 * Pulls a Hebrew message out of a failed response.
 *
 * The brigade routes answer either `{ error: "<Hebrew>" }` for a mapped database failure or
 * `{ error: <Zod flatten object> }` for a bad payload. Only a string is safe to render; a
 * flatten object means the client sent something the schema rejected, which is a bug here
 * rather than something to narrate to the user. Nothing in this component ever renders raw
 * error text from an exception.
 */
async function messageFrom(res: Response, fallback: string): Promise<string> {
  try {
    const body = await res.json();
    return typeof body?.error === "string" ? body.error : fallback;
  } catch {
    return fallback;
  }
}

export function BrigadesManager({
  brigades,
  isolationReady,
}: {
  brigades: Brigade[];
  isolationReady: boolean;
}) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<number | null>(null);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [createError, setCreateError] = useState<string | null>(null);
  /** Row id currently being renamed, and the draft value. */
  const [renamingId, setRenamingId] = useState<number | null>(null);
  const [draftName, setDraftName] = useState("");
  /** The brigade awaiting deactivation confirmation. */
  const [pendingDeactivate, setPendingDeactivate] = useState<Brigade | null>(null);

  const activeCount = brigades.filter((b) => b.is_active === 1).length;
  // A second brigade is legitimate since migration 026 scoped battalions, and migration
  // 027 removed the trigger that refused one. What is blocked now is creating entities
  // that still have no brigade_id — see UnscopedEntityNotice and migration 027.
  const unscopedEntitiesBlocked = !isolationReady && activeCount >= 1;

  async function handleCreate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCreateError(null);

    // Validate with the same Hebrew schema the route uses, so a blank or whitespace-only
    // name is refused here with the schema's own message instead of a round trip.
    const parsed = brigadeCreateSchema.safeParse({ name: newName });
    if (!parsed.success) {
      setCreateError(parsed.error.issues[0]?.message ?? "שם החטיבה אינו תקין");
      return;
    }

    setCreating(true);
    const res = await fetch("/api/admin/brigades", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: parsed.data.name }),
    });
    setCreating(false);

    if (!res.ok) {
      setCreateError(await messageFrom(res, "יצירת החטיבה נכשלה"));
      return;
    }
    setNewName("");
    toast.success("החטיבה נוצרה");
    router.refresh();
  }

  async function patchBrigade(
    id: number,
    body: Record<string, unknown>,
    successMsg: string,
    fallbackMsg: string
  ) {
    setBusyId(id);
    const res = await fetch(`/api/admin/brigades/${id}`, {
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

  async function saveRename(id: number) {
    const parsed = brigadeCreateSchema.safeParse({ name: draftName });
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "שם החטיבה אינו תקין");
      return;
    }
    const ok = await patchBrigade(
      id,
      { action: "rename", name: parsed.data.name },
      "שם החטיבה עודכן",
      "עדכון שם החטיבה נכשל"
    );
    if (ok) setRenamingId(null);
  }

  async function confirmDeactivate() {
    if (!pendingDeactivate) return;
    await patchBrigade(
      pendingDeactivate.id,
      { action: "set_active", is_active: false },
      "החטיבה הושבתה",
      "השבתת החטיבה נכשלה"
    );
    setPendingDeactivate(null);
  }

  return (
    <div className="space-y-6">
      {!isolationReady && (
        <div className="flex gap-3 rounded-md border border-amber-500/50 bg-amber-500/10 p-4">
          <AlertTriangle className="mt-0.5 size-5 shrink-0 text-amber-600" />
          <div className="space-y-1 text-sm">
            <p className="font-semibold">בידוד הנתונים בין חטיבות הושלם חלקית</p>
            <p className="text-muted-foreground">
              חטיבות וגדודים משויכים לחטיבה ומופרדים כראוי, ולכן ניתן ליצור כאן יותר
              מחטיבה אחת ולהגדיר גדודים תחת כל אחת מהן. קוד גדוד יכול לחזור בין חטיבות
              שונות ואינו מתנגש.
            </p>
            <p className="text-muted-foreground">
              עם זאת, שאר הישויות במערכת עדיין אינן משויכות לחטיבה. לכן, כל עוד קיימת יותר
              מחטיבה אחת פעילה, <span className="font-medium text-foreground">לא ניתן
              ליצור</span> הסמכות, תבניות הסמכה, שורות פערים, הדרכות, גורמים משפיעים
              והסמכות שבידי חיילים. צפייה ועריכה של רשומות קיימות ממשיכות לעבוד כרגיל,
              והמסכים עצמם נותרים גלויים ומסבירים את החסימה.
            </p>
            <p className="text-muted-foreground">
              החסימה תוסר לאחר שיושלם בידוד הנתונים לכל הישויות, או אם תושבת אחת החטיבות
              כך שתישאר חטיבה פעילה אחת.
            </p>
          </div>
        </div>
      )}

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">הוספת חטיבה</h2>
        {/* noValidate: native constraint bubbles render LTR in the browser's own locale,
            which contradicts every Hebrew message the Zod schema provides. */}
        <form noValidate onSubmit={handleCreate} className="flex flex-wrap items-end gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="brigade-name">שם החטיבה</Label>
            <Input
              id="brigade-name"
              value={newName}
              onChange={(e) => {
                setNewName(e.target.value);
                setCreateError(null);
              }}
              placeholder="לדוגמה: 228-אלון"
              disabled={creating}
              className="w-64"
              aria-invalid={createError ? true : undefined}
              aria-describedby={createError ? "brigade-name-error" : undefined}
            />
          </div>
          <Button type="submit" disabled={creating}>
            {creating && <Loader2 className="size-4 animate-spin" />}
            יצירת חטיבה
          </Button>
        </form>
        {createError && (
          <p id="brigade-name-error" className="text-sm text-destructive">
            {createError}
          </p>
        )}
        {unscopedEntitiesBlocked && (
          <p className="text-sm text-muted-foreground">
            הוספת חטיבה שנייה תחסום יצירת הסמכות, תבניות, שורות פערים, הדרכות וגורמים
            משפיעים — עד שיושלם בידוד הנתונים לכל הישויות.
          </p>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">חטיבות ({brigades.length})</h2>
        {brigades.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            טרם הוגדרה חטיבה. הוסיפו את החטיבה שאליה שייכים הנתונים הקיימים.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>שם</TableHead>
                <TableHead>סטטוס</TableHead>
                <TableHead>נוצרה</TableHead>
                <TableHead>פעולות</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {brigades.map((brigade) => {
                const busy = busyId === brigade.id;
                const isRenaming = renamingId === brigade.id;
                return (
                  <TableRow key={brigade.id}>
                    <TableCell className="font-medium">
                      {isRenaming ? (
                        <div className="flex items-center gap-2">
                          <Input
                            value={draftName}
                            onChange={(e) => setDraftName(e.target.value)}
                            className="w-56"
                            disabled={busy}
                            aria-label="שם החטיבה"
                          />
                          <Button
                            size="sm"
                            onClick={() => saveRename(brigade.id)}
                            disabled={busy}
                          >
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
                            onClick={() => setRenamingId(null)}
                            disabled={busy}
                          >
                            <X className="size-4" />
                            ביטול
                          </Button>
                        </div>
                      ) : (
                        brigade.name
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge
                        className={
                          brigade.is_active === 1
                            ? "bg-emerald-500 text-white"
                            : "bg-rose-500 text-white"
                        }
                      >
                        {brigade.is_active === 1 ? "פעילה" : "מושבתת"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {formatDate(brigade.created_at)}
                    </TableCell>
                    <TableCell>
                      {!isRenaming && (
                        <div className="flex flex-wrap gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={busy}
                            onClick={() => {
                              setRenamingId(brigade.id);
                              setDraftName(brigade.name);
                            }}
                          >
                            <Pencil className="size-4" />
                            שינוי שם
                          </Button>
                          {brigade.is_active === 1 ? (
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={busy}
                              onClick={() => setPendingDeactivate(brigade)}
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
                                patchBrigade(
                                  brigade.id,
                                  { action: "set_active", is_active: true },
                                  "החטיבה הופעלה",
                                  "הפעלת החטיבה נכשלה"
                                )
                              }
                            >
                              <Power className="size-4" />
                              הפעלה
                            </Button>
                          )}
                        </div>
                      )}
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
            <AlertDialogTitle>השבתת חטיבה</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingDeactivate && activeCount === 1 ? (
                <>
                  זו החטיבה הפעילה היחידה במערכת. השבתתה תשאיר את המערכת ללא חטיבה פעילה —
                  מצב שאין סיבה להגיע אליו בטעות. הנתונים לא יימחקו וניתן להפעיל את החטיבה
                  מחדש בכל עת. להשבית את &quot;{pendingDeactivate.name}&quot;?
                </>
              ) : (
                <>
                  הנתונים של החטיבה יישמרו וניתן להפעיל אותה מחדש בכל עת. להשבית את
                  &quot;{pendingDeactivate?.name}&quot;?
                </>
              )}
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
