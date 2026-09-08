"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { RosterStatusBadge } from "@/components/certifications/status-badge";
import { Check, Copy, Trash2, Pencil } from "lucide-react";
import { copyToClipboard } from "@/lib/utils/clipboard";
import { formatSoldierBlock, rosterEntryToCopyInput } from "@/lib/roster/copy-format";
import { battalionLabel } from "@/lib/battalions/label";
import type { Battalion, RosterEntry } from "@/lib/types";

export function RosterTable({
  certificationId,
  certificationName,
  entries,
  battalions,
  manageableBattalionIds,
}: {
  certificationId: number;
  /** Title line of the copied block — see lib/roster/copy-format.ts. */
  certificationName: string;
  entries: RosterEntry[];
  battalions: Battalion[];
  /**
   * Battalions whose rows this user may edit or delete. `null` means every battalion
   * (brigade HQ); an array confines the controls to those ids (a battalion editor gets
   * exactly their own).
   *
   * An ID LIST RATHER THAN A PREDICATE FUNCTION, because a server component cannot pass a
   * function across the boundary. It is resolved from `canManageRosterEntry` on the server,
   * and it only decides which controls RENDER — every route re-runs the same permission, so
   * a hand-crafted request against another battalion's entry still fails.
   */
  manageableBattalionIds: number[] | null;
}) {
  const router = useRouter();
  const battalionMap = new Map(battalions.map((b) => [b.id, b]));
  const manageable = manageableBattalionIds === null ? null : new Set(manageableBattalionIds);
  const canManageRow = (battalionId: number) => manageable === null || manageable.has(battalionId);
  // Which row most recently copied, so only that row shows the check.
  const [copiedId, setCopiedId] = useState<number | null>(null);
  const copiedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Clearing the timer on unmount stops a setState landing on a table the user has already
  // navigated away from.
  useEffect(() => () => {
    if (copiedTimer.current) clearTimeout(copiedTimer.current);
  }, []);

  async function copyRow(entry: RosterEntry) {
    const text = formatSoldierBlock(
      rosterEntryToCopyInput(entry, certificationName, battalionMap.get(entry.battalion_id))
    );
    if (!(await copyToClipboard(text))) {
      toast.error("ההעתקה נכשלה");
      return;
    }
    if (copiedTimer.current) clearTimeout(copiedTimer.current);
    setCopiedId(entry.id);
    copiedTimer.current = setTimeout(() => setCopiedId(null), 1500);
  }

  async function handleDelete(entryId: number) {
    if (!confirm("להסיר את החייל מההסמכה?")) return;
    const res = await fetch(`/api/roster/${entryId}`, { method: "DELETE" });
    if (!res.ok) {
      toast.error("המחיקה נכשלה");
      return;
    }
    toast.success("החייל הוסר");
    router.refresh();
  }

  return (
    <div className="border rounded-md overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            {/* Leading copy column. No heading text — the icon is self-evident and a label
                here would widen the column for nothing. */}
            <TableHead className="w-9" aria-label="העתקה" />
            <TableHead>שם</TableHead>
            <TableHead>מספר אישי</TableHead>
            <TableHead>גדוד</TableHead>
            <TableHead>פלוגה</TableHead>
            <TableHead>טלפון</TableHead>
            <TableHead>סטטוס</TableHead>
            <TableHead></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {entries.map((e) => (
            <TableRow key={e.id}>
              <TableCell className="w-9 p-0 text-center">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => copyRow(e)}
                  title="העתקת פרטי החייל"
                  aria-label={`העתקת פרטי ${e.full_name}`}
                >
                  {copiedId === e.id ? (
                    <Check className="size-4 text-emerald-600" />
                  ) : (
                    <Copy className="size-4" />
                  )}
                </Button>
              </TableCell>
              <TableCell>{e.full_name}</TableCell>
              <TableCell>{e.personal_number}</TableCell>
              <TableCell>
                <span style={{ color: battalionMap.get(e.battalion_id)?.color_hex }}>
                  {/* Same resolver the copy button feeds, so the cell and the pasted
                      "גדוד-" line can never show different text for one battalion. */}
                  {battalionLabel(battalionMap.get(e.battalion_id), "-")}
                </span>
              </TableCell>
              <TableCell>{e.company_platoon ?? "-"}</TableCell>
              <TableCell>{e.phone ?? "-"}</TableCell>
              <TableCell>
                <RosterStatusBadge status={e.status} />
              </TableCell>
              {/* Another battalion's soldier stays visible but carries no controls — the
                  edit page and every write route refuse it independently. */}
              <TableCell className="flex gap-1 justify-end">
                {canManageRow(e.battalion_id) && (
                  <>
                    <Button variant="ghost" size="icon" asChild>
                      <Link href={`/certifications/${certificationId}/roster/${e.id}/edit`}>
                        <Pencil className="size-4" />
                      </Link>
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => handleDelete(e.id)}>
                      <Trash2 className="size-4" />
                    </Button>
                  </>
                )}
              </TableCell>
            </TableRow>
          ))}
          {entries.length === 0 && (
            <TableRow>
              <TableCell colSpan={8} className="text-center text-muted-foreground py-6">
                אין חיילים רשומים עדיין.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}
