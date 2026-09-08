import {
  familyTotals,
  type GapRowNumbers,
} from "@/lib/gaps/compute";
import type { CertificationFamily, ComputedGapRow } from "@/lib/gaps/types";

/** Read-only establishment-gap strip shown beside the manual gaps table on דרישות גדודים. */
export function EstablishmentGapsWidget({
  rows,
  families,
}: {
  rows: (ComputedGapRow & GapRowNumbers & { familyId: number | null })[];
  families: CertificationFamily[];
}) {
  if (rows.length === 0) return null;
  const totals = familyTotals(rows);
  return (
    <div className="rounded-lg border bg-muted/40 p-3 space-y-2">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h3 className="text-sm font-bold">פערי תקן מחושבים · מקור: שניים לפנים</h3>
        <span className="text-xs font-semibold rounded-full px-2 py-0.5 border bg-accent">
          read-only · מקור נתונים שונה
        </span>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {families.map((f) => (
          <span key={f.id} className="text-xs rounded-full border px-2 py-0.5 bg-card">
            {f.name} ·{" "}
            <b className="tabular-nums" style={{ color: f.ink }}>
              {totals.get(f.id)?.gap ?? 0}
            </b>
          </span>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">
        המספרים אינם זהים לפער המוזן ידנית ואינם מחליפים אותו. התאמה בין שני המקורות — פאזה נפרדת.
      </p>
    </div>
  );
}
