import { describe, expect, it } from "vitest";
import { canManageBattalions, canManageBrigades } from "@/lib/auth/permissions";
import {
  ADMIN_BATTALIONS_LINK,
  ADMIN_BRIGADES_LINK,
  navLinksFor,
  navLinksForView,
} from "@/lib/auth/nav";
import { USER_ROLES, type AppUser, type Role, type UserRole, type UserStatus } from "@/lib/types";

/**
 * Who may administer battalions, and who receives the nav link.
 *
 * Expressed against an AUTHENTICATED `AppUser`. The `active_role` cookie cannot appear in
 * this file — the target brigade of a battalion write is an authorization input, so it can
 * never come from a value a client sets.
 */

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

describe("canManageBattalions", () => {
  it("is true for an approved super_admin", () => {
    expect(canManageBattalions(user("super_admin"))).toBe(true);
  });

  it.each(OTHER_ROLES)("is false for %s", (role) => {
    expect(canManageBattalions(user(role))).toBe(false);
  });

  it("is false for null", () => {
    expect(canManageBattalions(null)).toBe(false);
  });

  it.each(["pending", "rejected"] as UserStatus[])("is false for a %s super_admin", (status) => {
    expect(canManageBattalions(user("super_admin", status))).toBe(false);
  });

  // Deliberately a separate predicate from canManageBrigades even though both resolve to
  // super_admin today: a brigade_admin will manage battalions but must never create a
  // brigade. If someone aliases them, this test says why not.
  it("is a distinct predicate from canManageBrigades", () => {
    expect(canManageBattalions).not.toBe(canManageBrigades);
  });
});

describe("the battalions admin nav link", () => {
  it("is present for a super_admin, alongside the other admin links", () => {
    const hrefs = navLinksFor(user("super_admin")).map((l) => l.href);
    expect(hrefs).toContain("/admin/permissions");
    expect(hrefs).toContain("/admin/brigades");
    expect(hrefs).toContain("/admin/battalions");
  });

  // Absent from the payload, not hidden with CSS.
  it.each(OTHER_ROLES)("is absent from the payload for %s", (role) => {
    expect(navLinksFor(user(role))).not.toContainEqual(ADMIN_BATTALIONS_LINK);
  });

  it("is absent for null and for an unapproved super_admin", () => {
    expect(navLinksFor(null)).not.toContainEqual(ADMIN_BATTALIONS_LINK);
    expect(navLinksFor(user("super_admin", "pending"))).not.toContainEqual(
      ADMIN_BATTALIONS_LINK
    );
  });

  it.each(OTHER_ROLES)("cannot be added by the active_role view for %s", (role) => {
    for (const view of ["brigade", "battalion:9308"] as Role[]) {
      expect(navLinksForView(user(role), view)).not.toContainEqual(ADMIN_BATTALIONS_LINK);
      expect(navLinksForView(user(role), view)).not.toContainEqual(ADMIN_BRIGADES_LINK);
    }
  });

  // A battalion-scoped user gets exactly their sections and no admin links at all.
  it("is absent for battalion-scoped roles even in their own view", () => {
    for (const role of ["viewer_battalion", "editor_battalion"] as UserRole[]) {
      const links = navLinksForView(user(role), "battalion:9308" as Role, "9308");
      expect(links).not.toContainEqual(ADMIN_BATTALIONS_LINK);
      expect(links.map((l) => l.href)).not.toContain("/admin/permissions");
    }
  });
});
