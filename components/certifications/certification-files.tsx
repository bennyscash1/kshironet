"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Trash2, Upload } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogAction,
  AlertDialogCancel,
} from "@/components/ui/alert-dialog";
import { CertificationFileRow } from "@/components/certifications/certification-files-list";
import {
  ALLOWED_FILE_ACCEPT,
  MAX_FILE_SIZE_LABEL,
  checkFileClientSide,
} from "@/lib/validation/certification-file";
import { cn } from "@/lib/utils";
import type { CertificationFileWithUrl } from "@/lib/types";

/**
 * Attachments section for a saved certification — the single source of truth for the
 * file list, the upload control and the delete flow. Used by BOTH the certification
 * detail page and the edit page, so the two can never drift apart.
 *
 * Attachments hang off a persisted certification id, so this only renders once the
 * certification exists (never on the "new" form).
 *
 * `canManage` controls the mutating affordances only — the list itself stays visible to
 * every viewer. It is a UI hint: every endpoint called here is independently gated
 * server-side by the same `canEdit()` guard as editing the certification, so hiding the
 * button is never the actual authorization boundary.
 *
 * `files` is recomputed by the server on every request (signed URLs are short-lived),
 * so it is the authority. Local state exists only to reflect a mutation immediately;
 * `router.refresh()` re-syncs it with fresh URLs right after.
 */
export function CertificationFiles({
  certificationId,
  files,
  canManage,
  className,
}: {
  certificationId: number;
  files: CertificationFileWithUrl[];
  canManage: boolean;
  className?: string;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<CertificationFileWithUrl | null>(null);
  const [deleting, setDeleting] = useState(false);
  // Mirrors `files` so an upload/delete shows up without waiting for a server render.
  // Re-seeded whenever the server sends a new list (i.e. after `router.refresh()`),
  // which replaces the locally added row with the authoritative one — that resync is
  // what keeps the two from ever duplicating an entry. Done during render (React's
  // "adjust state when a prop changes" pattern) rather than in an effect, so the
  // server list wins in the same pass instead of causing a cascading re-render.
  const [items, setItems] = useState(files);
  const [syncedFrom, setSyncedFrom] = useState(files);
  if (syncedFrom !== files) {
    setSyncedFrom(files);
    setItems(files);
  }

  async function handleFileSelected(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    // Reset the input so picking the same file again still fires onChange.
    event.target.value = "";
    if (!file) return;

    // Pre-check mirrors the server rules — the server re-validates regardless.
    const clientError = checkFileClientSide(file);
    if (clientError) {
      toast.error(clientError);
      return;
    }

    setUploading(true);
    // Field name "file" is the contract with app/api/certifications/[id]/files.
    // That route reads the certification id from its own path, so it behaves
    // identically from the detail page and the edit page — no navigation involved.
    const body = new FormData();
    body.append("file", file);
    let created: CertificationFileWithUrl;
    try {
      const res = await fetch(`/api/certifications/${certificationId}/files`, {
        method: "POST",
        body,
      });
      if (!res.ok) {
        toast.error("העלאת הקובץ נכשלה");
        return;
      }
      created = (await res.json()) as CertificationFileWithUrl;
    } catch {
      toast.error("העלאת הקובץ נכשלה");
      return;
    } finally {
      setUploading(false);
    }

    // The route returns the created row together with a signed URL, so the new file
    // can be listed straight away — no full page reload on either page.
    setItems((prev) => [...prev, created]);
    toast.success("הקובץ צורף להסמכה");
    router.refresh();
  }

  async function handleDelete() {
    if (!pendingDelete) return;
    const target = pendingDelete;
    setDeleting(true);
    const res = await fetch(`/api/certifications/${certificationId}/files/${target.id}`, {
      method: "DELETE",
    });
    setDeleting(false);
    setPendingDelete(null);
    if (!res.ok) {
      toast.error("מחיקת הקובץ נכשלה");
      return;
    }
    setItems((prev) => prev.filter((f) => f.id !== target.id));
    toast.success("הקובץ נמחק");
    router.refresh();
  }

  return (
    <div className={cn("space-y-3", className)}>
      <div className="flex items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold">
            קבצים מצורפים
            {items.length > 0 && (
              <span className="text-muted-foreground font-normal text-sm"> ({items.length})</span>
            )}
          </h2>
          {canManage && (
            <p className="text-sm text-muted-foreground">
              ניתן לצרף תמונות (PNG, JPG, WEBP) או PDF, עד {MAX_FILE_SIZE_LABEL} לקובץ.
            </p>
          )}
        </div>
        {canManage && (
          <>
            <input
              ref={inputRef}
              type="file"
              className="hidden"
              accept={ALLOWED_FILE_ACCEPT}
              onChange={handleFileSelected}
            />
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={uploading}
              onClick={() => inputRef.current?.click()}
            >
              {uploading ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Upload className="size-4" />
              )}
              {uploading ? "מעלה…" : "העלה קובץ"}
            </Button>
          </>
        )}
      </div>

      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">לא צורפו קבצים להסמכה זו.</p>
      ) : (
        <div className="space-y-2">
          {items.map((file) => (
            <CertificationFileRow
              key={file.id}
              file={file}
              action={
                canManage ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="text-destructive"
                    aria-label="מחיקת קובץ"
                    onClick={() => setPendingDelete(file)}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                ) : undefined
              }
            />
          ))}
        </div>
      )}

      <AlertDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => {
          if (!open && !deleting) setPendingDelete(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>מחיקת קובץ</AlertDialogTitle>
            <AlertDialogDescription>
              האם אתה בטוח שברצונך למחוק את &quot;{pendingDelete?.original_name}&quot;?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>ביטול</AlertDialogCancel>
            <AlertDialogAction
              className={cn(buttonVariants({ variant: "destructive" }))}
              disabled={deleting}
              onClick={(e) => {
                // Keep the dialog open while the request runs; close on outcome.
                e.preventDefault();
                handleDelete();
              }}
            >
              {deleting && <Loader2 className="size-4 animate-spin" />}
              אישור
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
