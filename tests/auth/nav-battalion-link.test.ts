import { describe, expect, it } from "vitest";
import { navLinksFor, navLinksForView, NAV_LINKS } from "@/lib/auth/nav";
import type { AppUser, Role, UserRole } from "@/lib/types";

function user(role: UserRole, battalion_id: number | null = null): AppUser {
  return {
    id: "u1",
    email: "u@example.com",
    full_name: null,
    role,
    status: "approved",
    battalion_id,
    requested_role_text: null,
    requested_battalion_text: null,
    approved_by: null,
    approved_at: null,
    created_at: "",
  };
}

const battalionsHref = (links: { href: string }[]) =>
  links.find((l) => l.href.startsWith("/battalions"))?.href;

/**
 * The "גדודים" tab points a battalion-scoped user at their own battalion, so the index
 * redirect is a safety net rather than a round trip on every click.
 */
describe("battalions nav link", () => {
  it("sends a scoped user straight to their own battalion", () => {
    const links = navLinksForView(user("viewer_battalion", 4), "battalion:9308" as Role, "9308");
    expect(battalionsHref(links)).toBe("/battalions/9308");
  });

  it("leaves a brigade user on the index, including while previewing a battalion", () => {
    // The role switcher writes `active_role`; it must not move a brigade user's own tab,
    // or they lose the way back to the index that only they can see.
    for (const role of ["brigade", "battalion:9308"] as Role[]) {
      const links = navLinksForView(user("editor"), role, null);
      expect(battalionsHref(links)).toBe("/battalions");
    }
  });

  it("leaves an unassigned scoped user on the index, where their empty state lives", () => {
    const links = navLinksForView(user("viewer_battalion", null), "battalion:x" as Role, null);
    expect(battalionsHref(links)).toBe("/battalions");
  });

  it("changes only the href — never which tabs exist", () => {
    // The security boundary is navLinksFor; the code is presentation only, so the set of
    // sections must be identical with and without it.
    const me = user("editor_battalion", 4);
    const sections = (code: string | null) =>
      navLinksForView(me, "battalion:9308" as Role, code).length;
    expect(sections("9308")).toBe(sections(null));
    expect(sections("9308")).toBe(navLinksFor(me).length);
    // ...and a scoped user still never gets the full brigade navigation.
    expect(sections("9308")).toBeLessThan(NAV_LINKS.length);
  });

  it("keeps the label as גדודים", () => {
    const links = navLinksForView(user("viewer_battalion", 4), "battalion:9308" as Role, "9308");
    expect(links.find((l) => l.href === "/battalions/9308")?.label).toBe("גדודים");
  });
});
