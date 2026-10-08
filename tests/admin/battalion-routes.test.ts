import { beforeEach, describe, expect, it, vi } from "vitest";
import { USER_ROLES, type AppUser, type UserRole, type UserStatus } from "@/lib/types";

/**
 * Every battalion route refuses a caller who is not an approved super_admin.
 *
 * The proxy already restricts /api/admin, but its role-derivation block is wrapped in
 * try/catch and falls through on error — so the handler's own gate is the one that has to
 * hold, and it is the one tested here.
 *
 * Only `getCurrentUser` is mocked. A refused request never reaches a repository, so no
 * database is needed.
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

async function callAll() {
  const collection = await import("@/app/api/admin/battalions/route");
  const item = await import("@/app/api/admin/battalions/[id]/route");

  const json = (body: unknown) =>
    new Request("http://localhost/api/admin/battalions/1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

  return {
    GET: await collection.GET(
      new Request("http://localhost/api/admin/battalions?brigade_id=1")
    ),
    POST: await collection.POST(
      new Request("http://localhost/api/admin/battalions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          brigade_id: 1,
          code: "5030",
          name: "גדוד 5030",
          color_hex: "#C2410C",
        }),
      })
    ),
    PATCH_update: await item.PATCH(
      json({ action: "update", name: "x", color_hex: "#123456" }),
      { params: Promise.resolve({ id: "1" }) }
    ),
    PATCH_deactivate: await item.PATCH(json({ action: "set_active", is_active: false }), {
      params: Promise.resolve({ id: "1" }),
    }),
  };
}

beforeEach(() => {
  getCurrentUserMock.mockReset();
});

describe("battalion routes refuse non-super-admins", () => {
  it.each(OTHER_ROLES)("answers 403 to every handler for %s", async (role) => {
    getCurrentUserMock.mockResolvedValue(user(role));
    for (const [name, res] of Object.entries(await callAll())) {
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

  it("answers 401 when there is no session", async () => {
    getCurrentUserMock.mockResolvedValue(null);
    for (const [name, res] of Object.entries(await callAll())) {
      expect(res.status, `${name} must reject an anonymous caller`).toBe(401);
      expect(await res.json()).toEqual({ error: "unauthorized" });
    }
  });

  // A refusal must not depend on the body or query being well formed, or an unauthorized
  // caller could tell the routes apart by the shape of the error.
  it("refuses before validating the body or the brigade parameter", async () => {
    getCurrentUserMock.mockResolvedValue(user("editor"));
    const collection = await import("@/app/api/admin/battalions/route");

    // No brigade_id at all — would be a 400 for an authorized caller.
    expect(
      (await collection.GET(new Request("http://localhost/api/admin/battalions"))).status
    ).toBe(403);

    expect(
      (
        await collection.POST(
          new Request("http://localhost/api/admin/battalions", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ nonsense: true }),
          })
        )
      ).status
    ).toBe(403);
  });
});
