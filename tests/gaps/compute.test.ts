import { describe, it, expect } from "vitest";
import {
  computeRequired,
  computeGapRow,
  sumGapRows,
  familyTotals,
  gapKpis,
  keyText,
  type GapRowNumbers,
} from "@/lib/gaps/compute";
import {
  GAP_ROWS_6228,
  UNIT_COUNTS_6228,
  UNIT_NAMES,
  EXPECTED_REQUIRED_VECTOR,
  EXPECTED_TOTALS,
  EXPECTED_FAMILY_GAPS,
  activeKeyOf,
  type FixtureFamily,
} from "@/tests/fixtures/battalion-6228";

/** The fixture rows reduced to their computed numbers, exactly as the app does it. */
function computedRows() {
  return GAP_ROWS_6228.map((row) => ({
    name: row.name,
    family: row.family,
    ...computeGapRow(computeRequired(activeKeyOf(row), UNIT_COUNTS_6228), row.held),
  }));
}

describe("§5.0 — the requirement is derived from the calculation key, never typed", () => {
  it("produces the expected requirement for all 19 certifications", () => {
    const rows = computedRows();
    // By name, so a reordering of the fixture cannot make this pass or fail spuriously.
    for (const [index, row] of rows.entries()) {
      expect(row.required, `${row.name} (row ${index + 1})`).toBe(
        GAP_ROWS_6228[index].expectedRequired
      );
    }
  });

  it("matches the documented requirement vector as a multiset", () => {
    const actual = computedRows().map((r) => r.required).sort((a, b) => a - b);
    expect(actual).toEqual([...EXPECTED_REQUIRED_VECTOR].sort((a, b) => a - b));
  });

  it("counts '2 per company' as 8 when the structure has 4 companies", () => {
    expect(computeRequired([{ qty: 2, unitType: "company" }], UNIT_COUNTS_6228)).toBe(8);
  });

  it("updates every requirement when the structure changes, with nothing re-entered", () => {
    const before = computeRequired([{ qty: 2, unitType: "company" }], UNIT_COUNTS_6228);
    // One more company in `roles` — no key was edited.
    const after = computeRequired(
      [{ qty: 2, unitType: "company" }],
      { ...UNIT_COUNTS_6228, company: 5 }
    );
    expect(before).toBe(8);
    expect(after).toBe(10);
  });

  it("switching source changes the requirement immediately (איבו: 40 ↔ 16)", () => {
    const ivo = GAP_ROWS_6228[0];
    expect(computeRequired(ivo.keys.operational!, UNIT_COUNTS_6228)).toBe(40);
    expect(computeRequired(ivo.keys.establishment!, UNIT_COUNTS_6228)).toBe(16);
  });

  it("treats an unknown unit type as 0 rather than poisoning the whole sum", () => {
    expect(
      computeRequired(
        [{ qty: 5, unitType: "team" }, { qty: 3, unitType: "does_not_exist" }],
        UNIT_COUNTS_6228
      )
    ).toBe(15);
  });

  it("renders the key in words so the number is never arbitrary", () => {
    expect(keyText(GAP_ROWS_6228[0].keys.operational!, UNIT_NAMES, UNIT_COUNTS_6228)).toBe(
      '12 לכל צוות ×3  +  4 לכל חפ"ק ×1'
    );
  });
});

describe("§5.5 — gap arithmetic on the real numbers", () => {
  it("totals 116, NOT the 111 that sum-then-subtract produces", () => {
    const rows = computedRows();
    const totals = sumGapRows(rows);

    expect(totals.gap).toBe(EXPECTED_TOTALS.gap);
    expect(totals.gap).toBe(116);

    // The bug this invariant exists to prevent, asserted explicitly so nobody
    // "simplifies" the view back into it.
    const naive = totals.required - totals.held;
    expect(naive).toBe(111);
    expect(totals.gap).not.toBe(naive);
    // The 5-seat difference is exactly the surplus.
    expect(totals.gap - totals.surplus).toBe(naive);
  });

  it("reports 90 certified of 201 required, with a surplus of 5", () => {
    const totals = sumGapRows(computedRows());
    expect(totals.held).toBe(EXPECTED_TOTALS.held);
    expect(totals.required).toBe(EXPECTED_TOTALS.required);
    expect(totals.surplus).toBe(EXPECTED_TOTALS.surplus);
  });

  it("does not let a surplus in one certification reduce another's gap", () => {
    const rows = computedRows();
    const flycart = rows.find((r) => r.name === "פלייקארט")!;
    const avata = rows.find((r) => r.name === "אווטה")!;
    const chamshosh = rows.find((r) => r.name === "חמשוש")!;

    expect(flycart.surplus).toBe(3);
    expect(flycart.gap).toBe(0);
    expect(avata.surplus).toBe(2);
    expect(avata.gap).toBe(0);
    // חמשוש sits in the SAME family as both surpluses and keeps its full gap.
    expect(chamshosh.gap).toBe(6);
  });

  it("gives איבו a gap of 26", () => {
    expect(computedRows().find((r) => r.name === "איבו")!.gap).toBe(26);
  });

  it("matches the cumulative gap of every family", () => {
    const rows = computedRows().map((r) => ({
      ...r,
      familyId: null as number | null,
    }));
    const byFamily = new Map<FixtureFamily, number>();
    for (const row of computedRows()) {
      byFamily.set(row.family, (byFamily.get(row.family) ?? 0) + row.gap);
    }
    for (const [family, expected] of Object.entries(EXPECTED_FAMILY_GAPS)) {
      expect(byFamily.get(family as FixtureFamily), family).toBe(expected);
    }
    // The families partition the whole battalion: nothing is counted twice or dropped.
    const familySum = [...byFamily.values()].reduce((a, b) => a + b, 0);
    expect(familySum).toBe(116);
    void rows;
  });

  it("calls an exactly-covered certification 'balanced', not 'surplus +0'", () => {
    expect(computeGapRow(6, 6).state).toBe("balanced");
    expect(computeGapRow(6, 6).surplus).toBe(0);
    expect(computeGapRow(6, 7).state).toBe("surplus");
    expect(computeGapRow(6, 5).state).toBe("gap");
  });

  it("groups by family without losing a row that has no family", () => {
    const rows: (GapRowNumbers & { familyId: number | null })[] = [
      { ...computeGapRow(10, 4), familyId: 1 },
      { ...computeGapRow(5, 1), familyId: 1 },
      { ...computeGapRow(3, 0), familyId: null },
    ];
    const totals = familyTotals(rows);
    expect(totals.get(1)!.gap).toBe(10);
    expect(totals.get(null)!.gap).toBe(3);
  });
});

describe("§3.1.4 — the four KPI cards", () => {
  it("computes coverage and the optimistic end-of-quarter projection", () => {
    const kpis = gapKpis(computedRows(), { closedThisQuarter: 22, allocatedOpen: 22 });
    expect(kpis.totalGap).toBe(116);
    expect(kpis.totalHeld).toBe(90);
    expect(kpis.totalRequired).toBe(201);
    expect(kpis.coveragePct).toBe(45);
    // 116 open seats less the 22 already allocated and awaiting names.
    expect(kpis.projectedEndOfQuarter).toBe(94);
  });

  it("keeps 'closed this quarter' null when the history is unavailable, so the card can be hidden rather than showing 0", () => {
    const kpis = gapKpis(computedRows(), { closedThisQuarter: null, allocatedOpen: 0 });
    expect(kpis.closedThisQuarter).toBeNull();
  });

  it("never projects a negative gap", () => {
    const kpis = gapKpis([computeGapRow(5, 4)], { closedThisQuarter: null, allocatedOpen: 99 });
    expect(kpis.projectedEndOfQuarter).toBe(0);
  });
});
