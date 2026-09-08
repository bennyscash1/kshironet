import { describe, expect, it } from "vitest";
import {
  addToPivotTally,
  countedPercent,
  emptyPivotTally,
  isCountedRosterEntry,
  notCountedCount,
  pivotCountOutcomeOf,
  rosterStatusLabel,
  COUNTED_ROSTER_STATUSES,
  EXCLUDED_ROSTER_STATUSES,
  UNKNOWN_ROSTER_STATUS_LABEL,
} from "@/lib/reports/pivot-counting-rule";
import { ROSTER_STATUSES, ROSTER_STATUS_LABELS } from "@/lib/types";

const row = (status: unknown, is_reserve = 0) =>
  ({ status, is_reserve } as { status: string | null; is_reserve: number });

describe("the counting rule — allow-list", () => {
  it("counts exactly the four statuses the spec names (נקלט has no code)", () => {
    expect(COUNTED_ROSTER_STATUSES).toEqual(["approved", "registered", "passed", "participated"]);
    for (const s of COUNTED_ROSTER_STATUSES) expect(isCountedRosterEntry(row(s))).toBe(true);
  });

  it("maps each counted code to the Hebrew label the spec used", () => {
    expect(COUNTED_ROSTER_STATUSES.map((s) => ROSTER_STATUS_LABELS[s])).toEqual([
      "אושר",
      "נרשם",
      "עבר הסמכה",
      "השתתף",
    ]);
  });

  it("maps each excluded code to the Hebrew label the spec used", () => {
    expect(EXCLUDED_ROSTER_STATUSES.map((s) => ROSTER_STATUS_LABELS[s])).toEqual([
      "לא עבר הסמכה",
      "לא התייצב",
      "לא השתתף",
    ]);
  });

  it("names the three exclusions rather than letting them vanish", () => {
    for (const s of EXCLUDED_ROSTER_STATUSES) {
      expect(pivotCountOutcomeOf(row(s))).toBe("excluded");
    }
  });

  it("never defaults NULL, empty or legacy values into the counted bucket", () => {
    for (const bad of [null, undefined, "", "   ", "legacy_done", "PASSED", 1, {}]) {
      expect(pivotCountOutcomeOf(row(bad))).toBe("unrecognized");
      expect(isCountedRosterEntry(row(bad))).toBe(false);
    }
  });

  it("puts statuses named by neither list in the unrecognized bucket", () => {
    // pending_approval (ממתין לאישור) and rejected (נדחה) exist in the data and appear in
    // neither of the spec's lists, so they are surfaced rather than silently counted.
    expect(pivotCountOutcomeOf(row("pending_approval"))).toBe("unrecognized");
    expect(pivotCountOutcomeOf(row("rejected"))).toBe("unrecognized");
  });

  it("buckets every status the app defines, with none left ambiguous", () => {
    for (const s of ROSTER_STATUSES) {
      expect(["counted", "excluded", "unrecognized"]).toContain(pivotCountOutcomeOf(row(s)));
    }
  });

  it("tolerates surrounding whitespace on a stored value", () => {
    expect(pivotCountOutcomeOf(row("  passed  "))).toBe("counted");
  });
});

describe("reserve is subject to the same rule", () => {
  it("counts a reserve soldier with a counted status", () => {
    // The change: reserve no longer removes a soldier from this report's numerator.
    for (const s of COUNTED_ROSTER_STATUSES) {
      expect(pivotCountOutcomeOf(row(s, 1))).toBe("counted");
    }
  });

  it("does not count a reserve soldier with an excluded status", () => {
    for (const s of EXCLUDED_ROSTER_STATUSES) {
      expect(pivotCountOutcomeOf(row(s, 1))).toBe("excluded");
    }
  });

  it("gives a reserve and a regular soldier the same outcome for the same status", () => {
    for (const s of ROSTER_STATUSES) {
      expect(pivotCountOutcomeOf(row(s, 1))).toBe(pivotCountOutcomeOf(row(s, 0)));
    }
  });
});

describe("tallies and the denominator", () => {
  it("reconciles: counted + notCounted === total", () => {
    const t = emptyPivotTally();
    const rows: [string, boolean][] = [
      ["registered", false],
      ["passed", true],
      ["failed", false],
      ["rejected", false],
      ["participated", true],
    ];
    for (const [status, reserve] of rows) {
      addToPivotTally(t, pivotCountOutcomeOf(row(status, reserve ? 1 : 0)), reserve);
    }
    expect(t.counted_count).toBe(3);
    expect(t.excluded_count).toBe(1);
    expect(t.unrecognized_count).toBe(1);
    expect(t.total_count).toBe(5);
    expect(t.counted_count + notCountedCount(t)).toBe(t.total_count);
  });

  it("counts reserve as an overlapping fact, never as a fourth bucket", () => {
    const t = emptyPivotTally();
    addToPivotTally(t, "counted", true);
    expect(t.reserve_count).toBe(1);
    expect(t.counted_count).toBe(1);
    // Reserve is NOT summed with the buckets — doing so would double-count the row.
    expect(t.counted_count + t.excluded_count + t.unrecognized_count).toBe(t.total_count);
  });

  it("uses every row in scope as the percentage denominator, reserve included", () => {
    const t = {
      counted_count: 3,
      excluded_count: 1,
      unrecognized_count: 0,
      reserve_count: 2,
      total_count: 4,
    };
    expect(countedPercent(t)).toBe(75);
  });

  it("returns 0 rather than NaN with nothing in scope", () => {
    expect(countedPercent(emptyPivotTally())).toBe(0);
    expect(notCountedCount(emptyPivotTally())).toBe(0);
  });
});

describe("status labels", () => {
  it("uses the app's Hebrew label for every known status", () => {
    for (const s of ROSTER_STATUSES) expect(rosterStatusLabel(s)).toBe(ROSTER_STATUS_LABELS[s]);
  });

  it("falls back to a neutral label, never a counted-looking one", () => {
    for (const bad of [null, undefined, "", "legacy_value"]) {
      expect(rosterStatusLabel(bad)).toBe(UNKNOWN_ROSTER_STATUS_LABEL);
    }
  });
});
