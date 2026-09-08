import { describe, expect, it } from "vitest";
import { eligibilityOf, type EligibilityRow } from "@/lib/db/repositories/roster";
import {
  DRAFT_REFUSAL_MESSAGE,
  REGISTRATION_OPEN_STATUSES,
} from "@/lib/battalions/allocation-opportunities";
import {
  isApiAllowedForScopedRole,
  isPathAllowedForScopedRole,
  isWriteAllowedForBattalionEditor,
} from "@/lib/auth/battalion-scope";
import { CERTIFICATION_STATUSES } from "@/lib/types";

/**
 * Whether a battalion may register on a certification.
 *
 * `eligibilityOf` is the fold both `getBattalionQuotaUsage` (which renders the panel) and
 * `addBattalionRosterEntry` (which authorises the write) run over the same row, so these
 * cases pin the button and the endpoint at once.
 */

const row = (o: Partial<EligibilityRow>): EligibilityRow => ({
  status: "open",
  total_slots: null,
  quota_rows: 0,
  my_allocated: null,
  taken_everyone: 0,
  taken_mine: 0,
  reserve_mine: 0,
  registration_lock_date: null,
  registration_lock_hour: null,
  ...o,
});

describe("Mode A — no quota rows anywhere means open to all", () => {
  it("uses the certification's shared total_slots as the pool", () => {
    const v = eligibilityOf(row({ quota_rows: 0, total_slots: 3, taken_everyone: 1 }));
    expect(v.mode).toBe("open_to_all");
    expect(v.seats).toBe(3);
    expect(v.taken).toBe(1);
    expect(v.remaining).toBe(2);
    // The absence of a quota row is NOT "you were left out".
    expect(v.missingQuota).toBe(false);
  });

  it("counts EVERY battalion's soldiers against the shared pool", () => {
    // taken_mine is 0 — this battalion has nobody on it — yet the pool is full.
    const v = eligibilityOf(row({ quota_rows: 0, total_slots: 1, taken_everyone: 1, taken_mine: 0 }));
    expect(v.remaining).toBe(0);
  });

  it("treats NULL capacity as unlimited, never as full", () => {
    const v = eligibilityOf(row({ quota_rows: 0, total_slots: null, taken_everyone: 99 }));
    expect(v.seats).toBeNull();
    // NULL must propagate — a `?? 0` here turns unlimited into "no seats left".
    expect(v.remaining).toBeNull();
  });

  it("keeps every seat open when the only entries are עתודה", () => {
    // The SQL counts occupancy with is_reserve = 0, so reserve rows never reach taken_*.
    const v = eligibilityOf(row({ quota_rows: 0, total_slots: 2, taken_everyone: 0, reserve_mine: 2 }));
    expect(v.remaining).toBe(2);
  });
});

describe("Mode B — quota rows exist", () => {
  it("uses this battalion's own allocation, not the certification total", () => {
    const v = eligibilityOf(
      row({ quota_rows: 2, my_allocated: 2, total_slots: 9, taken_mine: 1, taken_everyone: 7 })
    );
    expect(v.mode).toBe("battalion_quota");
    expect(v.seats).toBe(2);
    // Another battalion's seven soldiers do not consume mine.
    expect(v.taken).toBe(1);
    expect(v.remaining).toBe(1);
  });

  it("flags a battalion with no allocation as not invited", () => {
    const v = eligibilityOf(row({ quota_rows: 2, my_allocated: null, total_slots: 9 }));
    expect(v.missingQuota).toBe(true);
    // It must NOT fall back to the certification total — that is the Mode A rule.
    expect(v.seats).toBeNull();
  });

  it("reports a full allocation as no seats left", () => {
    const v = eligibilityOf(row({ quota_rows: 1, my_allocated: 1, taken_mine: 1 }));
    expect(v.remaining).toBe(0);
    expect(v.missingQuota).toBe(false);
  });
});

describe("status gate — draft is brigade working state", () => {
  it("permits exactly the statuses discovered in the data", () => {
    expect(REGISTRATION_OPEN_STATUSES).toEqual(["open"]);
  });

  it("refuses every other status the schema defines", () => {
    for (const status of CERTIFICATION_STATUSES.filter((s) => s !== "open")) {
      expect(eligibilityOf(row({ status })).statusAllowsRegistration).toBe(false);
    }
  });

  it("refuses draft specifically, whatever the seats say", () => {
    const v = eligibilityOf(row({ status: "draft", quota_rows: 0, total_slots: 4, taken_everyone: 0 }));
    expect(v.statusAllowsRegistration).toBe(false);
    // Seats are still computed — the panel shows the numbers alongside the draft reason.
    expect(v.remaining).toBe(4);
  });

  it("has a Hebrew reason to show in place of the button", () => {
    expect(DRAFT_REFUSAL_MESSAGE).toBe("ההסמכה עדיין בטיוטה — טרם נפתחה להרשמה");
    expect(DRAFT_REFUSAL_MESSAGE).toMatch(/[֐-׿]/);
  });
});

describe("a missing certification is never registrable", () => {
  it("refuses rather than defaulting open", () => {
    const v = eligibilityOf(undefined);
    expect(v.statusAllowsRegistration).toBe(false);
    expect(v.missingQuota).toBe(true);
  });
});

describe("brigade certification pages are closed to scoped roles", () => {
  it("closes the whole /certifications subtree", () => {
    for (const p of [
      "/certifications",
      "/certifications/141",
      "/certifications/new",
      "/certifications/141/edit",
      "/certifications/141/roster/new",
      "/certifications/141/roster/9/edit",
    ]) {
      expect(isPathAllowedForScopedRole(p)).toBe(false);
    }
  });

  it("keeps the battalion route — the one they actually work in — open", () => {
    expect(isPathAllowedForScopedRole("/battalions/9308")).toBe(true);
    expect(isPathAllowedForScopedRole("/battalions/9308/certifications/141")).toBe(true);
  });

  it("closes the brigade roster APIs and keeps the battalion ones", () => {
    const blocked: [string, string][] = [
      ["/api/certifications/141/roster", "POST"],
      ["/api/roster/9", "PATCH"],
      ["/api/roster/9", "DELETE"],
      ["/api/roster/9/status", "PATCH"],
      ["/api/certifications", "POST"],
    ];
    for (const [p, m] of blocked) {
      expect(isApiAllowedForScopedRole(p) && isWriteAllowedForBattalionEditor(p, m)).toBe(false);
    }
    const allowed: [string, string][] = [
      ["/api/battalions/1/certifications/141/roster", "POST"],
      ["/api/battalions/1/certifications/141/roster/9", "DELETE"],
      ["/api/battalions/1/certifications/141/roster/9", "PATCH"],
    ];
    for (const [p, m] of allowed) {
      expect(isApiAllowedForScopedRole(p) && isWriteAllowedForBattalionEditor(p, m)).toBe(true);
    }
  });

  it("still allows the roster tracking sub-resources", () => {
    // Administrative confirmation and required documents were always theirs.
    expect(isWriteAllowedForBattalionEditor("/api/roster/9/admin-confirmation", "PATCH")).toBe(true);
    expect(isWriteAllowedForBattalionEditor("/api/roster/9/documents", "PUT")).toBe(true);
  });
});
