"use client";

import { Button } from "@/components/ui/button";
import { FileDown } from "lucide-react";
import { downloadBlob } from "@/lib/utils/download-file";

export function ExportExcelButton({
  data,
  filename,
}: {
  data: Record<string, unknown>[];
  filename: string;
}) {
  async function handleExport() {
    const XLSX = await import("xlsx");
    const sheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, sheet, "Sheet1");
    const wbout = XLSX.write(workbook, { bookType: "xlsx", type: "array" });
    downloadBlob(new Blob([wbout], { type: "application/octet-stream" }), `${filename}.xlsx`);
  }

  return (
    <Button variant="outline" size="sm" onClick={handleExport} disabled={data.length === 0}>
      <FileDown className="size-4" />
      ייצוא לאקסל
    </Button>
  );
}
