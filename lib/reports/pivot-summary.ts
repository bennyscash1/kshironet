import {
  countedPercent,
  emptyPivotTally,
  notCountedCount,
  rosterStatusLabel,
  PIVOT_COUNT_LABELS,
  type PivotCountTally,
} from "@/lib/reports/pivot-counting-rule";
import type { BattalionSoldierCount, PivotReport } from "@/lib/db/repositories/certification-pivot";

/**
 * Everything the פילוח הסמכות report DERIVES from one `PivotReport` — the header totals,
 * the chart's empty-state wording, and both Excel sheets.
 *
 * They live together, and are pure, so "the chart, the numbers and the export can never
 * disagree" is a property of the code rather than a promise: there is exactly one place
 * that turns per-battalion tallies into anything a person reads, and it is unit-tested.
 * Whether a single soldier counts is decided in lib/reports/pivot-counting-rule.ts.
 */

/** Header totals: the sum of the per-battalion tallies, never a re-count of the rows. */
export function sumTallies(rows: readonly BattalionSoldierCount[]): PivotCountTally {
  return rows.reduce<PivotCountTally>(
    (acc, r) => ({
      counted_count: acc.counted_count + r.counted_count,
      excluded_count: acc.excluded_count + r.excluded_count,
      unrecognized_count: acc.unrecognized_count + r.unrecognized_count,
      reserve_count: acc.reserve_count + r.reserve_count,
      total_count: acc.total_count + r.total_count,
    }),
    emptyPivotTally()
  );
}

/**
 * The denominator of "נספרו X מתוך Y": EVERY roster entry in scope — counted, excluded and
 * unrecognized alike — with reserve soldiers included, because this report applies the same
 * status test to them as to anyone else.
 */
export function denominatorOf(tally: PivotCountTally): number {
  return tally.total_count;
}

/**
 * The "לא נספרו" figure: the named exclusions plus anything unrecognized. Pairing it with
 * `counted_count` always reconciles to the denominator — that is the point of keeping
 * unrecognized rows in a bucket instead of dropping them.
 */
export { notCountedCount };

/** The sub-label under a battalion's bar, e.g. "לא נספרו 6 · עתודה 1 · לא מזוהים 2".
 * Unrecognized rows are named separately when present so they can be chased down. */
export function battalionSubLabel(tally: PivotCountTally): string {
  const parts = [`${PIVOT_COUNT_LABELS.notCounted} ${notCountedCount(tally)}`];
  if (tally.reserve_count > 0) {
    parts.push(`${PIVOT_COUNT_LABELS.reserve} ${tally.reserve_count}`);
  }
  if (tally.unrecognized_count > 0) {
    parts.push(`${PIVOT_COUNT_LABELS.unrecognized} ${tally.unrecognized_count}`);
  }
  return parts.join(" · ");
}

/**
 * The chart's Hebrew empty state. Two distinct facts get two distinct sentences: nothing
 * matched the filters at all, versus rows matched but none of them counts. Merging them
 * sends someone hunting for a data problem that does not exist.
 *
 * Returns null when there is something to draw.
 */
export function pivotEmptyChartMessage(
  rows: readonly BattalionSoldierCount[]
): string | null {
  if (rows.some((r) => r.counted_count > 0)) return null;
  return rows.some((r) => r.total_count > 0)
    ? "אף רשומה בבחירה הנוכחית אינה נספרת לפי כללי הדוח"
    : "אין חיילים בהסמכות ובטווח שנבחרו";
}

/** The "סיכום" sheet — one row per battalion, the same figures the chart draws. */
export function pivotSummarySheetRows(report: PivotReport): Record<string, string | number>[] {
  return report.rows.map((r) => ({
    גדוד: r.battalion_name,
    [PIVOT_COUNT_LABELS.counted]: r.counted_count,
    [PIVOT_COUNT_LABELS.notCounted]: notCountedCount(r),
    [PIVOT_COUNT_LABELS.unrecognized]: r.unrecognized_count,
    [PIVOT_COUNT_LABELS.reserve]: r.reserve_count,
    [PIVOT_COUNT_LABELS.total]: r.total_count,
    "אחוז נספרים": `${countedPercent(r)}%`,
  }));
}

/** The "פירוט חיילים" sheet — one row per soldier, carrying their real Hebrew status. */
export function pivotSoldierSheetRows(report: PivotReport): Record<string, string | number>[] {
  return report.soldiers.map((s) => ({
    גדוד: s.battalion_name,
    הסמכה: s.certification_name,
    שם: s.full_name,
    "מספר אישי": s.personal_number,
    סטטוס: rosterStatusLabel(s.status),
    נספר: s.outcome === "counted" ? "כן" : "לא",
    סוג: s.is_reserve === 1 ? PIVOT_COUNT_LABELS.reserve : "רגיל",
  }));
}
