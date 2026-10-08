import { beforeEach, describe, expect, it, vi } from "vitest";
import { USER_ROLES, type AppUser, type UserRole, type UserStatus } from "@/lib/types";

/**
 * Every brigade route refuses a caller who is not an approved super_admin.
 *
 * The proxy already restricts /api/admin to super_admin, but its role-derivation block is
 * wrapped in try/catch and falls through on any error — so the handler's own gate is the
 * one that has to hold, and it is the one tested here.
 *
 * `getCurrentUser` is mocked because it reaches Supabase and Postgres; nothing else is.
 * A refused request never touches a repository, so no database is needed.
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

const NON_SUPER_ADMIN_ROLES = USER_ROLES.filter((r) => r !== "super_admin");

/** Every handler under /api/admin/brigades, with a request that would otherwise succeed. */
async function callAll() {
  const collection = await import("@/app/api/admin/brigades/route");
  const item = await import("@/app/api/admin/brigades/[id]/route");
  const params = Promise.resolve({ id: "1" });

  return {
    GET: await collection.GET(),
    POST: await collection.POST(
      new Request("http://localhost/api/admin/brigades", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "228-אלון" }),
      })
    ),
    PATCH_rename: await item.PATCH(
      new Request("http://localhost/api/admin/brigades/1", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "rename", name: "300-שקד" }),
      }),
      { params }
    ),
    PATCH_deactivate: await item.PATCH(
      new Request("http://localhost/api/admin/brigades/1", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "set_active", is_active: false }),
      }),
      { params: Promise.resolve({ id: "1" }) }
    ),
  };
}

beforeEach(() => {
  getCurrentUserMock.mockReset();
});

describe("brigade routes refuse non-super-admins", () => {
  it.each(NON_SUPER_ADMIN_ROLES)("answers 403 to every handler for %s", async (role) => {
    getCurrentUserMock.mockResolvedValue(user(role));
    const responses = await callAll();

    for (const [name, res] of Object.entries(responses)) {
      expect(res.status, `${name} must refuse ${role}`).toBe(403);
      expect(await res.json()).toEqual({ error: "forbidden" });
    }
  });

  it("answers 403 to a super_admin who is not approved", async () => {
    getCurrentUserMock.mockResolvedValue(user("super_admin", "pending"));
    for (const [name, res] of Object.entries(await callAll())) {
      expect(res.status, `${name} must refuse a pending super_admin`).toBe(403);
    }
  });

  it("answers 401 when there is no session at all", async () => {
    getCurrentUserMock.mockResolvedValue(null);
    for (const [name, res] of Object.entries(await callAll())) {
      expect(res.status, `${name} must reject an anonymous caller`).toBe(401);
      expect(await res.json()).toEqual({ error: "unauthorized" });
    }
  });

  // A refusal must not depend on the body being well formed, or a malformed payload from
  // an unauthorized caller would be answered 400 and leak that the route exists in a
  // different shape than "forbidden".
  it("refuses before validating the body", async () => {
    getCurrentUserMock.mockResolvedValue(user("viewer"));
    const { POST } = await import("@/app/api/admin/brigades/route");
    const res = await POST(
      new Request("http://localhost/api/admin/brigades", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nonsense: true }),
      })
    );
    expect(res.status).toBe(403);
  });
});
