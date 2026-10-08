import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AppUser } from "@/lib/types";

/**
 * `requireBattalionContext()` must REJECT when no brigade scope is available, rather than
 * quietly resolving a battalion from an unscoped lookup.
 *
 * This is the guard that stops the old behaviour creeping back: before the change the
 * function resolved the cookie's battalion code with no brigade predicate, so a super admin
 * with no brigade selected — or a role with no brigade at all — still got *a* battalion,
 * whichever the planner happened to return first.
 */

class RedirectSignal extends Error {
  constructor(readonly to: string) {
    super(`redirect:${to}`);
  }
}

const mocks = vi.hoisted(() => ({
  redirect: vi.fn((to: string) => {
    throw new RedirectSignal(to);
  }),
  getBattalionScope: vi.fn(),
  getCurrentUser: vi.fn(),
  getCurrentRole: vi.fn(),
  activeBrigadeId: vi.fn(),
  getBattalionByCode: vi.fn(),
}));

vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/lib/auth/scope", () => ({ getBattalionScope: mocks.getBattalionScope }));
vi.mock("@/lib/auth/user", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/auth/current-role", () => ({ getCurrentRole: mocks.getCurrentRole }));
vi.mock("@/lib/auth/active-brigade", () => ({ activeBrigadeId: mocks.activeBrigadeId }));
vi.mock("@/lib/db/repositories/battalions", () => ({
  getBattalionByCode: mocks.getBattalionByCode,
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
  active_brigade_id: null,
  approved_by: null,
  approved_at: null,
  created_at: "",
};

async function callRequireBattalionContext() {
  const { requireBattalionContext } = await import("@/lib/auth/require-scope");
  return requireBattalionContext();
}

beforeEach(() => {
  for (const m of Object.values(mocks)) m.mockReset();
  mocks.redirect.mockImplementation((to: string) => {
    throw new RedirectSignal(to);
  });
  // A global user: no battalion-scoped confinement, so resolution falls through to the
  // brigade-scoped code lookup.
  mocks.getBattalionScope.mockResolvedValue(null);
  mocks.getCurrentUser.mockResolvedValue(superAdmin);
  mocks.getCurrentRole.mockResolvedValue("battalion:5030");
});

describe("requireBattalionContext with no brigade scope", () => {
  // 4.4 — rejects rather than silently resolving.
  it("redirects instead of resolving when no brigade is active", async () => {
    mocks.activeBrigadeId.mockResolvedValue(null);

    await expect(callRequireBattalionContext()).rejects.toBeInstanceOf(RedirectSignal);
    expect(mocks.redirect).toHaveBeenCalledWith("/battalions");
  });

  // The important half: it must not even ATTEMPT the lookup. A call with a placeholder
  // brigade would be the unscoped behaviour wearing a scoped signature.
  it("never queries for a battalion when the brigade is null", async () => {
    mocks.activeBrigadeId.mockResolvedValue(null);

    await expect(callRequireBattalionContext()).rejects.toBeInstanceOf(RedirectSignal);
    expect(mocks.getBattalionByCode).not.toHaveBeenCalled();
  });

  // 4.2 — a code in another brigade is indistinguishable from one that does not exist:
  // the scoped lookup returns nothing and the same redirect follows.
  it("redirects identically for a wrong-brigade code and a non-existent one", async () => {
    mocks.activeBrigadeId.mockResolvedValue(7);
    mocks.getBattalionByCode.mockResolvedValue(undefined);

    await expect(callRequireBattalionContext()).rejects.toBeInstanceOf(RedirectSignal);
    expect(mocks.redirect).toHaveBeenCalledWith("/battalions");
    expect(mocks.getBattalionByCode).toHaveBeenCalledWith("5030", 7);
  });

  it("passes the active brigade to the lookup, never a cookie-derived brigade", async () => {
    mocks.activeBrigadeId.mockResolvedValue(42);
    mocks.getBattalionByCode.mockResolvedValue({
      id: 9,
      code: "5030",
      name: "גדוד",
      color_hex: "#64748B",
      is_active: 1,
      brigade_id: 42,
    });

    const ctx = await callRequireBattalionContext();
    expect(ctx.battalion.id).toBe(9);
    // Second argument is the server-resolved brigade. The cookie supplied only the code.
    expect(mocks.getBattalionByCode).toHaveBeenCalledWith("5030", 42);
  });
});

/**
 * 4.5 — the suite must refuse to run against production, at RUNTIME, not by lint.
 *
 * tests/helpers/test-db.ts is loaded by every database-backed suite and throws before any
 * connection is opened. These assertions drive it directly so the protection itself is
 * covered, rather than being trusted because it is written down.
 */
describe("the test database guard refuses production", () => {
  const load = async () => {
    vi.resetModules();
    return import("../helpers/test-db");
  };

  it.each([
    "postgresql://postgres:pw@aws-0-eu-central-1.pooler.supabase.com:5432/postgres",
    "postgresql://postgres:pw@db.yaipwhdnnxnvpyfmlbrj.supabase.co:5432/postgres",
    "postgresql://postgres:pw@10.0.0.5:5432/kshironet_test",
  ])("throws for the non-loopback host in %s", async (url) => {
    const original = process.env.TEST_DATABASE_URL;
    process.env.TEST_DATABASE_URL = url;
    try {
      const { testDatabaseUrl } = await load();
      expect(() => testDatabaseUrl()).toThrow(/REFUSING TO RUN/);
    } finally {
      process.env.TEST_DATABASE_URL = original;
    }
  });

  it("throws for a loopback host with the wrong database name", async () => {
    const original = process.env.TEST_DATABASE_URL;
    process.env.TEST_DATABASE_URL = "postgresql://postgres@127.0.0.1:5432/postgres";
    try {
      const { testDatabaseUrl } = await load();
      expect(() => testDatabaseUrl()).toThrow(/kshironet_test/);
    } finally {
      process.env.TEST_DATABASE_URL = original;
    }
  });

  /**
   * Unset is the one case that skips rather than throws: a machine with no test database
   * should opt out of the database-backed suites, not fail the run.
   *
   * Simulated with an empty string rather than `delete`, because test-db.ts calls
   * `dotenv.config({ path: ".env.local" })` at module scope — deleting the variable just
   * lets dotenv repopulate it from the file on the next import. dotenv does not overwrite a
   * key already present in `process.env`, so an empty string survives, and the function's
   * contract is a falsy check either way.
   */
  it("returns null when unset, so suites skip rather than fail", async () => {
    const original = process.env.TEST_DATABASE_URL;
    process.env.TEST_DATABASE_URL = "";
    try {
      const { testDatabaseUrl } = await load();
      expect(testDatabaseUrl()).toBeNull();
    } finally {
      process.env.TEST_DATABASE_URL = original;
    }
  });
});
