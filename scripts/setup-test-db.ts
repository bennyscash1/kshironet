import { config } from "dotenv";

config({ path: ".env.local" });

import fs from "node:fs";
import path from "node:path";
import { Client } from "pg";
import { parse } from "pg-connection-string";

/**
 * Creates and migrates the LOCAL test database.
 *
 *   npm run test:db:setup            create if absent, then apply every migration
 *   npm run test:db:setup -- --reset drop and recreate first
 *
 * The database-backed suites used to run against the live Supabase database, because they
 * resolved `DIRECT_URL || DATABASE_URL`. They now read `TEST_DATABASE_URL` only, and
 * tests/helpers/test-db.ts refuses any host that is not loopback. This script builds the
 * database that variable is meant to point at.
 *
 * Refuses to touch anything remote, for the same reason the suites do: it issues
 * DROP DATABASE.
 */

const LOOPBACK = new Set(["127.0.0.1", "::1", "localhost"]);
const MIGRATIONS = path.join(process.cwd(), "migrations", "postgres");

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

const url = process.env.TEST_DATABASE_URL;
if (!url) {
  fail(
    [
      "TEST_DATABASE_URL is not set.",
      "",
      "Add it to .env.local, pointing at a LOCAL database:",
      "  TEST_DATABASE_URL=\"postgresql://postgres@127.0.0.1:5432/kshironet_test?sslmode=disable\"",
      "",
      "sslmode=disable matters: lib/db/client.ts passes ssl options unconditionally, and a",
      "connection string overrides them in pg — local Postgres has ssl off.",
    ].join("\n")
  );
}

const target = parse(url);
const host = (target.host ?? "").toLowerCase();
const dbName = target.database ?? "";

if (!LOOPBACK.has(host)) {
  fail(
    `REFUSING TO RUN: TEST_DATABASE_URL host "${host}" is not loopback. This script issues ` +
      `DROP DATABASE and CREATE DATABASE; it will not point them at a remote server.`
  );
}
if (!dbName) fail("TEST_DATABASE_URL has no database name.");

/** Connects to `postgres` on the same server, so the target database can be created. */
function adminClient(): Client {
  return new Client({
    host: target.host ?? "127.0.0.1",
    port: target.port ? Number(target.port) : 5432,
    user: target.user ?? "postgres",
    password: target.password ?? undefined,
    database: "postgres",
    ssl: false,
  });
}

function targetClient(): Client {
  return new Client({ connectionString: url, ssl: false });
}

async function main() {
  const reset = process.argv.includes("--reset");
  console.log(`[setup-test-db] target ${target.user}:<redacted>@${host}:${target.port}/${dbName}`);

  const admin = adminClient();
  await admin.connect();
  try {
    const { rows } = await admin.query("SELECT 1 FROM pg_database WHERE datname = $1", [dbName]);
    if (rows.length > 0 && reset) {
      // Terminate stray connections first, or DROP DATABASE fails.
      await admin.query(
        "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()",
        [dbName]
      );
      await admin.query(`DROP DATABASE ${JSON.stringify(dbName).replace(/"/g, '"')}`);
      console.log(`[setup-test-db] dropped ${dbName}`);
    }
    if (rows.length === 0 || reset) {
      await admin.query(`CREATE DATABASE "${dbName}"`);
      console.log(`[setup-test-db] created ${dbName}`);
    } else {
      console.log(`[setup-test-db] ${dbName} already exists`);
    }
  } finally {
    await admin.end();
  }

  const db = targetClient();
  await db.connect();
  try {
    /**
     * SHIM: migration 004_users.sql ends with
     *   INSERT INTO users (...) SELECT ... FROM auth.users ON CONFLICT (id) DO NOTHING;
     *
     * `auth.users` is Supabase's own table. It does not exist on vanilla Postgres, and
     * 004 is immutable, so the only way to apply the series locally is to provide an
     * empty stand-in. Empty is correct: the backfill exists to adopt pre-existing Supabase
     * auth accounts, and a fresh test database has none.
     *
     * Only the columns 004 actually selects are needed.
     */
    await db.query("CREATE SCHEMA IF NOT EXISTS auth");
    await db.query(`
      CREATE TABLE IF NOT EXISTS auth.users (
        id UUID PRIMARY KEY,
        email TEXT,
        raw_user_meta_data JSONB,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`);
    console.log("[setup-test-db] auth.users shim in place (empty — see comment in this script)");

    const files = fs
      .readdirSync(MIGRATIONS)
      .filter((f) => f.endsWith(".sql"))
      .sort();

    for (const file of files) {
      const sql = fs.readFileSync(path.join(MIGRATIONS, file), "utf8");
      try {
        await db.query(sql);
        console.log(`  applied ${file}`);
      } catch (err) {
        console.error(`\n[setup-test-db] FAILED on ${file}`);
        console.error(`  ${(err as Error).message}`);
        console.error(
          "\nThis is a migration that does not apply to vanilla Postgres. Report it rather " +
            "than shimming it silently: a series that only applies to Supabase is a fact " +
            "worth knowing, and it is what would block a local development stack."
        );
        process.exit(1);
      }
    }
    console.log(`[setup-test-db] applied ${files.length} migration(s)`);
  } finally {
    await db.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
