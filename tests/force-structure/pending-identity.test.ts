import { describe, it, expect } from "vitest";
import { computeCompanyKpis, type RoleStatus } from "@/lib/force-structure/status";
import {
  gateFromUsability,
  PENDING_IDENTITY_MESSAGE,
  ASSIGNMENT_NOT_FOUND_MESSAGE,
} from "@/lib/force-structure/nominate";
import {
  assignmentCreateSchema,
  bankSoldierSchema,
  roleSeedSchema,
  REFERENCE_ONLY_FIELDS,
} from "@/lib/validation/force-structure";

describe("pending identity counts toward the establishment", () => {
  // One post manned by someone with no personal number, among nine ordinary ones.
  const statuses: RoleStatus[] = [
    ...Array<RoleStatus>(8).fill("ok"),
    "pending",
    "empty",
  ];

  it("includes a pending-identity post in the head-count, so the establishment does not shrink", () => {
    const kpis = computeCompanyKpis(statuses, 0);
    expect(kpis.establishment).toBe(10);
    expect(kpis.mannedPosts).toBe(9);
    expect(kpis.pendingIdentity).toBe(1);
    // The identity that matters: it is counted as manned, not quietly dropped.
    expect(kpis.manpowerGap).toBe(1);
    expect(kpis.establishment - kpis.mannedPosts).toBe(kpis.manpowerGap);
  });

  it("does not count it as a certification gap, because what they hold is unknown", () => {
    expect(computeCompanyKpis(statuses, 0).certificationGap).toBe(0);
  });

  it("still counts a pending-identity soldier in the bank toward מאויש", () => {
    const kpis = computeCompanyKpis(statuses, 3);
    expect(kpis.manned).toBe(12);
    expect(kpis.bank).toBe(3);
  });
});

describe("pending identity is rejected by the assignment gate", () => {
  it("refuses a pending-identity soldier with 409 and an explanatory message", () => {
    const gate = gateFromUsability({ ok: false, reason: "pending_identity" });
    expect(gate.allowed).toBe(false);
    // 409, not 400: the request is well formed, the record is not yet usable.
    expect(gate.status).toBe(409);
    expect(gate.error).toBe(PENDING_IDENTITY_MESSAGE);
    expect(gate.reason).toBe("pending_identity");
  });

  it("allows a soldier whose identity is complete", () => {
    const gate = gateFromUsability({ ok: true });
    expect(gate.allowed).toBe(true);
    expect(gate.error).toBeUndefined();
  });

  it("reports an assignment in another battalion as not found rather than forbidden", () => {
    // 404 keeps the existence of another battalion's records unobservable.
    const gate = gateFromUsability({ ok: false, reason: "not_found" });
    expect(gate.status).toBe(404);
    expect(gate.error).toBe(ASSIGNMENT_NOT_FOUND_MESSAGE);
  });
});

describe("§5.1 — the API cannot create a pending-identity soldier, only the importer can", () => {
  const valid = { role_id: 1, full_name: "ישראל ישראלי", personal_number: "8123456" };

  it("accepts a complete assignment", () => {
    expect(assignmentCreateSchema.safeParse(valid).success).toBe(true);
  });

  it("rejects an assignment with no personal number", () => {
    expect(assignmentCreateSchema.safeParse({ role_id: 1, full_name: "ישראל ישראלי" }).success).toBe(
      false
    );
  });

  it("rejects an empty personal number rather than storing a blank", () => {
    expect(assignmentCreateSchema.safeParse({ ...valid, personal_number: "" }).success).toBe(false);
  });

  it("rejects a placeholder-free bank soldier without a personal number", () => {
    expect(
      bankSoldierSchema.safeParse({ company_id: 1, full_name: "ישראל ישראלי" }).success
    ).toBe(false);
  });
});

describe("§5.1 — the assignment schema refuses every establishment field", () => {
  const valid = { role_id: 1, full_name: "ישראל ישראלי", personal_number: "8123456" };

  for (const field of REFERENCE_ONLY_FIELDS) {
    it(`rejects a payload carrying "${field}"`, () => {
      const result = assignmentCreateSchema.safeParse({ ...valid, [field]: "x" });
      expect(result.success).toBe(false);
    });
  }

  it("shares no keys between the assignment schema and the seeding schema beyond the post reference", () => {
    const assignmentKeys = new Set(Object.keys(assignmentCreateSchema.safeParse(valid).data ?? {}));
    const seed = roleSeedSchema.safeParse({
      company_id: 1,
      department: "מחלקת חוד",
      serial: "13",
      role_name: 'מ"מ',
    });
    expect(seed.success).toBe(true);
    const seedKeys = new Set(Object.keys(seed.data ?? {}));
    // The two write paths describe different things and must not overlap on any field
    // that could let one rewrite the other's data.
    for (const key of ["req1", "req2", "req3", "role_name", "serial"]) {
      expect(assignmentKeys.has(key)).toBe(false);
    }
    expect(seedKeys.has("full_name")).toBe(false);
    expect(seedKeys.has("personal_number")).toBe(false);
  });
});
