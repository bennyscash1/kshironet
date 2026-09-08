"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { FileDown, FileSpreadsheet, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
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
import { CertificationStatusBadge, RosterStatusBadge } from "@/components/certifications/status-badge";
import { DateRange } from "@/components/ui/date-range";
import { downloadBlob } from "@/lib/utils/download-file";
import { exportElementToPdf } from "@/lib/utils/export-pdf";
import { ROSTER_STATUS_LABELS, type Battalion } from "@/lib/types";
import type { BattalionRosterReportRow } from "@/lib/db/repositories/reports";

const CONTENT_ID = "battalion-roster-report-content";

/** Rows of one certification, in the order the report renders them. */
interface CertificationGroup {
  certification_id: number;
  certification_name: string;
  location: string | null;
  start_date: string;
  end_date: string | null;
  status: BattalionRosterReportRow["certification_status"];
  rows: BattalionRosterReportRow[];
}

function groupByCertification(rows: BattalionRosterReportRow[]): CertificationGroup[] {
  const groups = new Map<number, CertificationGroup>();
  for (const row of rows) {
    let group = groups.get(row.certification_id);
    if (!group) {
      group = {
        certification_id: row.certification_id,
        certification_name: row.certification_name,
        location: row.location,
        start_date: row.start_date,
        end_date: row.end_date,
        status: row.certification_status,
        rows: [],
      };
      groups.set(row.certification_id, group);
    }
    group.rows.push(row);
  }
  return Array.from(groups.values());
}

/**
 * "מי יוצא לאיזו הסמכה", by battalion. The rows arrive already filtered by the server: for a
 * battalion-scoped role to their own battalion (`lockedBattalionName` set — no other unit is
 * in the payload at all, so neither the screen nor the exports can show one), and for a
 * global role according to the selectable filter.
 *
 * The Excel and PDF exports are built from the same `rows`, so they mirror the screen.
 */
export function BattalionRosterReport({
  rows,
  battalions,
  battalionId,
  lockedBattalionName,
  from,
  to,
}: {
  rows: BattalionRosterReportRow[];
  battalions: Battalion[];
  battalionId?: number;
  lockedBattalionName?: string | null;
  from: string;
  to: string;
}) {
  const router = useRouter();
  const [draftFrom, setDraftFrom] = useState(from);
  const [draftTo, setDraftTo] = useState(to);
  const [exportingPdf, setExportingPdf] = useState(false);

  const groups = useMemo(() => groupByCertification(rows), [rows]);
  const showBattalionColumn = !lockedBattalionName;

  function apply(next: { battalion?: string; from?: string; to?: string }) {
    const query = new URLSearchParams();
    const battalion = next.battalion ?? (battalionId ? String(battalionId) : "");
    if (battalion) query.set("battalion", battalion);
    query.set("from", next.from ?? draftFrom);
    query.set("to", next.to ?? draftTo);
    router.push(`/reports/battalion-roster?${query.toString()}`);
  }

  /** Flat sheet — one line per soldier, the same columns the table shows. */
  function excelRows() {
    return rows.map((r) => ({
      הסמכה: r.certification_name,
      מיקום: r.location ?? "",
      "תאריך התחלה": r.start_date,
      "תאריך סיום": r.end_date ?? "",
      גדוד: r.battalion_name,
      "שם החייל": r.full_name,
      "מספר אישי": r.personal_number,
      "פלוגה / מסגרת": r.company_platoon ?? "",
      טלפון: r.phone ?? "",
      סטטוס: ROSTER_STATUS_LABELS[r.status],
      עתודה: r.is_reserve === 1 ? "כן" : "לא",
    }));
  }

  async function exportExcel() {
    const XLSX = await import("xlsx");
    const sheet = XLSX.utils.json_to_sheet(excelRows());
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, sheet, "חיילים לפי הסמכה");
    const wbout = XLSX.write(workbook, { bookType: "xlsx", type: "array" });
    downloadBlob(
      new Blob([wbout], { type: "application/octet-stream" }),
      "חיילים_לפי_הסמכה_וגדוד.xlsx"
    );
  }

  async function exportPdf() {
    setExportingPdf(true);
    try {
      await exportElementToPdf(CONTENT_ID, "חיילים_לפי_הסמכה_וגדוד.pdf");
    } catch (err) {
      console.error("PDF export failed", err);
      toast.error("ייצוא ה-PDF נכשל");
    } finally {
      setExportingPdf(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="no-print flex flex-wrap items-end gap-3 rounded-lg border p-3">
        <div className="space-y-1">
          <Label className="text-xs">גדוד</Label>
          {lockedBattalionName ? (
            // A scoped role has exactly one battalion and it is not a choice.
            <div className="h-9 flex items-center rounded-md border px-3 text-sm font-semibold bg-muted">
              {lockedBattalionName}
            </div>
          ) : (
            <select
              className="border rounded-md h-9 px-2 bg-background text-sm"
              value={battalionId ?? ""}
              onChange={(e) => apply({ battalion: e.target.value })}
            >
              <option value="">כל הגדודים</option>
              {battalions.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          )}
        </div>
        <div className="space-y-1">
          <Label className="text-xs">מתאריך</Label>
          <Input
            type="date"
            className="h-9"
            value={draftFrom}
            onChange={(e) => setDraftFrom(e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">עד תאריך</Label>
          <Input
            type="date"
            className="h-9"
            value={draftTo}
            onChange={(e) => setDraftTo(e.target.value)}
          />
        </div>
        <Button onClick={() => apply({ from: draftFrom, to: draftTo })}>עדכן</Button>
        <div className="flex gap-2 ms-auto">
          <Button onClick={exportPdf} disabled={exportingPdf || rows.length === 0}>
            {exportingPdf ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <FileDown className="size-4" />
            )}
            {exportingPdf ? "מכין PDF..." : "ייצוא ל-PDF"}
          </Button>
          <Button variant="outline" onClick={exportExcel} disabled={rows.length === 0}>
            <FileSpreadsheet className="size-4" />
            ייצוא ל-Excel
          </Button>
        </div>
      </div>

      <div id={CONTENT_ID} className="space-y-4 bg-background p-2">
        <div data-pdf-atomic className="flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo228.png" alt="חטיבה 228" className="h-10 w-auto" />
          <div>
            <h2 className="text-xl font-bold">חיילים לפי הסמכה וגדוד</h2>
            <p className="text-sm text-muted-foreground">
              {lockedBattalionName ??
                battalions.find((b) => b.id === battalionId)?.name ??
                "כל הגדודים"}{" "}
              · <DateRange start={from} end={to} /> · {rows.length} חיילים
            </p>
          </div>
        </div>

        {groups.map((group) => (
          <div key={group.certification_id} data-pdf-atomic className="rounded-md border p-3 space-y-2">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-bold">{group.certification_name}</span>
                {group.location && (
                  <span className="text-sm text-muted-foreground">· {group.location}</span>
                )}
                <span className="text-sm text-muted-foreground">
                  · <DateRange start={group.start_date} end={group.end_date} />
                </span>
              </div>
              <CertificationStatusBadge status={group.status} />
            </div>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>שם החייל</TableHead>
                    <TableHead>מספר אישי</TableHead>
                    {showBattalionColumn && <TableHead>גדוד</TableHead>}
                    <TableHead>פלוגה</TableHead>
                    <TableHead>טלפון</TableHead>
                    <TableHead>סטטוס</TableHead>
                    <TableHead>עתודה</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {group.rows.map((r, index) => (
                    <TableRow key={`${r.certification_id}-${r.personal_number}-${index}`}>
                      <TableCell className="font-medium">{r.full_name}</TableCell>
                      <TableCell>{r.personal_number}</TableCell>
                      {showBattalionColumn && (
                        <TableCell style={{ color: r.battalion_color }}>
                          {r.battalion_name}
                        </TableCell>
                      )}
                      <TableCell>{r.company_platoon ?? "-"}</TableCell>
                      <TableCell>{r.phone ?? "-"}</TableCell>
                      <TableCell>
                        <RosterStatusBadge status={r.status} />
                      </TableCell>
                      <TableCell>
                        {r.is_reserve === 1 ? (
                          <span className="text-xs font-semibold text-amber-700">עתודה</span>
                        ) : (
                          "-"
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        ))}

        {groups.length === 0 && (
          <p data-pdf-atomic className="text-muted-foreground">
            אין חיילים משובצים להסמכות בטווח ובסינון שנבחרו.
          </p>
        )}
      </div>
    </div>
  );
}
