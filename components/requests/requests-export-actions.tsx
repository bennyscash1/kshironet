"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { FileDown, FileSpreadsheet, Loader2 } from "lucide-react";
import {
  REQUEST_STATUS_LABELS,
  URGENCY_LABELS,
  type Battalion,
  type BattalionRequest,
  type Urgency,
  type RequestStatus,
} from "@/lib/types";
import type { GapBattalionGroup, GapRequestTypeGroup } from "@/lib/gaps/groupings";
import { useGapTab } from "@/components/requests/gap-groups-tabs";
import { downloadBlob } from "@/lib/utils/download-file";
import { exportElementToPdf } from "@/lib/utils/export-pdf";

const CONTENT_ID = "requests-page-content";

export function RequestsExportActions({
  byBattalion,
  byRequestType,
  requests,
  battalionMap,
}: {
  byBattalion: GapBattalionGroup[];
  byRequestType: GapRequestTypeGroup[];
  requests: BattalionRequest[];
  battalionMap: Map<number, Battalion>;
}) {
  const [exportingPdf, setExportingPdf] = useState(false);
  // Both exports follow the visible grouping. The PDF gets it for free — it captures the
  // live DOM, and Radix keeps only the active panel mounted — while the Excel sheet has to
  // pick its rows from the tab explicitly.
  const { tab } = useGapTab();

  async function exportPdf() {
    setExportingPdf(true);
    try {
      await exportElementToPdf(CONTENT_ID, "פערי_הסמכות_ודרישות_גדודים.pdf");
    } catch (err) {
      console.error("PDF export failed", err);
      toast.error("ייצוא ה-PDF נכשל");
    } finally {
      setExportingPdf(false);
    }
  }

  async function exportExcel() {
    const XLSX = await import("xlsx");
    const workbook = XLSX.utils.book_new();

    // One flat row per (גדוד × סוג דרישה) pair, ordered the way the active tab reads:
    // battalion-major on "לפי גדוד", type-major on "לפי סוג דרישה".
    const gapSheetRows =
      tab === "battalion"
        ? byBattalion.flatMap((group) =>
            group.entries.map((entry) => ({
              גדוד: group.battalion_name,
              "סוג דרישה": entry.request_type_name,
              כמות: entry.quantity,
              "סה״כ לגדוד": group.total,
            }))
          )
        : byRequestType.flatMap((group) =>
            group.entries.map((entry) => ({
              "סוג דרישה": group.request_type_name,
              גדוד: entry.battalion_name,
              כמות: entry.quantity,
              "סה״כ לסוג": group.total,
            }))
          );
    const gapSheet = XLSX.utils.json_to_sheet(gapSheetRows);
    XLSX.utils.book_append_sheet(
      workbook,
      gapSheet,
      tab === "battalion" ? "לפי גדוד" : "לפי סוג דרישה"
    );

    const requestRows = requests.map((r) => ({
      גדוד: battalionMap.get(r.battalion_id)?.name ?? "",
      "סוג הסמכה מבוקש": r.requested_cert_type,
      כמות: r.quantity_needed,
      דחיפות: URGENCY_LABELS[r.urgency as Urgency],
      סטטוס: REQUEST_STATUS_LABELS[r.status as RequestStatus],
      "נפתחה בתאריך": new Date(r.created_at).toLocaleDateString("he-IL"),
    }));
    const requestSheet = XLSX.utils.json_to_sheet(requestRows);
    XLSX.utils.book_append_sheet(workbook, requestSheet, "דרישות גדודים");

    const wbout = XLSX.write(workbook, { bookType: "xlsx", type: "array" });
    downloadBlob(
      new Blob([wbout], { type: "application/octet-stream" }),
      "פערי_הסמכות_ודרישות_גדודים.xlsx"
    );
  }

  return (
    <div className="no-print flex gap-2 flex-wrap">
      <Button onClick={exportPdf} disabled={exportingPdf}>
        {exportingPdf ? <Loader2 className="size-4 animate-spin" /> : <FileDown className="size-4" />}
        {exportingPdf ? "מכין PDF..." : "ייצוא ל-PDF"}
      </Button>
      <Button variant="outline" onClick={exportExcel}>
        <FileSpreadsheet className="size-4" />
        ייצוא ל-Excel
      </Button>
    </div>
  );
}

export { CONTENT_ID as REQUESTS_PAGE_CONTENT_ID };
