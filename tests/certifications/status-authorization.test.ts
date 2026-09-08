import { describe, expect, it } from "vitest";
import {
  canEdit,
  canManageCertificationStatus,
  canManageCertifications,
  canManageRosterEntry,
  auditRoleOf,
} from "@/lib/auth/permissions";
import {
  VALID_TRANSITIONS,
  allowedTransitionsFrom,
  OPEN_FOR_REGISTRATION,
} from "@/lib/certifications/transitions";
import { CERTIFICATION_STATUSES } from "@/lib/types";
import type { AppUser, Role, UserRole, UserStatus } from "@/lib/types";

/**
 * The certification status gate.
 *
 * Every case runs against an AUTHENTICATED `AppUser`. The `active_role` cookie is absent
 * from this file on purpose: the route used to authorize from it, and a test that could
 * reach for it would not have caught that.
 */

function user(role: UserRole, battalion_id: number | null, status: UserStatus = "approved"): AppUser {
  return {
    id: "u1", email: "u@example.com", full_name: null, role, status, battalion_id,
    requested_role_text: null, requested_battalion_text: null,
    approved_by: null, approved_at: null, created_at: "",
  };
}

const superAdmin = user("super_admin", null);
const brigadeEditor = user("editor", null);
const brigadeViewer = user("viewer", null);
const bnEditor = user("editor_battalion", 1);
const bnViewer = user("viewer_battalion", 1);

describe("canManageCertificationStatus", () => {
  it("allows the global write roles", () => {
    expect(canManageCertificationStatus(superAdmin)).toBe(true);
    expect(canManageCertificationStatus(brigadeEditor)).toBe(true);
  });

  it("refuses every viewer and every battalion-scoped role", () => {
    for (const u of [brigadeViewer, bnEditor, bnViewer, null]) {
      expect(canManageCertificationStatus(u)).toBe(false);
    }
  });

  it("refuses an unapproved user", () => {
    expect(canManageCertificationStatus(user("editor", null, "pending"))).toBe(false);
    expect(canManageCertificationStatus(user("super_admin", null, "rejected"))).toBe(false);
  });

  it("IGNORES the active_role axis entirely — the lockout fix", () => {
    // The old gate was canManageCertifications(cookieRole), so a brigade user previewing a
    // battalion was refused their own capability. The new predicate takes no Role at all,
    // so there is no cookie value that can change these answers.
    for (const cookie of ["brigade", "battalion:9308", "battalion:5030"] as Role[]) {
      expect(canManageCertifications(cookie)).toBe(cookie === "brigade"); // the old gate
      // ...while the new one is unmoved by any of them:
      expect(canManageCertificationStatus(superAdmin)).toBe(true);
      expect(canManageCertificationStatus(brigadeEditor)).toBe(true);
      expect(canManageCertificationStatus(bnEditor)).toBe(false);
    }
  });

  it("matches the old gate's effective authorization in the cookie-correct case", () => {
    // With the cookie on "brigade" — the only case the old route accepted — the UI gate was
    // canManageCertifications(role) && canEdit(me). The new predicate must equal that, so
    // no brigade capability is narrowed and no new role is admitted.
    const brigade = "brigade" as Role;
    for (const u of [superAdmin, brigadeEditor, brigadeViewer, bnEditor, bnViewer]) {
      expect(canManageCertificationStatus(u)).toBe(canManageCertifications(brigade) && canEdit(u));
    }
  });

  it("is the certification gate, NOT the roster gate", () => {
    // A battalion editor manages roster entries for their own battalion but never a
    // certification's lifecycle.
    expect(canManageRosterEntry(bnEditor, 1)).toBe(true);
    expect(canManageCertificationStatus(bnEditor)).toBe(false);
  });

  it("keeps create-certification blocked for a battalion editor", () => {
    // Untouched route; asserted here so a future widening of the status gate cannot leak.
    expect(canEdit(bnEditor)).toBe(false);
  });
});

describe("audit vocabulary is unchanged", () => {
  it("still stamps 'brigade' for a global user", () => {
    // status_history holds "brigade" on all 184 certification rows; the value is now
    // session-derived rather than copied out of the cookie, but identical.
    expect(auditRoleOf(superAdmin)).toBe("brigade");
    expect(auditRoleOf(brigadeEditor)).toBe("brigade");
  });
});

describe("the de-duplicated transition map", () => {
  it("is byte-for-byte the server definition it replaced", () => {
    expect(VALID_TRANSITIONS).toEqual({
      draft: ["open", "cancelled"],
      open: ["full", "closed", "in_progress", "cancelled"],
      full: ["open", "closed", "in_progress", "cancelled"],
      closed: ["open", "in_progress", "cancelled"],
      in_progress: ["completed", "cancelled"],
      completed: [],
      cancelled: [],
    });
  });

  it("covers every status the schema defines", () => {
    for (const s of CERTIFICATION_STATUSES) {
      expect(VALID_TRANSITIONS[s]).toBeDefined();
    }
  });

  it("keeps draft -> open legal and terminal states terminal", () => {
    expect(allowedTransitionsFrom("draft")).toContain(OPEN_FOR_REGISTRATION);
    expect(allowedTransitionsFrom("completed")).toEqual([]);
    expect(allowedTransitionsFrom("cancelled")).toEqual([]);
  });

  it("still rejects an illegal transition such as completed -> open", () => {
    expect(allowedTransitionsFrom("completed")).not.toContain("open");
    expect(allowedTransitionsFrom("cancelled")).not.toContain("open");
  });

  it("never offers a draft anything but open or cancelled", () => {
    expect(allowedTransitionsFrom("draft")).toEqual(["open", "cancelled"]);
  });
});
