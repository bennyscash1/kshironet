/**
 * Full database snapshot.
 *
 * Discovers every base table in the `public` schema at run time (so newly added
 * tables are picked up automatically), dumps each one to JSON under
 * backups/snapshot-<timestamp>/, and writes a `_manifest.json` in the exact shape
 * scripts/restore-backup.ts expects: { createdAt, order, tables, serialTables }.
 *
 * `order` is a topological sort over the FK graph, so restoring in that order
 * never violates a foreign key. A pg_dump (custom format) is also attempted as a
 * bonus — it is best-effort and never blocks the JSON snapshot.
 *
 * Usage:
 *   tsx scripts/backup-db.ts
 *   tsx scripts/backup-db.ts --exclude users,notifications
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import fs from "fs";
import path from "path";
import { spawnSync } from "child_process";
import { query, pool } from "../lib/db/client";

const BACKUPS_DIR = path.join(process.cwd(), "backups");
const STAMP = new Date().toISOString().replace(/[:.]/g, "-");

function argValue(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i !== -1 ? process.argv[i + 1] : undefined;
}

const EXCLUDED = new Set(
  (argValue("--exclude") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
);

/** All base tables in the public schema, minus anything explicitly excluded. */
async function listTables(): Promise<string[]> {
  const rows = await query<{ table_name: string }>(
    `SELECT table_name
       FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_type = 'BASE TABLE'
      ORDER BY table_name`
  );
  return rows.map((r) => r.table_name).filter((t) => !EXCLUDED.has(t));
}

/** child -> parents, from the FK constraints between the given tables. */
async function foreignKeyGraph(tables: string[]): Promise<Map<string, Set<string>>> {
  const rows = await query<{ child: string; parent: string }>(
    `SELECT c.conrelid::regclass::text  AS child,
            c.confrelid::regclass::text AS parent
       FROM pg_constraint c
       JOIN pg_namespace n ON n.oid = c.connamespace
      WHERE c.contype = 'f' AND n.nspname = 'public'`
  );
  const known = new Set(tables);
  const graph = new Map<string, Set<string>>(tables.map((t) => [t, new Set<string>()]));
  for (const { child, parent } of rows) {
    // regclass may come back schema-qualified or quoted; strip both.
    const c = child.replace(/^public\./, "").replace(/"/g, "");
    const p = parent.replace(/^public\./, "").replace(/"/g, "");
    if (c === p || !known.has(c) || !known.has(p)) continue; // self-refs resolve within a table
    graph.get(c)!.add(p);
  }
  return graph;
}

/** Parents before children. Cycles fall back to alphabetical for the leftovers. */
function topoSort(tables: string[], graph: Map<string, Set<string>>): string[] {
  const ordered: string[] = [];
  const placed = new Set<string>();
  let remaining = [...tables];

  while (remaining.length > 0) {
    const ready = remaining.filter((t) => [...graph.get(t)!].every((p) => placed.has(p)));
    if (ready.length === 0) {
      // FK cycle — emit what is left in a stable order and let the restore's
      // single-transaction insert sort it out.
      console.log(`  ⚠ FK cycle among: ${remaining.join(", ")} — using alphabetical order`);
      ordered.push(...remaining.sort());
      break;
    }
    ready.sort();
    ordered.push(...ready);
    ready.forEach((t) => placed.add(t));
    remaining = remaining.filter((t) => !placed.has(t));
  }
  return ordered;
}

/**
 * Tables whose `id` column is backed by a sequence (serial or identity) — these
 * are the ones restore-backup.ts calls setval() on. Read from the catalog rather
 * than pg_get_serial_sequence(), which errors outright on tables with no `id`.
 */
async function serialTables(tables: string[]): Promise<string[]> {
  const rows = await query<{ table_name: string }>(
    `SELECT table_name
       FROM information_schema.columns
      WHERE table_schema = 'public'
        AND column_name = 'id'
        AND (is_identity = 'YES' OR column_default LIKE 'nextval(%')`
  );
  const withSeq = new Set(rows.map((r) => r.table_name));
  return tables.filter((t) => withSeq.has(t));
}

function writePgDump(): string | null {
  const dumpUrl = process.env.DIRECT_URL || process.env.DATABASE_URL || "";
  const dumpFile = path.join(BACKUPS_DIR, `pg-backup-${STAMP}.dump`);
  const candidates =
    process.platform === "win32"
      ? ["pg_dump", "C:\\Program Files\\PostgreSQL\\17\\bin\\pg_dump.exe", "C:\\Program Files\\PostgreSQL\\16\\bin\\pg_dump.exe"]
      : ["pg_dump"];

  for (const bin of candidates) {
    try {
      const res = spawnSync(bin, [dumpUrl, "-Fc", "--no-owner", "--no-privileges", "-f", dumpFile], {
        env: process.env,
        encoding: "utf8",
      });
      if (res.error) continue; // binary not found -> try next candidate
      if (res.status === 0) return dumpFile;
      console.log(`  ⚠ pg_dump (${bin}) exited ${res.status}: ${(res.stderr || "").split("\n")[0]}`);
    } catch {
      /* try next */
    }
  }
  return null;
}

async function main() {
  const url = process.env.DATABASE_URL || "";
  let host = "(unknown)";
  let db = "(unknown)";
  try {
    const u = new URL(url);
    host = u.hostname;
    db = u.pathname.replace(/^\//, "");
  } catch {
    /* ignore */
  }

  console.log("=".repeat(70));
  console.log("DATABASE SNAPSHOT");
  console.log(`  SOURCE: ${host} / ${db}`);
  console.log("=".repeat(70));

  const tables = await listTables();
  if (tables.length === 0) throw new Error("No base tables found in schema 'public'");
  if (EXCLUDED.size > 0) console.log(`  excluding: ${[...EXCLUDED].join(", ")}`);

  const graph = await foreignKeyGraph(tables);
  const order = topoSort(tables, graph);
  const serials = await serialTables(order);

  const dir = path.join(BACKUPS_DIR, `snapshot-${STAMP}`);
  fs.mkdirSync(dir, { recursive: true });

  const manifestTables: Array<{ table: string; count: number }> = [];
  let total = 0;

  for (const table of order) {
    const rows = await query(`SELECT * FROM "${table}"`);
    fs.writeFileSync(path.join(dir, `${table}.json`), JSON.stringify(rows, null, 0));
    manifestTables.push({ table, count: rows.length });
    total += rows.length;
    console.log(`  • ${table}: ${rows.length}`);
  }

  fs.writeFileSync(
    path.join(dir, "_manifest.json"),
    JSON.stringify({ createdAt: STAMP, order, tables: manifestTables, serialTables: serials }, null, 2)
  );

  console.log(`\n  ✔ JSON snapshot: ${path.relative(process.cwd(), dir)}`);
  console.log(`    ${order.length} tables, ${total} rows`);

  const dump = writePgDump();
  if (dump) console.log(`  ✔ pg_dump: ${path.relative(process.cwd(), dump)}`);
  else console.log("  ⚠ pg_dump unavailable — JSON snapshot is the restore path.");

  await pool.end();
  console.log("\n" + "=".repeat(70));
  console.log("✔ BACKUP COMPLETE");
  console.log(`  Restore with: npm run db:restore -- backups/snapshot-${STAMP} --confirm`);
  console.log("=".repeat(70));
}

main().catch((err) => {
  console.error("\n✘ BACKUP FAILED:");
  console.error(err);
  process.exit(1);
});
