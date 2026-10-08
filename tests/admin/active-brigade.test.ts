import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  canSwitchActiveBrigade,
  canSwitchBattalionView,
} from "@/lib/auth/permissions";
import { activeBrigadeSwitchSchema } from "@/lib/validation/brigade";
import { USER_ROLES, type AppUser, type UserRole, type UserStatus } from "@/lib/types";

/**
 * Super-admin brigade switching.
 *
 * The `active_role` cookie cannot appear in this file: the active brigade is resolved from
 * `users.active_brigade_id` on the authenticated row and from nowhere else.
 */

const { getCurrentUserMock } = vi.hoisted(() => ({ getCurrentUserMock: vi.fn() }));
vi.mock("@/lib/auth/user", () => ({ getCurrentUser: getCurrentUserMock }));

function user(role: UserRole, status: UserStatus = "approved"): AppUser {
  return {
    id: "u1",
    email: "u@example.com",
    full_name: null,
    role,
    status,
    battalion_id: role.endsWith("_battalion") ? 1 : null,
    requested_role_text: null,
    requested_battalion_text: null,
    active_brigade_id: null,
    approved_by: null,
    approved_at: null,
    created_at: "",
  };
}

const OTHER_ROLES = USER_ROLES.filter((r) => r !== "super_admin");

describe("canSwitchActiveBrigade", () => {
  it("is true for an approved super_admin", () => {
    expect(canSwitchActiveBrigade(user("super_admin"))).toBe(true);
  });

  it.each(OTHER_ROLES)("is false for %s", (role) => {
    expect(canSwitchActiveBrigade(user(role))).toBe(false);
  });

  it("is false for null and for an unapproved super_admin", () => {
    expect(canSwitchActiveBrigade(null)).toBe(false);
    expect(canSwitchActiveBrigade(user("super_admin", "pending"))).toBe(false);
    expect(canSwitchActiveBrigade(user("super_admin", "rejected"))).toBe(false);
  });

  /**
   * This is a ceiling, not a starting point.
   *
   * Brigade selection is a convenience for a super admin because they are authorised
   * everywhere; for anyone else it would be a security boundary enforced only by
   * application-level filtering, which is not sufficient. Widening this predicate before
   * row level security lands is the mistake this test exists to catch.
   */
  it("is a distinct predicate from the battalion view selector", () => {
    expect(canSwitchActiveBrigade).not.toBe(canSwitchBattalionView);
  });
});

describe("activeBrigadeSwitchSchema", () => {
  const uuid = "2ed8c903-7956-46ae-8e7a-7b7cb488a682";

  it("accepts a select with a uuid", () => {
    expect(
      activeBrigadeSwitchSchema.parse({ action: "select", brigade_public_id: uuid })
    ).toEqual({ action: "select", brigade_public_id: uuid });
  });

  // Clearing is a distinct action, not "select nothing": a super admin with no brigade
  // selected sees an explicit empty state, which is different from a broken one.
  it("accepts clear as its own action", () => {
    expect(activeBrigadeSwitchSchema.parse({ action: "clear" })).toEqual({ action: "clear" });
  });

  it.each(["1", "277", "not-a-uuid", ""])("rejects the non-uuid id %j", (id) => {
    expect(
      activeBrigadeSwitchSchema.safeParse({ action: "select", brigade_public_id: id }).success
    ).toBe(false);
  });

  it("rejects a select with no id, and unknown fields", () => {
    expect(activeBrigadeSwitchSchema.safeParse({ action: "select" }).success).toBe(false);
    expect(
      activeBrigadeSwitchSchema.safeParse({ action: "clear", brigade_public_id: uuid }).success
    ).toBe(false);
  });

  // There is no user id in the payload at all — the route writes the caller's own row and
  // has no variant that writes anyone else's.
  it("has no field that could name another user", () => {
    for (const body of [
      { action: "select", brigade_public_id: uuid, user_id: "someone-else" },
      { action: "clear", user_id: "someone-else" },
    ]) {
      expect(activeBrigadeSwitchSchema.safeParse(body).success).toBe(false);
    }
  });
});

describe("POST /api/admin/active-brigade", () => {
  beforeEach(() => getCurrentUserMock.mockReset());

  const post = async (body: unknown) => {
    const { POST } = await import("@/app/api/admin/active-brigade/route");
    return POST(
      new Request("http://localhost/api/admin/active-brigade", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
    );
  };

  it.each(OTHER_ROLES)("refuses %s with 403", async (role) => {
    getCurrentUserMock.mockResolvedValue(user(role));
    const res = await post({ action: "clear" });
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "forbidden" });
  });

  it("refuses an anonymous caller with 401", async () => {
    getCurrentUserMock.mockResolvedValue(null);
    expect((await post({ action: "clear" })).status).toBe(401);
  });

  it("refuses an unapproved super_admin", async () => {
    getCurrentUserMock.mockResolvedValue(user("super_admin", "pending"));
    expect((await post({ action: "clear" })).status).toBe(403);
  });

  // The refusal must not depend on the body being well formed, or an unauthorized caller
  // could tell a bad payload from a forbidden one.
  it("refuses before validating the body", async () => {
    getCurrentUserMock.mockResolvedValue(user("viewer"));
    expect((await post({ nonsense: true })).status).toBe(403);
  });
});
