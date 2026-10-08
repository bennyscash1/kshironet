import { beforeEach, describe, expect, it, vi } from "vitest";
import { battalionWriteFailure } from "@/lib/brigades/battalion-errors";
import { BATTALION_CODE_UNAVAILABLE } from "@/lib/validation/battalion";
import type { AppUser } from "@/lib/types";

/**
 * T.3 — a duplicate active battalion code surfaces as a Hebrew field-level validation error
 * on `code`, not as an unhandled exception, and the text names no brigade.
 */

/** Shaped like a node-pg error: SQLSTATE on `code`, index name on `constraint`. */
const pgError = (code: string, constraint?: string) =>
  Object.assign(new Error('duplicate key value violates unique constraint "…"'), {
    code,
    constraint,
  });

describe("battalionWriteFailure tells the two unique constraints apart", () => {
  it("maps the army-wide index to a field-level error on code", () => {
    const failure = battalionWriteFailure(
      pgError("23505", "battalions_active_code_unique")
    );
    expect(failure?.field).toBe("code");
    expect(failure?.message).toBe(BATTALION_CODE_UNAVAILABLE);
    expect(failure?.status).toBe(400);
  });

  /**
   * 1.7 — the message must not reveal WHERE the code is in use.
   *
   * A caller who cannot see another brigade must not be able to learn its contents by
   * probing codes against this form, so the text names no brigade, no index, no constraint,
   * and does not confirm that any row exists anywhere.
   */
  it("reveals nothing about the brigade holding the code", () => {
    const { message } = battalionWriteFailure(
      pgError("23505", "battalions_active_code_unique")
    )!;

    expect(message).not.toMatch(/חטיבה|חטיבת|brigade/i);
    expect(message).not.toMatch(/battalions_|_key|_unique|constraint|index/i);
    expect(message).not.toMatch(/\d{3,}/); // no brigade id or battalion number
    expect(message).not.toMatch(/כבר קיים|בשימוש/); // does not confirm a row exists
  });

  it("keeps the per-brigade message for the per-brigade constraint", () => {
    const failure = battalionWriteFailure(pgError("23505", "battalions_brigade_code_key"));
    expect(failure?.message).toBe("קוד גדוד זה כבר קיים בחטיבה");
    expect(failure?.field).toBeUndefined();
  });

  // 1.8 — catch only these. An unrecognised unique violation must not be relabelled as a
  // duplicate code; it falls through to the caller's generic 500.
  it("does not swallow other unique violations", () => {
    expect(battalionWriteFailure(pgError("23505", "users_email_key"))).toBeNull();
    expect(battalionWriteFailure(pgError("23505", undefined))).toBeNull();
    expect(battalionWriteFailure(pgError("23505", "brigades_name_key"))).toBeNull();
  });

  it("still maps the other battalion write failures", () => {
    expect(battalionWriteFailure(pgError("23503"))?.status).toBe(400);
    expect(battalionWriteFailure(pgError("23502"))?.status).toBe(400);
    expect(battalionWriteFailure(pgError("23514"))?.status).toBe(400);
    expect(battalionWriteFailure(new Error("boom"))).toBeNull();
  });
});

const { getCurrentUserMock, createBattalionMock } = vi.hoisted(() => ({
  getCurrentUserMock: vi.fn(),
  createBattalionMock: vi.fn(),
}));

vi.mock("@/lib/auth/user", () => ({ getCurrentUser: getCurrentUserMock }));
vi.mock("@/lib/db/repositories/battalions", () => ({
  createBattalion: createBattalionMock,
  listAllBattalionsForBrigade: vi.fn().mockResolvedValue([]),
}));
vi.mock("@/lib/db/repositories/brigades", () => ({
  getBrigadeById: vi.fn().mockResolvedValue({ id: 1, name: "b", is_active: 1 }),
}));

const superAdmin: AppUser = {
  id: "u1",
  email: "u@example.com",
  full_name: null,
  role: "super_admin",
  status: "approved",
  battalion_id: null,
  requested_role_text: null,
  requested_battalion_text: null,
  active_brigade_id: 1,
  approved_by: null,
  approved_at: null,
  created_at: "",
};

describe("POST /api/admin/battalions on a duplicate active code", () => {
  beforeEach(() => {
    getCurrentUserMock.mockReset();
    createBattalionMock.mockReset();
    getCurrentUserMock.mockResolvedValue(superAdmin);
  });

  const post = async () => {
    const { POST } = await import("@/app/api/admin/battalions/route");
    return POST(
      new Request("http://localhost/api/admin/battalions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          brigade_id: 1,
          code: "9308",
          name: "גדוד 9308",
          color_hex: "#C2410C",
        }),
      })
    );
  };

  it("answers a field-level validation error rather than an unhandled exception", async () => {
    createBattalionMock.mockRejectedValue(
      pgError("23505", "battalions_active_code_unique")
    );

    const res = await post();
    expect(res.status).toBe(400);

    const body = await res.json();
    // The same Zod-flatten shape every other validation failure uses, so the client renders
    // it against the field with no special handling.
    expect(body.error.fieldErrors.code).toEqual([BATTALION_CODE_UNAVAILABLE]);
    expect(body.error.formErrors).toEqual([]);
  });

  it("leaks no brigade identifier and no SQL in the response body", async () => {
    createBattalionMock.mockRejectedValue(
      pgError("23505", "battalions_active_code_unique")
    );

    const raw = JSON.stringify(await (await post()).json());
    expect(raw).not.toMatch(/battalions_|constraint|duplicate key|unique/i);
    expect(raw).not.toMatch(/חטיבה/);
  });

  // An unrecognised failure must not be narrated to the browser.
  it("answers a generic Hebrew 500 for an unrecognised unique violation", async () => {
    createBattalionMock.mockRejectedValue(pgError("23505", "some_other_key"));

    const res = await post();
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe("יצירת הגדוד נכשלה");
  });
});
