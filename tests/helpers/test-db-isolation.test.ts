import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The database-backed suites must never resolve a connection from the application's own
 * environment variables.
 *
 * This is the SOURCE-TEXT half of a two-part guard. It stops the fallback returning by
 * copy-paste — someone starting a new suite from an existing one and reaching for
 * `process.env.DATABASE_URL` because that is what the others used to do.
 *
 * It is deliberately NOT the important half. The failure it is named after was a resolved
 * connection, not a string in a file: the suites ran `DELETE FROM brigades` against the
 * live Supabase database and destroyed a row created through the UI. The check that would
 * have prevented that is the runtime one in tests/helpers/test-db.ts, which refuses any
 * host that is not loopback and any database that is not the expected test database. That
 * one also holds if someone points TEST_DATABASE_URL at a second Supabase project — the
 * obvious wrong turn from here, and one no amount of grepping would catch.
 *
 * Keep both. They fail in different ways.
 */

const TESTS_DIR = path.join(process.cwd(), "tests");
const FORBIDDEN = ["DATABASE_URL", "DIRECT_URL"] as const;

/** The one file allowed to name them: it exists to explain why they are forbidden. */
const ALLOWED = new Set([path.join("helpers", "test-db-isolation.test.ts")]);

function walk(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return walk(full);
    return entry.isFile() && /\.tsx?$/.test(entry.name) ? [full] : [];
  });
}

describe("test database isolation", () => {
  const files = walk(TESTS_DIR);

  it("finds test files to check", () => {
    // A broken walk would make every assertion below vacuously true.
    expect(files.length).toBeGreaterThan(10);
  });

  it.each(FORBIDDEN)("no test file reads process.env.%s", (name) => {
    const offenders = files
      .filter((f) => !ALLOWED.has(path.relative(TESTS_DIR, f)))
      .filter((f) => fs.readFileSync(f, "utf8").includes(`process.env.${name}`))
      .map((f) => path.relative(process.cwd(), f));

    expect(
      offenders,
      `These suites resolve a connection from the application's environment. They must use ` +
        `testDatabaseUrl() from tests/helpers/test-db.ts, which refuses any non-loopback ` +
        `host. ${name} points at the live database.`
    ).toEqual([]);
  });

  it("every database-backed suite goes through the helper", () => {
    // A suite that constructs a pg Client must have obtained its connection from the
    // helper, or it has some other source this guard has not thought of.
    const offenders = files
      .filter((f) => {
        const src = fs.readFileSync(f, "utf8");
        return src.includes("new Client(") && !src.includes("testDatabaseUrl");
      })
      .map((f) => path.relative(process.cwd(), f));

    expect(offenders).toEqual([]);
  });
});
