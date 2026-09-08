"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { FileDown, FileSpreadsheet, Loader2 } from "lucide-react";
import { CERTIFICATION_STATUS_LABELS } from "@/lib/types";
import type { ExportCertification, ExportTraining } from "@/lib/db/repositories/export";
import { downloadBlob } from "@/lib/utils/download-file";
import { pdfCaptureOptions } from "@/lib/utils/pdf-capture";

const CONTENT_ID = "export-report-content";

export function ExportReportActions({
  certs,
  trainings = [],
  from,
  to,
}: {
  certs: ExportCertification[];
  trainings?: ExportTraining[];
  from: string;
  to: string;
}) {
  const [exportingPdf, setExportingPdf] = useState(false);

  async function exportPdf() {
    setExportingPdf(true);
    try {
      const element = document.getElementById(CONTENT_ID);
      if (!element) return;
      const html2canvas = (await import("html2canvas-pro")).default;
      const { jsPDF } = await import("jspdf");

      const blocks = Array.from(element.querySelectorAll<HTMLElement>("[data-pdf-atomic]"));
      if (blocks.length === 0) return;

      const pdf = new jsPDF("p", "mm", "a4");
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const margin = 8;
      const usableWidth = pageWidth - margin * 2;

      // Capture every block up front. Pagination needs each block's real captured
      // height: measuring the live DOM instead would describe the on-screen layout,
      // which on a phone is a tall narrow column and nothing like the pinned-width
      // capture — so the "keep a day header with its first card" lookahead would
      // reserve the wrong amount of room.
      const captured: { imgData: string; heightMm: number; groupStart: boolean }[] = [];
      for (const block of blocks) {
        const canvas = await html2canvas(block, pdfCaptureOptions());
        captured.push({
          imgData: canvas.toDataURL("image/jpeg", 0.85),
          heightMm: (canvas.height * usableWidth) / canvas.width,
          groupStart: block.dataset.pdfGroupStart === "true",
        });
      }

      let cursorY = margin;
      let isFirstOnPage = true;

      for (let i = 0; i < captured.length; i++) {
        const { imgData, heightMm, groupStart } = captured[i];

        let requiredHeight = heightMm;
        if (groupStart && captured[i + 1]) {
          requiredHeight += captured[i + 1].heightMm;
        }

        if (!isFirstOnPage && cursorY + requiredHeight > pageHeight - margin) {
          pdf.addPage();
          cursorY = margin;
          isFirstOnPage = true;
        }

        pdf.addImage(imgData, "JPEG", margin, cursorY, usableWidth, heightMm);
        cursorY += heightMm;
        isFirstOnPage = false;
      }

      pdf.save(`סיכום_הסמכות_${from}_${to}.pdf`);
    } catch (err) {
      console.error("PDF export failed", err);
      toast.error("ייצוא ה-PDF נכשל");
    } finally {
      setExportingPdf(false);
    }
  }

  async function exportExcel() {
    const XLSX = await import("xlsx");
    const rows: Record<string, string | number>[] = [];

    for (const cert of certs) {
      const baseInfo = {
        "תאריך התחלה": cert.start_date,
        "תאריך סיום": cert.end_date ?? "",
        הסמכה: cert.name,
        מיקום: cert.location ?? "",
        סטטוס: CERTIFICATION_STATUS_LABELS[cert.status],
      };

      if (cert.battalionGroups.every((g) => g.registered.length === 0) && cert.reserve.length === 0) {
        rows.push({ ...baseInfo, גדוד: "", שם: "", "מספר אישי": "", טלפון: "", פלוגה: "", סוג: "" });
        continue;
      }

      for (const group of cert.battalionGroups) {
        for (const s of group.registered) {
          rows.push({
            ...baseInfo,
            גדוד: group.battalion_name,
            שם: s.full_name,
            "מספר אישי": s.personal_number,
            טלפון: s.phone ?? "",
            פלוגה: s.company_platoon ?? "",
            סוג: "רגיל",
          });
        }
      }

      for (const s of cert.reserve) {
        rows.push({
          ...baseInfo,
          גדוד: s.battalion_name ?? "",
          שם: s.full_name,
          "מספר אישי": s.personal_number,
          טלפון: s.phone ?? "",
          פלוגה: s.company_platoon ?? "",
          סוג: "עתודה",
        });
      }
    }

    const workbook = XLSX.utils.book_new();
    const sheet = XLSX.utils.json_to_sheet(rows);
    XLSX.utils.book_append_sheet(workbook, sheet, "סיכום הסמכות");

    if (trainings.length > 0) {
      const trainingRows: Record<string, string | number>[] = [];
      for (const training of trainings) {
        const baseInfo = {
          הדרכה: training.name,
          תחום: training.domain ?? "",
        };
        if (training.sessions.length === 0) {
          trainingRows.push({
            תאריך: "",
            "שעת התחלה": "",
            "שעת סיום": "",
            ...baseInfo,
            גדוד: "",
            מיקום: "",
            מדריך: "",
            "טלפון מדריך": "",
          });
          continue;
        }
        for (const s of training.sessions) {
          trainingRows.push({
            תאריך: s.session_date,
            "שעת התחלה": s.start_time,
            "שעת סיום": s.end_time,
            ...baseInfo,
            גדוד: s.battalion_name,
            מיקום: s.location ?? "",
            מדריך: s.instructor_name ?? "",
            "טלפון מדריך": s.instructor_phone ?? "",
          });
        }
      }
      const trainingSheet = XLSX.utils.json_to_sheet(trainingRows);
      XLSX.utils.book_append_sheet(workbook, trainingSheet, "הדרכות");
    }

    const wbout = XLSX.write(workbook, { bookType: "xlsx", type: "array" });
    downloadBlob(
      new Blob([wbout], { type: "application/octet-stream" }),
      `סיכום_הסמכות_${from}_${to}.xlsx`
    );
  }

  return (
    <div className="no-print mb-4 flex gap-2 flex-wrap">
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

export { CONTENT_ID as EXPORT_REPORT_CONTENT_ID };
