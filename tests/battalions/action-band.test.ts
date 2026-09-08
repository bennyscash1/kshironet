import { describe, expect, it } from "vitest";
import { summarizeActionBand, UNLIMITED_SEATS } from "@/lib/battalions/action-band";

/**
 * The band summary, which is where a NULL capacity is most likely to be quietly turned
 * into a number. Pure — no database, no clock.
 */
describe("action band summary", () => {
  it("counts both groups as one figure", () => {
    const s = summarizeActionBand([{ remaining: 3 }, { remaining: 1 }], [{ remaining: 2 }]);
    expect(s.certCount).toBe(3);
    expect(s.slotsLabel).toBe("6");
  });

  it("is empty only when both groups are", () => {
    expect(summarizeActionBand([], []).empty).toBe(true);
    expect(summarizeActionBand([{ remaining: 1 }], []).empty).toBe(false);
    expect(summarizeActionBand([], [{ remaining: null }]).empty).toBe(false);
  });

  it("renders unlimited capacity as a word, never as a count", () => {
    // The failure this guards is a `?? 0`, which reads as "no seats left" — the exact
    // opposite of unlimited — and a unit acts on it.
    const s = summarizeActionBand([], [{ remaining: null }]);
    expect(s.slotsLabel).toBe(UNLIMITED_SEATS);
    expect(s.slotsLabel).not.toMatch(/\d/);
  });

  it("keeps both kinds visible when they are mixed", () => {
    // Neither may swallow the other: "4" would hide the unlimited cycle and a bare
    // "ללא הגבלה" would hide four real seats that are about to close.
    const s = summarizeActionBand([{ remaining: 4 }], [{ remaining: null }]);
    expect(s.slotsLabel).toBe(`4 + ${UNLIMITED_SEATS}`);
  });

  it("never emits a negative or a zero-padded total", () => {
    expect(summarizeActionBand([], [{ remaining: 0 }]).slotsLabel).toBe("0");
    expect(summarizeActionBand([], []).slotsLabel).toBe("0");
  });
});
