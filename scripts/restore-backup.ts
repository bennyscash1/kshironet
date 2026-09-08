/**
 * Rollback companion for scripts/migrate-from-sqlite.ts.
 *
 * Restores the source-backed domain tables from a JSON snapshot created during
 * the migration's backup step (backups/snapshot-<timestamp>/). Runs inside one
 * transaction: TRUNCATE ... RESTART IDENTITY CASCADE, re-insert the snapshot
 * rows (preserving ids), then reset sequences. users/type_colors are never
 * touched (they were out of scope for the migration and not in the snapshot).
 *
 * Usage:
 *   tsx scripts/restore-backup.ts <snapshot-dir> --confirm
 *   tsx scripts/restore-backup.ts --confirm            # uses the latest snapshot
 *
 * (For a full-database rollback from the pg_dump file, use the pg_restore command
 *  printed in the migration report instead.)
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import fs from "fs";
import path from "path";
import type { PoolClient } from "pg";
import { query, withTransaction, pool } from "../lib/db/client";

const BACKUPS_DIR = path.join(process.cwd(), "backups");
const CONFIRMED = process.argv.includes("--confirm");

type Manifest = {
  createdAt: string;
  order: string[];
  tables: Array<{ table: string; count: number }>;
  serialTables: string[];
};

function resolveSnapshotDir(): string {
  const arg = process.argv.slice(2).find((a) => !a.startsWith("--"));
  if (arg) return path.isAbsolute(arg) ? arg : path.join(process.cwd(), arg);
  // Otherwise pick the most recent snapshot-* directory.
  if (!fs.existsSync(BACKUPS_DIR)) throw new Error(`No backups directory at ${BACKUPS_DIR}`);
  const dirs = fs
    .readdirSync(BACKUPS_DIR)
    .filter((d) => d.startsWith("snapshot-") && fs.statSync(path.join(BACKUPS_DIR, d)).isDirectory())
    .sort();
  if (dirs.length === 0) throw new Error("No snapshot-* directories found under backups/");
  return path.join(BACKUPS_DIR, dirs[dirs.length - 1]);
}

async function bulkInsert(client: PoolClient, table: string, cols: string[], rows: Record<string, unknown>[]) {
  if (rows.length === 0) return;
  const CHUNK = 100;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK);
    const values: unknown[] = [];
    const tuples = chunk.map((r, ri) => {
      const ph = cols.map((_, ci) => `$${ri * cols.length + ci + 1}`);
      cols.forEach((c) => values.push(r[c] ?? null));
      return `(${ph.join(",")})`;
    });
    await client.query(`INSERT INTO ${table} (${cols.join(",")}) VALUES ${tuples.join(",")}`, values);
  }
}

async function main() {
  const dir = resolveSnapshotDir();
  const manifestPath = path.join(dir, "_manifest.json");
  if (!fs.existsSync(manifestPath)) throw new Error(`Missing _manifest.json in ${dir}`);
  const manifest: Manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));

  const url = process.env.DATABASE_URL || "";
  let host = "(unknown)";
  let db = "(unknown)";
  try {
    const u = new URL(url);
    host = u.hostname;
    db = u.pathname.replace(/^\//, "");
  } catch { /* ignore */ }

  console.log("=".repeat(70));
  console.log("RESTORE from JSON snapshot");
  console.log(`  TARGET DATABASE: ${host} / ${db}`);
  console.log(`  SNAPSHOT:        ${path.relative(process.cwd(), dir)} (created ${manifest.createdAt})`);
  console.log("=".repeat(70));

  if (!CONFIRMED) {
    console.log("\nDRY RUN — no --confirm flag. Nothing changed.");
    console.log(`This WOULD TRUNCATE and re-load ${manifest.order.length} tables from the snapshot.`);
    await pool.end();
    return;
  }

  // Load snapshot rows.
  const data: Record<string, Record<string, unknown>[]> = {};
  for (const table of manifest.order) {
    const file = path.join(dir, `${table}.json`);
    data[table] = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : [];
  }

  await withTransaction(async (client) => {
    await client.query(`TRUNCATE ${manifest.order.join(", ")} RESTART IDENTITY CASCADE`);
    console.log(`  ✔ truncated ${manifest.order.length} tables`);

    for (const table of manifest.order) {
      const rows = data[table];
      if (rows.length === 0) {
        console.log(`    • ${table}: 0`);
        continue;
      }
      const cols = Object.keys(rows[0]);
      await bulkInsert(client, table, cols, rows);
      console.log(`    • ${table}: restored ${rows.length}`);
    }

    for (const t of manifest.serialTables) {
      await client.query(
        `SELECT setval(pg_get_serial_sequence('${t}','id'),
                       GREATEST(COALESCE((SELECT MAX(id) FROM ${t}),0),1),
                       (SELECT MAX(id) FROM ${t}) IS NOT NULL)`
      );
    }
    console.log("  ✔ sequences reset");
  });

  // Verify against manifest counts.
  console.log("\nVerifying restored counts…");
  let ok = true;
  for (const { table, count } of manifest.tables) {
    const rows = await query<{ n: string }>(`SELECT COUNT(*)::int AS n FROM ${table}`);
    const actual = Number(rows[0].n);
    const mark = actual === count ? "✔" : "✘";
    if (actual !== count) ok = false;
    console.log(`  ${mark} ${table}: ${actual} (snapshot ${count})`);
  }

  await pool.end();
  console.log("\n" + "=".repeat(70));
  console.log(ok ? "✔ RESTORE COMPLETE — counts match the snapshot." : "⚠ RESTORE COMPLETED WITH COUNT MISMATCHES.");
  console.log("=".repeat(70));
  if (!ok) process.exitCode = 2;
}

main().catch((err) => {
  console.error("\n✘ RESTORE FAILED (transaction rolled back):");
  console.error(err);
  process.exit(1);
});
