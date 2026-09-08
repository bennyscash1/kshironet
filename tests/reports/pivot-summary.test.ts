import { describe, expect, it } from "vitest";
import {
  battalionSubLabel,
  denominatorOf,
  notCountedCount,
  pivotEmptyChartMessage,
  pivotSoldierSheetRows,
  pivotSummarySheetRows,
  sumTallies,
} from "@/lib/reports/pivot-summary";
import { countedPercent, PIVOT_COUNT_LABELS } from "@/lib/reports/pivot-counting-rule";
import type {
  BattalionSoldierCount,
  PivotReport,
  PivotSoldierRow,
} from "@/lib/db/repositories/certification-pivot";

const bn = (
  id: number,
  name: string,
  counted: number,
  excluded: number,
  unrecognized: number,
  reserve = 0
): BattalionSoldierCount => ({
  battalion_id: id,
  battalion_code: String(id),
  battalion_name: name,
  color_hex: "#123456",
  counted_count: counted,
  excluded_count: excluded,
  unrecognized_count: unrecognized,
  reserve_count: reserve,
  total_count: counted + excluded + unrecognized,
});

const soldier = (
  id: number,
  battalion: number,
  status: string,
  outcome: PivotSoldierRow["outcome"],
  isReserve = 0
): PivotSoldierRow => ({
  roster_entry_id: id,
  battalion_id: battalion,
  battalion_name: `גדוד ${battalion}`,
  color_hex: "#123456",
  certification_id: 1,
  certification_name: "האמר",
  full_name: `חייל ${id}`,
  personal_number: String(1000 + id),
  status,
  is_reserve: isReserve,
  outcome,
});

describe("header totals and the denominator", () => {
  it("sums the per-battalion tallies", () => {
    const t = sumTallies([bn(1, "א", 3, 1, 2, 1), bn(2, "ב", 0, 4, 0, 2)]);
    expect(t).toEqual({
      counted_count: 3,
      excluded_count: 5,
      unrecognized_count: 2,
      reserve_count: 3,
      total_count: 10,
    });
  });

  it("reconciles counted + not-counted to the denominator, per battalion and overall", () => {
    const rows = [bn(1, "א", 3, 1, 2, 1), bn(2, "ב", 0, 4, 0, 2), bn(3, "ג", 0, 0, 0)];
    for (const r of rows) {
      expect(r.counted_count + notCountedCount(r)).toBe(denominatorOf(r));
    }
    const t = sumTallies(rows);
    expect(t.counted_count + notCountedCount(t)).toBe(denominatorOf(t));
  });

  it("keeps reserve inside the denominator instead of carving it out", () => {
    // The change: reserve is subject to the same rule, so it is in both numerator and
    // denominator. A tally of 4 rows of which 2 are reserve still has a denominator of 4.
    const t = sumTallies([bn(1, "א", 3, 1, 0, 2)]);
    expect(denominatorOf(t)).toBe(4);
    expect(countedPercent(t)).toBe(75);
  });

  it("is empty-safe", () => {
    const t = sumTallies([]);
    expect(denominatorOf(t)).toBe(0);
    expect(countedPercent(t)).toBe(0);
  });
});

describe("battalion sub-label", () => {
  it("always names the not-counted figure", () => {
    expect(battalionSubLabel(bn(1, "א", 3, 2, 0))).toBe(`${PIVOT_COUNT_LABELS.notCounted} 2`);
  });

  it("adds reserve and unrecognized only when present", () => {
    expect(battalionSubLabel(bn(1, "א", 3, 2, 1, 4))).toBe(
      `${PIVOT_COUNT_LABELS.notCounted} 3 · ${PIVOT_COUNT_LABELS.reserve} 4 · ${PIVOT_COUNT_LABELS.unrecognized} 1`
    );
  });

  it("surfaces unrecognized rows rather than letting them disappear", () => {
    const label = battalionSubLabel(bn(1, "א", 0, 0, 5));
    expect(label).toContain(`${PIVOT_COUNT_LABELS.unrecognized} 5`);
    expect(label).toContain(`${PIVOT_COUNT_LABELS.notCounted} 5`);
  });

  it("renders for a battalion with no roster entries at all", () => {
    expect(battalionSubLabel(bn(9, "ריק", 0, 0, 0))).toBe(`${PIVOT_COUNT_LABELS.notCounted} 0`);
  });
});

describe("chart empty state", () => {
  it("stays silent when there is a bar to draw", () => {
    expect(pivotEmptyChartMessage([bn(1, "א", 1, 0, 0)])).toBeNull();
  });

  it("distinguishes 'nothing counts' from 'nothing matched'", () => {
    const nothingCounts = pivotEmptyChartMessage([bn(1, "א", 0, 6, 0)]);
    const nothingMatched = pivotEmptyChartMessage([bn(1, "א", 0, 0, 0)]);
    expect(nothingCounts).toBe("אף רשומה בבחירה הנוכחית אינה נספרת לפי כללי הדוח");
    expect(nothingMatched).toBe("אין חיילים בהסמכות ובטווח שנבחרו");
    expect(nothingCounts).not.toBe(nothingMatched);
  });

  it("says something in Hebrew for every all-zero shape", () => {
    for (const rows of [[], [bn(1, "א", 0, 0, 0)], [bn(1, "א", 0, 0, 3)]]) {
      const msg = pivotEmptyChartMessage(rows);
      expect(msg).toBeTruthy();
      expect(msg).toMatch(/[\u0590-\u05FF]/);
    }
  });
});

describe("export parity", () => {
  const report: PivotReport = {
    rows: [bn(1, "גדוד 5030", 2, 1, 0, 1), bn(2, 'גדס"מ', 1, 1, 1), bn(3, "גדוד 9308", 0, 0, 0)],
    soldiers: [
      soldier(1, 1, "registered", "counted"),
      soldier(2, 1, "passed", "counted", 1),
      soldier(3, 1, "failed", "excluded"),
      soldier(4, 2, "approved", "counted"),
      soldier(5, 2, "did_not_report", "excluded"),
      soldier(6, 2, "rejected", "unrecognized"),
    ],
  };

  it("carries exactly the on-screen per-battalion numbers", () => {
    const sheet = pivotSummarySheetRows(report);
    expect(sheet).toHaveLength(report.rows.length);
    sheet.forEach((r, i) => {
      const src = report.rows[i];
      expect(r["גדוד"]).toBe(src.battalion_name);
      expect(r[PIVOT_COUNT_LABELS.counted]).toBe(src.counted_count);
      expect(r[PIVOT_COUNT_LABELS.notCounted]).toBe(notCountedCount(src));
      expect(r[PIVOT_COUNT_LABELS.unrecognized]).toBe(src.unrecognized_count);
      expect(r[PIVOT_COUNT_LABELS.reserve]).toBe(src.reserve_count);
      expect(r[PIVOT_COUNT_LABELS.total]).toBe(denominatorOf(src));
    });
  });

  it("its counted column sums to the on-screen header total", () => {
    const header = sumTallies(report.rows);
    const exported = pivotSummarySheetRows(report).reduce(
      (sum, r) => sum + Number(r[PIVOT_COUNT_LABELS.counted]),
      0
    );
    expect(exported).toBe(header.counted_count);
  });

  it("reconciles per exported row: counted + not-counted === total", () => {
    for (const r of pivotSummarySheetRows(report)) {
      expect(
        Number(r[PIVOT_COUNT_LABELS.counted]) + Number(r[PIVOT_COUNT_LABELS.notCounted])
      ).toBe(Number(r[PIVOT_COUNT_LABELS.total]));
    }
  });

  it("marks a soldier counted in the export only when the screen does", () => {
    const detail = pivotSoldierSheetRows(report);
    detail.forEach((r, i) => {
      expect(r["נספר"]).toBe(report.soldiers[i].outcome === "counted" ? "כן" : "לא");
    });
    expect(detail.filter((r) => r["נספר"] === "כן")).toHaveLength(
      sumTallies(report.rows).counted_count
    );
  });

  it("counts a reserve soldier and still labels them עתודה", () => {
    // Soldier 2 is reserve with status `passed` — counted under the new rule.
    const r = pivotSoldierSheetRows(report).find((x) => x["שם"] === "חייל 2");
    expect(r?.["נספר"]).toBe("כן");
    expect(r?.["סוג"]).toBe(PIVOT_COUNT_LABELS.reserve);
  });

  it("never marks an excluded or unrecognized status as counted", () => {
    for (const r of pivotSoldierSheetRows(report)) {
      if (r["נספר"] === "לא") {
        expect(["לא עבר הסמכה", "לא התייצב", "לא השתתף", "נדחה", "ממתין לאישור"]).toContain(
          r["סטטוס"]
        );
      }
    }
  });
});
