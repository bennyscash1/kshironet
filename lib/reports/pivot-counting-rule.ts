import { ROSTER_STATUS_LABELS, ROSTER_STATUSES, type RosterStatus } from "@/lib/types";

/**
 * WHICH ROSTER ENTRIES THE "פילוח הסמכות" REPORT COUNTS. This report's rule and nobody
 * else's.
 *
 * IT IS DELIBERATELY NOT THE SYSTEM-WIDE RULE. `ACTIVE_ROSTER_STATUSES` in
 * lib/utils/slots.ts still decides who occupies a seat for capacity and quota math, the
 * gaps mechanism still decrements only on an explicit `passed`, and neither imports
 * anything from here. The module lives under lib/reports/ and is named for the report on
 * purpose: a generic name in a generic folder is how a report-specific rule ends up
 * silently governing capacity math.
 *
 * THREE BUCKETS, NOT TWO. A row is `counted`, `excluded` (one of the three statuses the
 * spec names as non-counting), or `unrecognized` — anything else, including NULL, empty
 * string and legacy values. Splitting "excluded" from "unrecognized" is what stops an
 * unknown value from vanishing between the numerator and the denominator: the report can
 * show it and someone can go and look at it.
 *
 * THE ALLOW-LIST NEVER DEFAULTS OPEN. Unrecognized is never counted.
 */

/**
 * Counted. Spec's Hebrew, resolved against ROSTER_STATUS_LABELS:
 *   אושר → approved · נרשם → registered · עבר הסמכה → passed · השתתף → participated
 *
 * The spec's fifth counted label, "נקלט", HAS NO STATUS IN THIS SYSTEM — no code carries
 * that label and no row stores such a value (`roster_entries.status` holds these English
 * codes, and migration 023 constrains it to exactly the nine of them). It is therefore not
 * representable and is left out rather than added as a string that could never match.
 * Whatever intake step it refers to is already covered by `registered`/`approved`, both of
 * which count.
 */
export const COUNTED_ROSTER_STATUSES: RosterStatus[] = [
  "approved",
  "registered",
  "passed",
  "participated",
];

/**
 * Not counted, and NAMED so the report can say so out loud:
 *   לא עבר הסמכה → failed · לא התייצב → did_not_report · לא השתתף → did_not_participate
 */
export const EXCLUDED_ROSTER_STATUSES: RosterStatus[] = [
  "failed",
  "did_not_report",
  "did_not_participate",
];

/** What one roster row contributes. */
export type PivotCountOutcome = "counted" | "excluded" | "unrecognized";

/** The fields the decision needs. Narrow, so any row shape can be passed. */
export interface RosterCountFields {
  status: string | null | undefined;
  /** 1 for a עתודה row. Read for reporting only — see `pivotCountOutcomeOf`. */
  is_reserve?: number | null | undefined;
}

function normalize(status: string | null | undefined): string | null {
  if (typeof status !== "string") return null;
  const trimmed = status.trim();
  return trimmed === "" ? null : trimmed;
}

/**
 * Buckets one roster row.
 *
 * `is_reserve` IS NOT CONSULTED. Under this report's rule a עתודה soldier is subject to
 * exactly the same status test as anyone else: reserve with a counted status is counted,
 * reserve with an excluded status is not. Reserve is still tallied alongside, but as an
 * overlapping fact about the rows rather than a bucket of its own.
 */
export function pivotCountOutcomeOf(entry: RosterCountFields): PivotCountOutcome {
  const status = normalize(entry.status);
  if (status === null) return "unrecognized";
  if ((COUNTED_ROSTER_STATUSES as string[]).includes(status)) return "counted";
  if ((EXCLUDED_ROSTER_STATUSES as string[]).includes(status)) return "excluded";
  return "unrecognized";
}

/** True only for a row on the counted allow-list. */
export function isCountedRosterEntry(entry: RosterCountFields): boolean {
  return pivotCountOutcomeOf(entry) === "counted";
}

/** Shown for a status the app has no label for. Neutral — never reads as a success. */
export const UNKNOWN_ROSTER_STATUS_LABEL = "סטטוס לא ידוע";

/** The Hebrew label for a roster status, falling back to a neutral "unknown". */
export function rosterStatusLabel(status: string | null | undefined): string {
  const trimmed = normalize(status);
  if (trimmed === null) return UNKNOWN_ROSTER_STATUS_LABEL;
  return (ROSTER_STATUSES as string[]).includes(trimmed)
    ? ROSTER_STATUS_LABELS[trimmed as RosterStatus]
    : UNKNOWN_ROSTER_STATUS_LABEL;
}

/**
 * The report's vocabulary, in one place so the screen and the Excel export word it alike.
 *
 * "נספרו" / "לא נספרו" and NOT "השלימו" / "לא השלימו": the counted set now includes
 * in-progress statuses (נרשם, אושר), so a label promising completion would contradict the
 * number printed next to it.
 */
export const PIVOT_COUNT_LABELS = {
  counted: "נספרו",
  notCounted: "לא נספרו",
  unrecognized: "לא מזוהים",
  reserve: "עתודה",
  total: "סה״כ רשומות",
} as const;

/**
 * Per-battalion tallies.
 *
 * THE DENOMINATOR is `total_count` = counted + excluded + unrecognized: every roster entry
 * in scope, WITH reserve soldiers included. The three buckets are disjoint and exhaustive,
 * so nothing can fall out between the numerator and the denominator.
 *
 * `reserve_count` is the one figure that is NOT part of that partition — it counts rows
 * with `is_reserve = 1` whatever bucket they landed in, and therefore overlaps all three.
 * It is reported beside the others, never summed with them.
 */
export interface PivotCountTally {
  counted_count: number;
  /** One of EXCLUDED_ROSTER_STATUSES. */
  excluded_count: number;
  /** Not counted and not a named exclusion: NULL, empty, or an unknown/legacy value. */
  unrecognized_count: number;
  /** Overlapping: rows with is_reserve = 1, in any bucket. */
  reserve_count: number;
  /** counted + excluded + unrecognized. The denominator. */
  total_count: number;
}

export function emptyPivotTally(): PivotCountTally {
  return {
    counted_count: 0,
    excluded_count: 0,
    unrecognized_count: 0,
    reserve_count: 0,
    total_count: 0,
  };
}

/** Adds one row to a tally, in place. `isReserve` is tracked alongside the bucket. */
export function addToPivotTally(
  tally: PivotCountTally,
  outcome: PivotCountOutcome,
  isReserve: boolean
): void {
  tally.total_count += 1;
  if (outcome === "counted") tally.counted_count += 1;
  else if (outcome === "excluded") tally.excluded_count += 1;
  else tally.unrecognized_count += 1;
  if (isReserve) tally.reserve_count += 1;
}

/** Everything the denominator holds that did not count. Reconciles by construction:
 * counted + notCounted === total. */
export function notCountedCount(tally: PivotCountTally): number {
  return tally.excluded_count + tally.unrecognized_count;
}

/**
 * Counted as a percentage of EVERY roster entry in scope — reserve included, excluded and
 * unrecognized rows in the denominator. Returns 0 when there is nothing to divide by, so
 * the UI never renders NaN.
 */
export function countedPercent(tally: PivotCountTally): number {
  return tally.total_count === 0
    ? 0
    : Math.round((tally.counted_count / tally.total_count) * 100);
}
