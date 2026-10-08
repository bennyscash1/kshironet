import { describe, expect, it } from "vitest";
import { canManageBrigades } from "@/lib/auth/permissions";
import { ADMIN_BRIGADES_LINK, navLinksFor, navLinksForView } from "@/lib/auth/nav";
import { USER_ROLES, type AppUser, type Role, type UserRole, type UserStatus } from "@/lib/types";

/**
 * Who may administer brigades, and who receives the nav link.
 *
 * Every case is expressed against an AUTHENTICATED `AppUser`. The `active_role` cookie
 * cannot appear in this file — a brigade is the tenant boundary itself, so the decision
 * must never come from a value a client can set.
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

const NON_SUPER_ADMIN_ROLES = USER_ROLES.filter((r) => r !== "super_admin");

describe("canManageBrigades", () => {
  it("is true for an approved super_admin", () => {
    expect(canManageBrigades(user("super_admin"))).toBe(true);
  });

  it.each(NON_SUPER_ADMIN_ROLES)("is false for %s", (role) => {
    expect(canManageBrigades(user(role))).toBe(false);
  });

  it("is false for null", () => {
    expect(canManageBrigades(null)).toBe(false);
  });

  // Creating a tenant is not something a not-yet-approved account may do, even if somebody
  // set its role directly in the database.
  it.each(["pending", "rejected"] as UserStatus[])(
    "is false for a %s super_admin",
    (status) => {
      expect(canManageBrigades(user("super_admin", status))).toBe(false);
    }
  );
});

describe("the brigades admin nav link", () => {
  it("is present for a super_admin", () => {
    expect(navLinksFor(user("super_admin"))).toContainEqual(ADMIN_BRIGADES_LINK);
  });

  // Absent from the payload, not hidden with CSS: a link a user may not follow must never
  // be serialised down to their browser in the first place.
  it.each(NON_SUPER_ADMIN_ROLES)("is absent from the payload for %s", (role) => {
    expect(navLinksFor(user(role))).not.toContainEqual(ADMIN_BRIGADES_LINK);
  });

  it("is absent for null and for an unapproved super_admin", () => {
    expect(navLinksFor(null)).not.toContainEqual(ADMIN_BRIGADES_LINK);
    expect(navLinksFor(user("super_admin", "pending"))).not.toContainEqual(
      ADMIN_BRIGADES_LINK
    );
  });

  // navLinksForView can only ever narrow navLinksFor, so the cookie cannot conjure the
  // link for a user whose row does not grant it.
  it.each(NON_SUPER_ADMIN_ROLES)(
    "cannot be added by the active_role view for %s",
    (role) => {
      for (const view of ["brigade", "battalion:9308"] as Role[]) {
        expect(navLinksForView(user(role), view)).not.toContainEqual(ADMIN_BRIGADES_LINK);
      }
    }
  );

  it("does not disturb the existing permissions link for a super_admin", () => {
    const hrefs = navLinksFor(user("super_admin")).map((l) => l.href);
    expect(hrefs).toContain("/admin/permissions");
    expect(hrefs).toContain("/admin/brigades");
  });
});
