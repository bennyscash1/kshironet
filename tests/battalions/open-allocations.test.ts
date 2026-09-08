import { describe, expect, it } from "vitest";
import {
  compareOpenAllocations,
  isAwaitingNames,
  isOpenAllocation,
  openAllocationsOf,
  remainingAllocatedSlots,
  urgencyBand,
} from "@/lib/battalions/open-allocations";

describe("open allocations (green square + slot tasks share this)", () => {
  it("remaining is allocated minus registered, floored at 0", () => {
    expect(remainingAllocatedSlots(8, 4)).toBe(4);
    expect(remainingAllocatedSlots(8, 8)).toBe(0);
    expect(remainingAllocatedSlots(8, 10)).toBe(0);
  });

  it("remaining is null with no quota, not 0", () => {
    // A battalion on a certification purely because it has soldiers there has no
    // allocation to run down. Returning 0 would render it as a full quota.
    expect(remainingAllocatedSlots(null, 0)).toBeNull();
    expect(remainingAllocatedSlots(null, 3)).toBeNull();
  });

  it("a certification with no quota is never an open allocation", () => {
    // The open-allocation cards mean "seats the brigade gave you that need names". With no
    // quota there are no such seats, however many soldiers are registered.
    expect(isOpenAllocation({ allocated_slots: null, registered: 0, status: "open" })).toBe(false);
    expect(isOpenAllocation({ allocated_slots: null, registered: 2, status: "open" })).toBe(false);
  });

  it("hides a fully named quota and a cancelled cycle", () => {
    expect(
      isOpenAllocation({ allocated_slots: 4, registered: 4, status: "open" })
    ).toBe(false);
    expect(
      isOpenAllocation({ allocated_slots: 4, registered: 1, status: "cancelled" })
    ).toBe(false);
    expect(
      isOpenAllocation({ allocated_slots: 4, registered: 1, status: "open" })
    ).toBe(true);
  });

  it("sorts urgent-first then by open seats", () => {
    const rows = [
      { daysToClose: 12, remaining: 6 },
      { daysToClose: 2, remaining: 1 },
      { daysToClose: 2, remaining: 5 },
    ];
    expect([...rows].sort(compareOpenAllocations).map((r) => r.remaining)).toEqual([5, 1, 6]);
  });

  it("openAllocationsOf narrows away the null quota it just filtered out", () => {
    const rows = [
      { allocated_slots: null, registered: 1, status: "open" as const, remaining: null, daysToClose: 1 },
      { allocated_slots: 4, registered: 1, status: "open" as const, remaining: 3, daysToClose: 5 },
    ];
    const out = openAllocationsOf(rows);
    expect(out).toHaveLength(1);
    // Non-null at the type level AND at runtime — the narrowing is only sound because the
    // filter rejects a null quota.
    expect(out[0].allocated_slots).toBe(4);
    expect(out[0].remaining).toBe(3);
  });

  it("isAwaitingNames is the amber state: a quota with nobody on it", () => {
    expect(isAwaitingNames({ has_quota: true, registered: 0 })).toBe(true);
    expect(isAwaitingNames({ has_quota: true, registered: 1 })).toBe(false);
    // No quota is not "awaiting names" — nothing was allocated to fill.
    expect(isAwaitingNames({ has_quota: false, registered: 0 })).toBe(false);
  });

  it("urgency bands match the mockup", () => {
    expect(urgencyBand(3)).toBe("hot");
    expect(urgencyBand(9)).toBe("warm");
    expect(urgencyBand(20)).toBe("cool");
  });

  it("openAllocationsOf filters closed quotas then sorts like the square", () => {
    const rows = [
      { allocated_slots: 4, registered: 4, status: "open" as const, remaining: 0, daysToClose: 1 },
      { allocated_slots: 4, registered: 1, status: "open" as const, remaining: 3, daysToClose: 10 },
      { allocated_slots: 4, registered: 0, status: "open" as const, remaining: 4, daysToClose: 2 },
    ];
    expect(openAllocationsOf(rows).map((r) => r.remaining)).toEqual([4, 3]);
  });
});
