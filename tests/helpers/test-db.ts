import { config } from "dotenv";
import { parse } from "pg-connection-string";

config({ path: ".env.local" });

/**
 * The one place a database-backed suite may get a connection string.
 *
 * WHY THIS EXISTS, PLAINLY
 * The database-backed suites open a transaction and issue `DELETE FROM brigades` and
 * `DELETE FROM battalions` to get a known starting point. Until this file existed they
 * resolved their connection from `DIRECT_URL || DATABASE_URL` — the LIVE Supabase database
 * the running application uses. A row created through the UI was lost that way.
 *
 * Two independent guards, because they fail differently:
 *
 *   1. A source-text check (tests/tenancy-guard.test.ts) forbids `DATABASE_URL` and
 *      `DIRECT_URL` under tests/, so the fallback cannot return by copy-paste.
 *   2. THIS runtime check refuses a resolved connection that is not a loopback host, and
 *      refuses a database whose name is not the expected test database.
 *
 * The second is the one that matters. The failure was never a string in a test file — it
 * was a resolved connection. And it is the only one that catches the obvious wrong turn
 * from here: pointing TEST_DATABASE_URL at a second Supabase project, which is remote,
 * destructible, and invisible to any amount of grepping.
 */

export const TEST_DB_NAME = "kshironet_test";

/** Hosts a destructive suite may talk to. Nothing else, ever. */
const LOOPBACK = new Set(["127.0.0.1", "::1", "localhost"]);

let announced = false;

function redact(url: string): string {
  const c = parse(url);
  return `${c.user ?? "?"}:<redacted>@${c.host ?? "?"}:${c.port ?? "?"}/${c.database ?? "?"}`;
}

/**
 * Returns the test connection string, or null when `TEST_DATABASE_URL` is unset so the
 * caller can `describe.skipIf(...)`.
 *
 * THROWS — deliberately, rather than skipping — when the variable is set but points
 * somewhere a destructive suite must not touch. A silent skip there would look like
 * "no database configured" and hide a misconfiguration that is one `npm test` away from
 * deleting real rows.
 */
export function testDatabaseUrl(): string | null {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) return null;

  const c = parse(url);
  const host = (c.host ?? "").toLowerCase();
  const database = c.database ?? "";

  if (!LOOPBACK.has(host)) {
    throw new Error(
      [
        `REFUSING TO RUN: the test suite will not run against a remote database.`,
        ``,
        `  TEST_DATABASE_URL resolves to host "${host}", which is not a loopback address.`,
        `  Resolved: ${redact(url)}`,
        ``,
        `  These suites DELETE FROM brigades and DELETE FROM battalions. Pointing them at`,
        `  a hosted database — including a second Supabase project — destroys real rows.`,
        `  Allowed hosts: ${[...LOOPBACK].join(", ")}.`,
        ``,
        `  Create the local test database with:  npm run test:db:setup`,
      ].join("\n")
    );
  }

  if (database !== TEST_DB_NAME) {
    throw new Error(
      [
        `REFUSING TO RUN: the test suite will not run against a database it does not own.`,
        ``,
        `  TEST_DATABASE_URL resolves to database "${database}", expected "${TEST_DB_NAME}".`,
        `  Resolved: ${redact(url)}`,
        ``,
        `  A loopback host is not enough: a local database can still hold real work.`,
        `  Create the expected one with:  npm run test:db:setup`,
      ].join("\n")
    );
  }

  // Once per run, so the target is on the record rather than assumed.
  if (!announced) {
    announced = true;
    console.log(`[test-db] using ${redact(url)}`);
  }

  return url;
}

/** Connection options for `new Client(...)`. Local Postgres has ssl off. */
export function testClientConfig(url: string) {
  return { connectionString: url, ssl: false as const };
}
