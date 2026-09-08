/**
 * Gap arithmetic (spec §3.1).
 *
 * This exists in TypeScript as well as in the `v_certification_gaps` view because the
 * gaps tab recomputes live as the user edits a requirement key — a round trip per
 * keystroke would be both slow and pointless. The two implementations are checked against
 * each other by the test suite, so a divergence surfaces immediately rather than as two
 * screens disagreeing about the same number.
 *
 * THE INVARIANT THAT MATTERS (§0.3.6): the gap is clamped PER ROW and only then summed.
 * `SUM(required) − SUM(held)` over the reference battalion gives 111 instead of 116,
 * because five spare operators in two certifications cancel five genuinely missing seats
 * in others. A battalion cannot send a surplus drone operator to a medic's course, so the
 * two must never net off (§0.3.7).
 */

export type GapState = "gap" | "balanced" | "surplus";

/** One addend of a requirement: "qty per unit of this type". */
export interface RequirementKeyLine {
  qty: number;
  unitType: string;
}

/** Unit counts, keyed by `org_unit_types.code`. Counted from the force structure — never
 * typed by a user (§3.1.1). */
export type UnitCounts = Record<string, number>;

export interface GapRowNumbers {
  required: number;
  held: number;
  gap: number;
  surplus: number;
  state: GapState;
}

/**
 * required = Σ (qty × number of units of that type).
 *
 * An unknown unit type contributes 0 rather than NaN: a key referencing a unit the
 * structure does not have should under-report visibly, not poison the whole sum.
 */
export function computeRequired(lines: RequirementKeyLine[], unitCounts: UnitCounts): number {
  return lines.reduce((total, line) => total + line.qty * (unitCounts[line.unitType] ?? 0), 0);
}

/** The five numbers for one certification. The clamp lives here, at row level. */
export function computeGapRow(required: number, held: number): GapRowNumbers {
  const gap = Math.max(required - held, 0);
  const surplus = Math.max(held - required, 0);
  return {
    required,
    held,
    gap,
    surplus,
    // A certification with exactly enough people is "מאוזן", not "עודף +0" — the label
    // has to distinguish "balanced" from "we have spares".
    state: gap > 0 ? "gap" : surplus > 0 ? "surplus" : "balanced",
  };
}

export interface GapTotals {
  required: number;
  held: number;
  gap: number;
  surplus: number;
}

/**
 * Totals across rows.
 *
 * Note it sums the already-clamped `gap` and `surplus` of each row. There is deliberately
 * no code path here that subtracts one total from another.
 */
export function sumGapRows(rows: GapRowNumbers[]): GapTotals {
  return rows.reduce<GapTotals>(
    (totals, row) => ({
      required: totals.required + row.required,
      held: totals.held + row.held,
      gap: totals.gap + row.gap,
      surplus: totals.surplus + row.surplus,
    }),
    { required: 0, held: 0, gap: 0, surplus: 0 }
  );
}

/** Cumulative gap per family, for the family chips and section headers. */
export function familyTotals<T extends { familyId: number | null }>(
  rows: (T & GapRowNumbers)[]
): Map<number | null, GapTotals> {
  const byFamily = new Map<number | null, GapTotals>();
  for (const row of rows) {
    const current =
      byFamily.get(row.familyId) ?? { required: 0, held: 0, gap: 0, surplus: 0 };
    byFamily.set(row.familyId, {
      required: current.required + row.required,
      held: current.held + row.held,
      gap: current.gap + row.gap,
      surplus: current.surplus + row.surplus,
    });
  }
  return byFamily;
}

/**
 * The requirement key rendered as words, e.g. `12 לכל צוות ×3  +  4 לכל חפ"ק ×1`.
 *
 * Shown in the widget body so the number never looks arbitrary — the most common
 * objection to a computed figure is not that it is wrong but that nobody can see where it
 * came from.
 */
export function keyText(
  lines: RequirementKeyLine[],
  unitNames: Record<string, string>,
  unitCounts: UnitCounts
): string {
  if (lines.length === 0) return "לא הוגדר מפתח חישוב";
  return lines
    .map((line) => {
      const name = unitNames[line.unitType] ?? line.unitType;
      const count = unitCounts[line.unitType] ?? 0;
      return `${line.qty} לכל ${name} ×${count}`;
    })
    .join("  +  ");
}

/**
 * The four KPI numbers (§3.1.4).
 *
 * `closedThisQuarter` and `allocatedOpen` are passed in rather than derived: the first
 * needs history the database does not yet keep, and the card is hidden entirely when it
 * is null rather than showing a 0 that would read as "nothing closed".
 *
 * `projectedEndOfQuarter` is the optimistic forecast — what remains open if every
 * allocated seat is filled AND everybody passes. That assumption is stated in the card
 * text, because presented bare it looks like a prediction rather than a best case.
 */
export interface GapKpis {
  totalGap: number;
  totalHeld: number;
  totalRequired: number;
  totalSurplus: number;
  coveragePct: number;
  closedThisQuarter: number | null;
  projectedEndOfQuarter: number;
}

export function gapKpis(
  rows: GapRowNumbers[],
  options: { closedThisQuarter: number | null; allocatedOpen: number }
): GapKpis {
  const totals = sumGapRows(rows);
  return {
    totalGap: totals.gap,
    totalHeld: totals.held,
    totalRequired: totals.required,
    totalSurplus: totals.surplus,
    coveragePct: totals.required === 0 ? 0 : Math.round((totals.held / totals.required) * 100),
    closedThisQuarter: options.closedThisQuarter,
    projectedEndOfQuarter: Math.max(totals.gap - options.allocatedOpen, 0),
  };
}
