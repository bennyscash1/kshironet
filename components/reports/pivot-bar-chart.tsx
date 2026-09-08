import { battalionBarStyle } from "@/lib/utils/battalion-style";
import { PIVOT_COUNT_LABELS } from "@/lib/reports/pivot-counting-rule";
import { battalionSubLabel, pivotEmptyChartMessage } from "@/lib/reports/pivot-summary";
import type { BattalionSoldierCount } from "@/lib/db/repositories/certification-pivot";

/**
 * One bar per battalion. The bar's height is `counted_count` — straight from the same
 * per-battalion tallies the header and the Excel export read, so the chart cannot disagree
 * with the figures printed beside it.
 *
 * The rows arrive ordered by battalion code and are laid out with plain flex inside the
 * RTL document, so the first battalion sits rightmost. Colours are each battalion's own
 * `color_hex`. Neither is derived here.
 *
 * THE ALL-ZERO CASE IS A REAL STATE, NOT AN EDGE CASE: a selection where nothing counts
 * charts six zeros. The plot area therefore always draws its baseline, a zero renders as a
 * dashed stub so it reads as a measured zero rather than a missing bar, and an all-zero
 * chart says so in Hebrew instead of leaving a blank rectangle.
 */
export function PivotBarChart({ rows }: { rows: BattalionSoldierCount[] }) {
  const max = Math.max(...rows.map((r) => r.counted_count), 0);
  const emptyMessage = pivotEmptyChartMessage(rows);

  return (
    <div className="flex items-stretch gap-2 sm:gap-4 px-1 pt-2 relative">
      {emptyMessage && (
        // Overlaid rather than replacing the columns: the battalion labels and their
        // sub-labels stay on screen, which is the information that explains the zeros.
        // Bounded to the plot area's own height, so it can never stretch the card.
        <p className="absolute inset-x-0 top-2 h-44 flex items-center justify-center text-center text-xs text-muted-foreground px-4 pointer-events-none">
          {emptyMessage}
        </p>
      )}
      {rows.map((row) => {
        const heightPct = max > 0 ? (row.counted_count / max) * 100 : 0;
        const isZero = row.counted_count === 0;
        return (
          <div key={row.battalion_id} className="flex-1 min-w-0 flex flex-col items-center gap-1">
            {/* Fixed height, so the plot area is the same size whatever the data — and a
                border-bottom, so there is always a visible axis to read the bars against. */}
            <div className="w-full h-44 flex flex-col justify-end items-center gap-1 border-b-2 border-foreground/20">
              <span className="text-xs font-semibold tabular-nums">{row.counted_count}</span>
              {isZero ? (
                // A measured zero: a dashed stub in the battalion's own colour, clearly
                // different from both a real bar and from nothing at all.
                <div
                  className="w-full max-w-14 h-1.5 rounded-t-sm border-t-2 border-dashed"
                  style={{ borderColor: row.color_hex }}
                  title={`${row.battalion_name}: 0 ${PIVOT_COUNT_LABELS.counted}`}
                />
              ) : (
                <div
                  className="w-full max-w-14 rounded-t-md min-h-[3px] shadow-sm"
                  style={{ ...battalionBarStyle(row.color_hex), height: `${heightPct}%` }}
                  title={`${row.battalion_name}: ${row.counted_count} ${PIVOT_COUNT_LABELS.counted}`}
                />
              )}
            </div>
            <span className="w-full pt-1 text-center text-xs text-muted-foreground truncate">
              {row.battalion_name}
            </span>
            {/* Printed, not stacked: rows that did not count must stay visibly outside the
                bar. Built by the same helper the export uses. */}
            <span className="text-[0.65rem] text-muted-foreground text-center leading-tight tabular-nums">
              {battalionSubLabel(row)}
            </span>
          </div>
        );
      })}
    </div>
  );
}
