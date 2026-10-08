import { describe, expect, it } from "vitest";
import {
  battalionCreateSchema,
  battalionPatchSchema,
} from "@/lib/validation/battalion";
import { battalionWriteFailure } from "@/lib/brigades/battalion-errors";

/**
 * Shaped like a node-pg error. `constraint` matters since migration 029: two different
 * unique constraints raise 23505 on this table and mean different things, so the mapper
 * tells them apart by name rather than treating every 23505 as a duplicate code.
 */
function pgError(code: string, constraint?: string) {
  return Object.assign(new Error('relation "battalions" ... internal text'), {
    code,
    constraint,
  });
}

const valid = {
  brigade_id: 1,
  code: "5030",
  name: "גדוד 5030",
  color_hex: "#C2410C",
};

describe("battalionCreateSchema", () => {
  it("accepts a valid battalion and trims text", () => {
    const parsed = battalionCreateSchema.parse({
      ...valid,
      code: "  5030  ",
      name: "  גדוד 5030  ",
    });
    expect(parsed.code).toBe("5030");
    expect(parsed.name).toBe("גדוד 5030");
  });

  // The existing codes are digits and lowercase latin ('5030', 'gdsm', 'hq').
  it.each(["5030", "gdsm", "hq", "A-1", "b_2"])("accepts the code %j", (code) => {
    expect(battalionCreateSchema.safeParse({ ...valid, code }).success).toBe(true);
  });

  // /battalions/[code] is a route, so a code has to be safe in a path segment.
  it.each(["גדוד", "50 30", "a/b", "a?b", "a#b", "a.b", ""])(
    "rejects the code %j",
    (code) => {
      expect(battalionCreateSchema.safeParse({ ...valid, code }).success).toBe(false);
    }
  );

  it("rejects a whitespace-only name", () => {
    const result = battalionCreateSchema.safeParse({ ...valid, name: "   " });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe("יש להזין שם גדוד");
  });

  it.each(["#fff", "red", "C2410C", "#C2410CC", ""])(
    "rejects the colour %j with the shared Hebrew message",
    (color_hex) => {
      const result = battalionCreateSchema.safeParse({ ...valid, color_hex });
      expect(result.success).toBe(false);
      expect(result.error?.issues[0]?.message).toBe("צבע לא תקין");
    }
  );

  it("accepts both cases of hex", () => {
    expect(battalionCreateSchema.safeParse({ ...valid, color_hex: "#c2410c" }).success).toBe(
      true
    );
  });

  it.each([0, -1, 1.5, "abc", null, undefined])(
    "rejects the brigade_id %j",
    (brigade_id) => {
      expect(battalionCreateSchema.safeParse({ ...valid, brigade_id }).success).toBe(false);
    }
  );

  it("rejects unknown fields rather than ignoring them", () => {
    expect(
      battalionCreateSchema.safeParse({ ...valid, is_active: 0 }).success
    ).toBe(false);
  });
});

describe("battalionPatchSchema", () => {
  it("accepts an update of name and colour", () => {
    expect(
      battalionPatchSchema.parse({
        action: "update",
        name: " גדוד 1 ",
        color_hex: "#123456",
      })
    ).toEqual({ action: "update", name: "גדוד 1", color_hex: "#123456" });
  });

  it("accepts set_active in both directions", () => {
    expect(battalionPatchSchema.parse({ action: "set_active", is_active: false })).toEqual({
      action: "set_active",
      is_active: false,
    });
    expect(battalionPatchSchema.parse({ action: "set_active", is_active: true })).toEqual({
      action: "set_active",
      is_active: true,
    });
  });

  /**
   * `code` is immutable, and this is the test that keeps it that way.
   *
   * Six unconstrained TEXT columns store `battalion:CODE` as an audit actor with no FK to
   * battalions — certifications.created_by_role, notifications.target_role,
   * status_history.changed_by_role, gap_nominations.created_by_role,
   * roster_admin_confirmations.confirmed_by_role and
   * force_structure_edit_snapshots.created_by_role — so nothing would flag a rename that
   * orphaned them. The format is already inconsistent (requests.ts:73 writes the id, not
   * the code), which makes after-the-fact repair impossible.
   */
  it("refuses to change the code, under any action", () => {
    expect(
      battalionPatchSchema.safeParse({
        action: "update",
        name: "x",
        color_hex: "#123456",
        code: "9999",
      }).success
    ).toBe(false);
    expect(battalionPatchSchema.safeParse({ action: "rename", code: "9999" }).success).toBe(
      false
    );
    expect(battalionPatchSchema.safeParse({ action: "set_code", code: "9999" }).success).toBe(
      false
    );
  });

  it("has no action that removes a battalion", () => {
    for (const action of ["delete", "remove", "destroy"]) {
      expect(battalionPatchSchema.safeParse({ action }).success).toBe(false);
    }
  });

  it("rejects fields belonging to the other action", () => {
    expect(
      battalionPatchSchema.safeParse({ action: "update", name: "x", is_active: true }).success
    ).toBe(false);
  });

  it("requires both name and colour on an update", () => {
    expect(battalionPatchSchema.safeParse({ action: "update", name: "x" }).success).toBe(
      false
    );
    expect(
      battalionPatchSchema.safeParse({ action: "update", color_hex: "#123456" }).success
    ).toBe(false);
  });
});

describe("battalionWriteFailure", () => {
  // Unique is on (brigade_id, code), so this means "taken in THIS brigade" — another
  // brigade may legitimately hold the same code.
  it("maps a duplicate code to a brigade-scoped Hebrew message", () => {
    const failure = battalionWriteFailure(pgError("23505", "battalions_brigade_code_key"));
    expect(failure?.status).toBe(409);
    expect(failure?.message).toBe("קוד גדוד זה כבר קיים בחטיבה");
  });

  it("maps a missing brigade FK to a Hebrew message", () => {
    expect(battalionWriteFailure(pgError("23503"))?.message).toBe("החטיבה שנבחרה אינה קיימת");
  });

  it("maps not-null and check violations", () => {
    expect(battalionWriteFailure(pgError("23502"))?.status).toBe(400);
    expect(battalionWriteFailure(pgError("23514"))?.status).toBe(400);
  });

  it("never leaks Postgres text", () => {
    const cases: [string, string | undefined][] = [
      ["23505", "battalions_brigade_code_key"],
      ["23505", "battalions_active_code_unique"],
      ["23503", undefined],
      ["23502", undefined],
      ["23514", undefined],
    ];
    for (const [code, constraint] of cases) {
      expect(battalionWriteFailure(pgError(code, constraint))?.message).not.toMatch(
        /battalions|relation|constraint/
      );
    }
  });

  it("returns null for anything it does not recognise", () => {
    expect(battalionWriteFailure(pgError("42P01"))).toBeNull();
    expect(battalionWriteFailure(new Error("boom"))).toBeNull();
    expect(battalionWriteFailure(null)).toBeNull();
  });
});
