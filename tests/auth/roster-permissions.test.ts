import { describe, expect, it } from "vitest";
import {
  auditRoleOf,
  canEdit,
  canEditBattalion,
  canManageAnyRoster,
  canManageCertifications,
  canManageRosterEntry,
  canManageUsers,
  canView,
  getScopedBattalionId,
} from "@/lib/auth/permissions";
import {
  isApiAllowedForScopedRole,
  isPathAllowedForScopedRole,
  isWriteAllowedForBattalionEditor,
} from "@/lib/auth/battalion-scope";
import type { AppUser, Role, UserRole, UserStatus } from "@/lib/types";

/**
 * The roster-write permission, and the guards around it.
 *
 * Every case is expressed against an AUTHENTICATED `AppUser`. The `active_role` cookie
 * cannot appear in this file, which is the point: the status route used to authorize from
 * it, and a test that could reach for it would not have caught that.
 */

const OWN = 1;
const OTHER = 2;

function user(role: UserRole, battalion_id: number | null, status: UserStatus = "approved"): AppUser {
  return {
    id: "u1",
    email: "u@example.com",
    full_name: null,
    role,
    status,
    battalion_id,
    requested_role_text: null,
    requested_battalion_text: null,
    approved_by: null,
    approved_at: null,
    created_at: "",
  };
}

const superAdmin = user("super_admin", null);
const brigadeEditor = user("editor", null);
const brigadeViewer = user("viewer", null);
const bnEditor = user("editor_battalion", OWN);
const bnViewer = user("viewer_battalion", OWN);

describe("canManageRosterEntry — the roster write gate", () => {
  it("lets a battalion editor manage their OWN battalion's entries", () => {
    expect(canManageRosterEntry(bnEditor, OWN)).toBe(true);
  });

  it("refuses a battalion editor another battalion's entries", () => {
    // The scoping decision: visible, never writable.
    expect(canManageRosterEntry(bnEditor, OTHER)).toBe(false);
  });

  it("keeps brigade HQ cross-battalion", () => {
    for (const u of [superAdmin, brigadeEditor]) {
      expect(canManageRosterEntry(u, OWN)).toBe(true);
      expect(canManageRosterEntry(u, OTHER)).toBe(true);
    }
  });

  it("refuses every viewer, global or scoped", () => {
    for (const u of [brigadeViewer, bnViewer]) {
      for (const bn of [OWN, OTHER]) expect(canManageRosterEntry(u, bn)).toBe(false);
    }
  });

  it("refuses an unapproved battalion editor", () => {
    expect(canManageRosterEntry(user("editor_battalion", OWN, "pending"), OWN)).toBe(false);
    expect(canManageRosterEntry(user("editor_battalion", OWN, "rejected"), OWN)).toBe(false);
  });

  it("refuses a battalion editor with no battalion assigned", () => {
    // battalion_id null must never match a real battalion id.
    expect(canManageRosterEntry(user("editor_battalion", null), OWN)).toBe(false);
  });

  it("refuses an anonymous caller", () => {
    expect(canManageRosterEntry(null, OWN)).toBe(false);
  });

  it("cannot drift from canEditBattalion — it IS that rule", () => {
    for (const u of [superAdmin, brigadeEditor, brigadeViewer, bnEditor, bnViewer]) {
      for (const bn of [OWN, OTHER]) {
        expect(canManageRosterEntry(u, bn)).toBe(canEditBattalion(u, bn));
      }
    }
  });
});

describe("canManageAnyRoster — the add affordance", () => {
  it("is true for a battalion editor and for brigade HQ", () => {
    for (const u of [superAdmin, brigadeEditor, bnEditor]) {
      expect(canManageAnyRoster(u)).toBe(true);
    }
  });

  it("is false for every viewer", () => {
    for (const u of [brigadeViewer, bnViewer, null]) expect(canManageAnyRoster(u)).toBe(false);
  });
});

describe("REGRESSION — nothing else moved", () => {
  it("leaves read-only battalion users with exactly nothing", () => {
    expect(canManageAnyRoster(bnViewer)).toBe(false);
    expect(canManageRosterEntry(bnViewer, OWN)).toBe(false);
    expect(canEdit(bnViewer)).toBe(false);
    expect(canEditBattalion(bnViewer, OWN)).toBe(false);
    expect(canManageUsers(bnViewer)).toBe(false);
    // ...but they can still read, and are still scoped.
    expect(canView(bnViewer)).toBe(true);
    expect(getScopedBattalionId(bnViewer)).toBe(OWN);
  });

  it("does not narrow brigade HQ anywhere", () => {
    for (const u of [superAdmin, brigadeEditor]) {
      expect(canEdit(u)).toBe(true);
      expect(canView(u)).toBe(true);
      expect(canEditBattalion(u, OTHER)).toBe(true);
      expect(getScopedBattalionId(u)).toBeNull();
    }
    expect(canManageUsers(superAdmin)).toBe(true);
    expect(canManageUsers(brigadeEditor)).toBe(false);
  });

  it("still refuses a battalion editor the create-certification gate", () => {
    // The page gate is `canManageCertifications(role) && canEdit(me)`. `canEdit` is false
    // for editor_battalion, so the second half denies them however the cookie is set.
    expect(canEdit(bnEditor)).toBe(false);
    for (const role of ["brigade", "battalion:9308"] as Role[]) {
      expect(canManageCertifications(role) && canEdit(bnEditor)).toBe(false);
    }
    // ...and brigade HQ keeps it.
    expect(canManageCertifications("brigade" as Role) && canEdit(brigadeEditor)).toBe(true);
  });
});

describe("proxy reach — scoped roles", () => {
  // These two assertions were inverted deliberately. An earlier change opened the brigade
  // certification pages so a battalion editor could reach the roster screens, which had the
  // side effect of showing them every OTHER battalion's soldiers on the same cycle. The
  // battalion route turned out to be fully self-contained — its panel carries its own add,
  // edit, delete and reserve controls and links nowhere under /certifications — so the
  // whole subtree is closed again and nothing is lost.
  it("closes the entire /certifications subtree", () => {
    for (const p of [
      "/certifications",
      "/certifications/125",
      "/certifications/new",
      "/certifications/125/edit",
      "/certifications/125/roster/new",
      "/certifications/125/roster/418/edit",
    ]) {
      expect(isPathAllowedForScopedRole(p)).toBe(false);
    }
  });

  it("keeps the battalion route they actually work in", () => {
    expect(isPathAllowedForScopedRole("/battalions/9308/certifications/125")).toBe(true);
  });

  it("closes the brigade roster endpoints and keeps the battalion ones", () => {
    const blocked: [string, string][] = [
      ["/api/certifications/125/roster", "POST"],
      ["/api/roster/418", "PATCH"],
      ["/api/roster/418", "DELETE"],
      ["/api/roster/418/status", "PATCH"],
    ];
    for (const [p, m] of blocked) {
      expect(isApiAllowedForScopedRole(p) && isWriteAllowedForBattalionEditor(p, m)).toBe(false);
    }
    const allowed: [string, string][] = [
      ["/api/battalions/1/certifications/125/roster", "POST"],
      ["/api/battalions/1/certifications/125/roster/418", "DELETE"],
    ];
    for (const [p, m] of allowed) {
      expect(isApiAllowedForScopedRole(p) && isWriteAllowedForBattalionEditor(p, m)).toBe(true);
    }
  });

  it("still refuses certification lifecycle and bank writes", () => {
    const denied: [string, string][] = [
      ["/api/certifications", "POST"],
      ["/api/certifications/125", "PATCH"],
      ["/api/certifications/125", "DELETE"],
      ["/api/templates", "POST"],
      ["/api/certification-gaps/3", "DELETE"],
    ];
    for (const [p, m] of denied) {
      expect(isApiAllowedForScopedRole(p) && isWriteAllowedForBattalionEditor(p, m)).toBe(false);
    }
  });

  it("does not open the roster collection to a GET-shaped path it should not match", () => {
    // Guards the regex against over-matching a nested resource.
    expect(isWriteAllowedForBattalionEditor("/api/roster/418/admin-confirmation", "PATCH")).toBe(true);
    expect(isWriteAllowedForBattalionEditor("/api/roster/abc", "DELETE")).toBe(false);
    expect(isWriteAllowedForBattalionEditor("/api/battalions/1/certifications/125/roster/9/x", "POST")).toBe(false);
  });
});

describe("audit role comes from the session", () => {
  it("stamps a scoped editor with their own battalion", () => {
    expect(auditRoleOf(bnEditor, "9308")).toBe("battalion:9308");
  });

  it("keeps the column's existing vocabulary for a global user", () => {
    // status_history already holds "brigade" and "battalion:CODE". Stamping "editor" here
    // would fragment a column the history view reads.
    expect(auditRoleOf(brigadeEditor)).toBe("brigade");
    expect(auditRoleOf(superAdmin)).toBe("brigade");
  });

  it("never returns an empty or cookie-derived value", () => {
    expect(auditRoleOf(null)).toBe("unknown");
  });
});
