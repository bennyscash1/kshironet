"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { FileDown, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  TrainingDetailPrint,
  TRAINING_PRINT_ROOT_ID,
} from "@/components/trainings/training-detail-print";
import { exportPrintContainerToPdf } from "@/lib/utils/print-to-pdf";
import type { Battalion, Training, TrainingSession } from "@/lib/types";

/** Header action on the training detail page: exports this single training (header,
 * contact, notes and all day-grouped unit cards) to a client-side, Hebrew-RTL PDF by
 * capturing the off-screen <TrainingDetailPrint> container. */
export function TrainingPdfExport({
  training,
  sessions,
  battalions,
}: {
  training: Training;
  sessions: TrainingSession[];
  battalions: Battalion[];
}) {
  const [exporting, setExporting] = useState(false);

  const battalionsById = useMemo(
    () => new Map(battalions.map((b) => [b.id, b])),
    [battalions]
  );

  // Stamp the export date once per mount (memoized). Server renders in UTC and the
  // client in local time, so at a day boundary these can differ — the date node in the
  // print layout carries suppressHydrationWarning to absorb that benign mismatch.
  const now = useMemo(() => new Date(), []);
  const dd = String(now.getDate()).padStart(2, "0");
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const exportDateLabel = `${dd}/${mm}/${now.getFullYear()}`;
  const filenameDate = `${now.getFullYear()}-${mm}-${dd}`;

  async function handleExport() {
    setExporting(true);
    try {
      await exportPrintContainerToPdf(
        TRAINING_PRINT_ROOT_ID,
        `training-${training.id}-${filenameDate}.pdf`
      );
    } catch (err) {
      console.error("Training PDF export failed", err);
      toast.error("ייצוא ה-PDF נכשל");
    } finally {
      setExporting(false);
    }
  }

  return (
    <>
      <Button variant="outline" onClick={handleExport} disabled={exporting}>
        {exporting ? <Loader2 className="size-4 animate-spin" /> : <FileDown className="size-4" />}
        {exporting ? "מכין PDF..." : "ייצוא ל-PDF"}
      </Button>

      {/* Off-screen printable detail — captured on export. */}
      <TrainingDetailPrint
        training={training}
        sessions={sessions}
        battalionsById={battalionsById}
        exportDateLabel={exportDateLabel}
      />
    </>
  );
}
