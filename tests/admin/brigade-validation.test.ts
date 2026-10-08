import { describe, expect, it } from "vitest";
import {
  brigadeCreateSchema,
  brigadePatchSchema,
} from "@/lib/validation/brigade";
import { brigadeWriteFailure } from "@/lib/brigades/errors";

/** Helper: a Postgres driver error carries the SQLSTATE on `.code`. */
function pgError(code: string) {
  return Object.assign(new Error("relation \"brigades\" ... internal text"), { code });
}

describe("brigadeCreateSchema", () => {
  it("accepts a name and trims it", () => {
    const parsed = brigadeCreateSchema.parse({ name: "  228-אלון  " });
    expect(parsed.name).toBe("228-אלון");
  });

  // The name column is UNIQUE, so 'x' and 'x ' must not be storable as two brigades.
  it("trims before checking length, so a whitespace-only name is rejected", () => {
    const result = brigadeCreateSchema.safeParse({ name: "   " });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe("יש להזין שם חטיבה");
  });

  it("rejects an empty name with a Hebrew message", () => {
    const result = brigadeCreateSchema.safeParse({ name: "" });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe("יש להזין שם חטיבה");
  });

  /**
   * Parity with the database CHECK, which is `name ~ '[^[:space:]]'`.
   *
   * This exists because the first version of that constraint was
   * `length(btrim(name)) > 0`, and single-argument btrim() strips only SPACES — so a name
   * of tabs or newlines passed the database while Zod's .trim() (JavaScript semantics, all
   * whitespace) rejected it, leaving the backstop weaker than the validation in front of
   * it. Both sides must refuse every one of these.
   */
  it.each(["   ", "\t", "\n", "\t\n ", " "])(
    "rejects a name made only of whitespace (%j), matching the DB CHECK",
    (name) => {
      expect(brigadeCreateSchema.safeParse({ name }).success).toBe(false);
    }
  );

  it("rejects an over-long name with a Hebrew message", () => {
    const result = brigadeCreateSchema.safeParse({ name: "א".repeat(101) });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe("שם החטיבה ארוך מדי");
  });

  it("rejects a missing name", () => {
    expect(brigadeCreateSchema.safeParse({}).success).toBe(false);
  });

  // An unknown field means the client is confused about something; answering 400 says so
  // rather than silently ignoring it.
  it("rejects unknown fields rather than ignoring them", () => {
    const result = brigadeCreateSchema.safeParse({ name: "228", is_active: false });
    expect(result.success).toBe(false);
  });
});

describe("brigadePatchSchema", () => {
  it("accepts a rename", () => {
    expect(brigadePatchSchema.parse({ action: "rename", name: " 300-שקד " })).toEqual({
      action: "rename",
      name: "300-שקד",
    });
  });

  it("accepts set_active in both directions", () => {
    expect(
      brigadePatchSchema.parse({ action: "set_active", is_active: false })
    ).toEqual({ action: "set_active", is_active: false });
    expect(
      brigadePatchSchema.parse({ action: "set_active", is_active: true })
    ).toEqual({ action: "set_active", is_active: true });
  });

  it("rejects a whitespace-only rename", () => {
    const result = brigadePatchSchema.safeParse({ action: "rename", name: "  " });
    expect(result.success).toBe(false);
  });

  it("rejects an unknown action", () => {
    expect(
      brigadePatchSchema.safeParse({ action: "delete", id: 1 }).success
    ).toBe(false);
  });

  // There is no delete path at all — deactivation is a soft state change so a brigade's
  // data stays attributable.
  it("has no action that removes a brigade", () => {
    for (const action of ["delete", "remove", "destroy"]) {
      expect(brigadePatchSchema.safeParse({ action }).success).toBe(false);
    }
  });

  it("rejects fields belonging to the other action", () => {
    expect(
      brigadePatchSchema.safeParse({ action: "rename", name: "x", is_active: true })
        .success
    ).toBe(false);
  });
});

describe("brigadeWriteFailure", () => {
  it("maps the single-brigade guard to a Hebrew explanation", () => {
    const failure = brigadeWriteFailure(pgError("KS001"));
    expect(failure?.status).toBe(409);
    expect(failure?.message).toContain("בידוד הנתונים");
    // The point of mapping by SQLSTATE: no Postgres text reaches the client.
    expect(failure?.message).not.toContain("brigades");
    expect(failure?.message).not.toContain("relation");
  });

  it("maps a duplicate name to a Hebrew message", () => {
    const failure = brigadeWriteFailure(pgError("23505"));
    expect(failure?.status).toBe(409);
    expect(failure?.message).toBe("שם החטיבה כבר קיים במערכת");
  });

  it("maps a blank name to a Hebrew message", () => {
    expect(brigadeWriteFailure(pgError("23514"))?.message).toBe("שם החטיבה אינו תקין");
  });

  // An unpredicted failure must not be narrated to the browser; the caller answers a
  // generic 500 instead.
  it("returns null for anything it does not recognise", () => {
    expect(brigadeWriteFailure(pgError("42P01"))).toBeNull();
    expect(brigadeWriteFailure(new Error("boom"))).toBeNull();
    expect(brigadeWriteFailure(null)).toBeNull();
    expect(brigadeWriteFailure(undefined)).toBeNull();
    expect(brigadeWriteFailure("KS001")).toBeNull();
  });
});
