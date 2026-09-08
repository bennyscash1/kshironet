/**
 * One-time, re-runnable data migration: SQLite (certifications.db) -> Supabase/Postgres.
 *
 * Replaces ALL data in the source-backed domain tables with the rows from the
 * external SQLite dump. Defensive by design:
 *   Step 0  checkpoint the source WAL and print the target DB (sanity log)
 *   Step 1  full backup (JSON snapshots always; pg_dump best-effort) — HALTS if this fails
 *   Step 2  apply schema migrations (idempotent) so every source column has a home
 *   Step 3  import inside ONE transaction (TRUNCATE ... RESTART IDENTITY CASCADE + bulk insert)
 *   Step 4  reset sequences, verify row counts, check for orphaned FKs
 *   Step 5  write a Hebrew reconciliation report to backups/
 *
 * Usage:  tsx scripts/migrate-from-sqlite.ts --confirm
 * Without --confirm it prints the target + plan and exits without touching data.
 *
 * Decisions baked in (see report):
 *   - integer 0/1 flags stay SMALLINT (the app SQL relies on `WHERE is_active = 1`)
 *   - users + type_colors are OUT OF SCOPE — never truncated or altered
 *   - training_sessions.sub_framework/content preserved via migration 006
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import fs from "fs";
import path from "path";
import { spawnSync } from "child_process";
import Database from "better-sqlite3";
import type { PoolClient } from "pg";
// Relative import (matches scripts/seed.ts); the pg pool reads DATABASE_URL lazily.
import { query, withTransaction, pool } from "../lib/db/client";

const SOURCE_DB = path.join(process.cwd(), "DbToUpdate", "certifications.db");
const MIGRATIONS_DIR = path.join(process.cwd(), "migrations", "postgres");
const BACKUPS_DIR = path.join(process.cwd(), "backups");

// Timestamp for filenames — Date.now is fine here (plain script, not a workflow).
const STAMP = new Date().toISOString().replace(/[:.]/g, "-");

const CONFIRMED = process.argv.includes("--confirm");

// ---------------------------------------------------------------------------
// Expected source row counts — asserted after import.
// ---------------------------------------------------------------------------
const EXPECTED_COUNTS: Record<string, number> = {
  battalions: 7,
  certifications: 39,
  roster_entries: 135,
  battalion_requests: 24,
  certification_templates: 24,
  certification_battalion_quotas: 36,
  certification_prerequisites: 4,
  certification_taxes: 4,
  certification_gap_rows: 16,
  certification_gap_values: 76,
  course_colors: 39,
  notifications: 207,
  status_history: 294,
  trainings: 8,
  training_sessions: 14,
  training_unit_hours: 0,
  influencing_factors: 3,
  influencing_factor_battalions: 7,
};

// ---------------------------------------------------------------------------
// Column mapping. Each column: { t: target, s?: source (default t), k?: kind }
// kind 'ts' -> SQLite TEXT datetime to timestamptz (UTC); otherwise pass-through.
// Tables are listed in FK-safe insert order.
// `id: true` -> preserve source id and reset the serial sequence afterwards.
// ---------------------------------------------------------------------------
type Col = { t: string; s?: string; k?: "ts" };
type TableCfg = { src: string; dst: string; id: boolean; cols: Col[] };

const TABLES: TableCfg[] = [
  {
    src: "battalions",
    dst: "battalions",
    id: true,
    cols: [{ t: "id" }, { t: "code" }, { t: "name" }, { t: "color_hex" }, { t: "is_active" }],
  },
  {
    src: "certification_gap_rows",
    dst: "certification_gap_rows",
    id: true,
    cols: [{ t: "id" }, { t: "certification_name" }, { t: "sort_order" }],
  },
  {
    src: "certification_templates",
    dst: "certification_templates",
    id: true,
    cols: [
      { t: "id" }, { t: "name" }, { t: "domain" }, { t: "default_location" },
      { t: "default_slots" }, { t: "default_notes" }, { t: "gap_row_id" },
      { t: "checkin_details" }, { t: "duration_text" }, { t: "trainee_ratio" },
      { t: "ammo_required" }, { t: "requirements_text" }, { t: "equipment_text" },
      { t: "contacts_text" }, { t: "color_hex" },
      { t: "created_at", k: "ts" }, { t: "updated_at", k: "ts" },
    ],
  },
  {
    src: "certifications",
    dst: "certifications",
    id: true,
    cols: [
      { t: "id" }, { t: "template_id" }, { t: "name" }, { t: "domain" },
      { t: "start_date" }, { t: "end_date" }, { t: "location" }, { t: "total_slots" },
      { t: "registration_open" }, { t: "status" }, { t: "notes" },
      { t: "origin_request_id" }, { t: "gap_row_id" }, { t: "created_by_role" },
      { t: "created_at", k: "ts" }, { t: "updated_at", k: "ts" },
      // NOTE: certifications.color_hex has no source column -> left NULL.
    ],
  },
  {
    src: "certification_prerequisites",
    dst: "certification_prerequisites",
    id: true,
    cols: [{ t: "id" }, { t: "certification_id" }, { t: "description" }],
  },
  {
    src: "certification_battalion_quotas",
    dst: "certification_battalion_quotas",
    id: true,
    cols: [
      { t: "id" }, { t: "certification_id" }, { t: "battalion_id" },
      { t: "allocated_slots" }, { t: "notes" },
    ],
  },
  {
    src: "certification_taxes",
    dst: "certification_taxes",
    id: true,
    cols: [
      { t: "id" }, { t: "certification_id" }, { t: "role_name" },
      { t: "is_fulfilled" }, { t: "notes" },
    ],
  },
  {
    // Postgres has no surrogate id here (PK = row_id,battalion_id); source id dropped.
    src: "certification_gap_values",
    dst: "certification_gap_values",
    id: false,
    cols: [
      { t: "row_id" }, { t: "battalion_id" }, { t: "gap_count" }, { t: "sent_count" },
    ],
  },
  {
    src: "roster_entries",
    dst: "roster_entries",
    id: true,
    cols: [
      { t: "id" }, { t: "certification_id" }, { t: "battalion_id" }, { t: "full_name" },
      { t: "personal_number" }, { t: "company_platoon" }, { t: "phone" },
      { t: "commander_name" }, { t: "commander_phone" }, { t: "has_prior_certification" },
      { t: "prior_certification_details" }, { t: "meets_prerequisite" }, { t: "notes" },
      { t: "status" }, { t: "outcome_reason" }, { t: "is_reserve" },
      { t: "created_at", k: "ts" }, { t: "updated_at", k: "ts" },
    ],
  },
  {
    src: "battalion_requests",
    dst: "battalion_requests",
    id: true,
    cols: [
      { t: "id" }, { t: "battalion_id" }, { t: "requested_cert_type" },
      { t: "quantity_needed" }, { t: "reason" }, { t: "urgency" }, { t: "desired_date" },
      { t: "notes" }, { t: "status" }, { t: "linked_certification_id" },
      { t: "created_at", k: "ts" }, { t: "updated_at", k: "ts" },
    ],
  },
  {
    src: "course_colors",
    dst: "course_colors",
    id: false, // TEXT primary key (name)
    cols: [{ t: "name" }, { t: "color_hex" }, { t: "created_at", k: "ts" }],
  },
  {
    src: "notifications",
    dst: "notifications",
    id: true,
    cols: [
      { t: "id" }, { t: "type" }, { t: "target_role" }, { t: "entity_type" },
      { t: "entity_id" }, { t: "message" }, { t: "is_read" }, { t: "created_at", k: "ts" },
    ],
  },
  {
    src: "status_history",
    dst: "status_history",
    id: true,
    cols: [
      { t: "id" }, { t: "entity_type" }, { t: "entity_id" }, { t: "old_status" },
      { t: "new_status" }, { t: "changed_by_role" }, { t: "note" },
      { t: "changed_at", k: "ts" },
    ],
  },
  {
    src: "trainings",
    dst: "trainings",
    id: true,
    cols: [
      { t: "id" }, { t: "name", s: "title" }, { t: "domain" }, { t: "start_date" },
      { t: "end_date" }, { t: "contact_name" }, { t: "contact_phone" }, { t: "notes" },
      { t: "created_at", k: "ts" }, { t: "updated_at", k: "ts" },
      // NOTE: trainings.color_hex has no source column -> left NULL.
    ],
  },
  {
    src: "training_sessions",
    dst: "training_sessions",
    id: true,
    cols: [
      { t: "id" }, { t: "training_id" }, { t: "battalion_id" }, { t: "session_date" },
      { t: "start_time" }, { t: "end_time" }, { t: "sub_framework" }, { t: "content" },
      { t: "created_at", k: "ts" },
      // NOTE: location / instructor_name / instructor_phone have no source -> NULL.
    ],
  },
  {
    src: "training_unit_hours",
    dst: "training_unit_hours",
    id: true,
    cols: [
      { t: "id" }, { t: "training_id" }, { t: "day_date" }, { t: "battalion_id" },
      { t: "hours" },
    ],
  },
  {
    src: "influencing_factors",
    dst: "influencing_factors",
    id: true,
    cols: [
      { t: "id" }, { t: "name" }, { t: "start_date" }, { t: "end_date" }, { t: "notes" },
      { t: "created_at", k: "ts" }, { t: "updated_at", k: "ts" },
    ],
  },
  {
    // Postgres has no surrogate id (PK = influencing_factor_id,battalion_id); source id dropped.
    src: "influencing_factor_battalions",
    dst: "influencing_factor_battalions",
    id: false,
    cols: [{ t: "influencing_factor_id" }, { t: "battalion_id" }],
  },
];

const ORDER = TABLES.map((t) => t.dst);
const SERIAL_TABLES = TABLES.filter((t) => t.id).map((t) => t.dst);

// Orphaned-FK spot checks (child.col -> parent.col).
const FK_CHECKS: Array<{ child: string; col: string; parent: string; pcol?: string }> = [
  { child: "certifications", col: "template_id", parent: "certification_templates" },
  { child: "certifications", col: "gap_row_id", parent: "certification_gap_rows" },
  { child: "certification_prerequisites", col: "certification_id", parent: "certifications" },
  { child: "certification_battalion_quotas", col: "certification_id", parent: "certifications" },
  { child: "certification_battalion_quotas", col: "battalion_id", parent: "battalions" },
  { child: "certification_taxes", col: "certification_id", parent: "certifications" },
  { child: "certification_gap_values", col: "row_id", parent: "certification_gap_rows" },
  { child: "certification_gap_values", col: "battalion_id", parent: "battalions" },
  { child: "roster_entries", col: "certification_id", parent: "certifications" },
  { child: "roster_entries", col: "battalion_id", parent: "battalions" },
  { child: "battalion_requests", col: "battalion_id", parent: "battalions" },
  { child: "battalion_requests", col: "linked_certification_id", parent: "certifications" },
  { child: "training_sessions", col: "training_id", parent: "trainings" },
  { child: "training_sessions", col: "battalion_id", parent: "battalions" },
  { child: "training_unit_hours", col: "training_id", parent: "trainings" },
  { child: "influencing_factor_battalions", col: "influencing_factor_id", parent: "influencing_factors" },
  { child: "influencing_factor_battalions", col: "battalion_id", parent: "battalions" },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const TS_RE = /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}(\.\d+)?$/;
const TZ_RE = /([zZ]|[+-]\d{2}:?\d{2})$/;

type LossyNote = { table: string; column: string; value: string; note: string };
const lossy: LossyNote[] = [];

function toTs(v: unknown, table: string, column: string): unknown {
  if (v === null || v === undefined) return null;
  if (typeof v !== "string") return v;
  if (v.trim() === "") return null;
  if (TS_RE.test(v)) return v.replace(" ", "T") + "Z"; // interpret SQLite UTC datetime as UTC
  if (TZ_RE.test(v)) return v; // already has an offset
  lossy.push({ table, column, value: v, note: "פורמט תאריך/שעה לא סטנדרטי — הועבר כפי שהוא ל-Postgres" });
  return v;
}

function mapRow(cfg: TableCfg, row: Record<string, unknown>): unknown[] {
  return cfg.cols.map((c) => {
    const raw = row[c.s ?? c.t];
    return c.k === "ts" ? toTs(raw, cfg.dst, c.t) : raw ?? null;
  });
}

async function bulkInsert(client: PoolClient, table: string, cols: string[], rows: unknown[][]) {
  if (rows.length === 0) return;
  const CHUNK = 100;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK);
    const values: unknown[] = [];
    const tuples = chunk.map((r, ri) => {
      const ph = cols.map((_, ci) => `$${ri * cols.length + ci + 1}`);
      values.push(...r);
      return `(${ph.join(",")})`;
    });
    await client.query(
      `INSERT INTO ${table} (${cols.join(",")}) VALUES ${tuples.join(",")}`,
      values
    );
  }
}

async function countTable(table: string): Promise<number> {
  const rows = await query<{ n: string }>(`SELECT COUNT(*)::int AS n FROM ${table}`);
  return Number(rows[0].n);
}

async function tableExists(table: string): Promise<boolean> {
  const rows = await query<{ exists: boolean }>(
    "SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name=$1) AS exists",
    [table]
  );
  return rows[0].exists;
}

function log(msg: string) {
  console.log(msg);
}

// ---------------------------------------------------------------------------
// Step 1 — Backup
// ---------------------------------------------------------------------------
async function backup(): Promise<{ jsonDir: string; pgDump: string | null; oldCounts: Record<string, number> }> {
  fs.mkdirSync(BACKUPS_DIR, { recursive: true });
  const jsonDir = path.join(BACKUPS_DIR, `snapshot-${STAMP}`);
  fs.mkdirSync(jsonDir, { recursive: true });

  const oldCounts: Record<string, number> = {};
  const manifestTables: Array<{ table: string; count: number }> = [];

  // JSON snapshots of every source-backed table that currently exists (the portable backup).
  for (const table of ORDER) {
    if (!(await tableExists(table))) {
      oldCounts[table] = 0; // e.g. training_unit_hours does not exist pre-migration
      continue;
    }
    const rows = await query(`SELECT * FROM ${table}`);
    fs.writeFileSync(path.join(jsonDir, `${table}.json`), JSON.stringify(rows, null, 0));
    oldCounts[table] = rows.length;
    manifestTables.push({ table, count: rows.length });
  }
  fs.writeFileSync(
    path.join(jsonDir, "_manifest.json"),
    JSON.stringify({ createdAt: STAMP, order: ORDER, tables: manifestTables, serialTables: SERIAL_TABLES }, null, 2)
  );
  log(`  ✔ JSON snapshot written: ${jsonDir}`);

  // pg_dump — best-effort bonus (custom format, for pg_restore rollback).
  const dumpUrl = process.env.DIRECT_URL || process.env.DATABASE_URL || "";
  const dumpFile = path.join(BACKUPS_DIR, `pg-backup-${STAMP}.dump`);
  let pgDump: string | null = null;
  const candidates = process.platform === "win32"
    ? ["pg_dump", "C:\\Program Files\\PostgreSQL\\17\\bin\\pg_dump.exe"]
    : ["pg_dump"];
  for (const bin of candidates) {
    try {
      const res = spawnSync(bin, [dumpUrl, "-Fc", "--no-owner", "--no-privileges", "-f", dumpFile], {
        env: process.env,
        encoding: "utf8",
      });
      if (res.error) continue; // binary not found -> try next candidate
      if (res.status === 0) {
        pgDump = dumpFile;
        log(`  ✔ pg_dump written: ${dumpFile}`);
        break;
      } else {
        log(`  ⚠ pg_dump (${bin}) exited ${res.status}: ${(res.stderr || "").split("\n")[0]}`);
      }
    } catch {
      /* try next */
    }
  }
  if (!pgDump) log("  ⚠ pg_dump unavailable/failed — relying on JSON snapshot for rollback.");

  return { jsonDir, pgDump, oldCounts };
}

// ---------------------------------------------------------------------------
// Step 2 — Apply schema migrations (idempotent)
// ---------------------------------------------------------------------------
async function applyMigrations() {
  const files = fs.readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith(".sql")).sort();
  for (const file of files) {
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), "utf8");
    // Migration files hold multiple statements; run raw and ignore the result set
    // (node-postgres returns an array with no `.rows` for multi-statement queries).
    await pool.query(sql);
    log(`  ✔ applied ${file}`);
  }
}

// ---------------------------------------------------------------------------
// Step 3 + 4 — Import in one transaction, reset sequences
// ---------------------------------------------------------------------------
async function importData(sqlite: Database.Database): Promise<Record<string, number>> {
  const inserted: Record<string, number> = {};
  await withTransaction(async (client) => {
    // One TRUNCATE for all source-backed tables. CASCADE stays within this set
    // (users/type_colors have no FK to these tables and are untouched).
    await client.query(`TRUNCATE ${ORDER.join(", ")} RESTART IDENTITY CASCADE`);
    log(`  ✔ truncated ${ORDER.length} source-backed tables (users/type_colors untouched)`);

    for (const cfg of TABLES) {
      const srcRows = sqlite.prepare(`SELECT * FROM "${cfg.src}"`).all() as Record<string, unknown>[];
      const targetCols = cfg.cols.map((c) => c.t);
      const mapped = srcRows.map((r) => mapRow(cfg, r));
      await bulkInsert(client, cfg.dst, targetCols, mapped);
      inserted[cfg.dst] = srcRows.length;
      log(`    • ${cfg.dst}: inserted ${srcRows.length}`);
    }

    // Reset serial sequences to MAX(id)+1 (is_called=false when the table is empty).
    for (const t of SERIAL_TABLES) {
      await client.query(
        `SELECT setval(pg_get_serial_sequence('${t}','id'),
                       GREATEST(COALESCE((SELECT MAX(id) FROM ${t}),0),1),
                       (SELECT MAX(id) FROM ${t}) IS NOT NULL)`
      );
    }
    log("  ✔ sequences reset to MAX(id)+1");
  });
  return inserted;
}

// ---------------------------------------------------------------------------
// Step 4 — Verify
// ---------------------------------------------------------------------------
async function verify(): Promise<{ counts: Record<string, number>; mismatches: string[]; orphans: string[] }> {
  const counts: Record<string, number> = {};
  const mismatches: string[] = [];
  for (const [table, expected] of Object.entries(EXPECTED_COUNTS)) {
    const actual = await countTable(table);
    counts[table] = actual;
    if (actual !== expected) mismatches.push(`${table}: צפוי ${expected}, בפועל ${actual}`);
  }
  const orphans: string[] = [];
  for (const fk of FK_CHECKS) {
    const pcol = fk.pcol ?? "id";
    const rows = await query<{ n: string }>(
      `SELECT COUNT(*)::int AS n FROM ${fk.child} c
        WHERE c.${fk.col} IS NOT NULL
          AND NOT EXISTS (SELECT 1 FROM ${fk.parent} p WHERE p.${pcol} = c.${fk.col})`
    );
    const n = Number(rows[0].n);
    if (n > 0) orphans.push(`${fk.child}.${fk.col} → ${fk.parent}.${pcol}: ${n} רשומות יתומות`);
  }
  return { counts, mismatches, orphans };
}

// ---------------------------------------------------------------------------
// Step 5 — Hebrew reconciliation report
// ---------------------------------------------------------------------------
function writeReport(args: {
  targetHost: string;
  targetDb: string;
  jsonDir: string;
  pgDump: string | null;
  oldCounts: Record<string, number>;
  newCounts: Record<string, number>;
  mismatches: string[];
  orphans: string[];
}): string {
  const { targetHost, targetDb, jsonDir, pgDump, oldCounts, newCounts, mismatches, orphans } = args;
  const reportFile = path.join(BACKUPS_DIR, `migration-report-${STAMP}.md`);
  const rel = (p: string) => path.relative(process.cwd(), p).replace(/\\/g, "/");

  const countRows = ORDER.map((t) => {
    const oldc = oldCounts[t] ?? 0;
    const newc = newCounts[t] ?? 0;
    const exp = EXPECTED_COUNTS[t];
    const ok = newc === exp ? "✔" : "✘";
    return `| ${t} | ${oldc} | ${newc} | ${exp} | ${ok} |`;
  }).join("\n");

  const lossyRows = lossy.length
    ? lossy.map((l) => `| ${l.table} | ${l.column} | \`${l.value}\` | ${l.note} |`).join("\n")
    : "| — | — | — | לא נמצאו המרות עם אובדן מידע |";

  const md = `# דו״ח התאמה — ייבוא נתונים מ-SQLite ל-Supabase/Postgres

**תאריך הרצה:** ${STAMP}
**מסד יעד:** \`${targetHost}\` / \`${targetDb}\`
**מקור:** \`DbToUpdate/certifications.db\` (WAL עבר checkpoint לפני קריאה)

---

## סטטוס כללי
${mismatches.length === 0 ? "✔ כל ספירות השורות תואמות למקור." : "✘ נמצאו אי-התאמות בספירת שורות (ראה למטה)."}
${orphans.length === 0 ? "✔ לא נמצאו הפניות FK יתומות." : "✘ נמצאו הפניות FK יתומות (ראה למטה)."}

---

## א. שינויי סכימה שהוחלו (Step 0/2)

הרצה זו מחילה את כל הקבצים תחת \`migrations/postgres/\` באופן אידמפוטנטי. רוב הטבלאות כבר היו קיימות ביעד; השינויים בפועל שנדרשו לסגירת הפער מול המקור (מיגרציה \`006_sqlite_import_gap.sql\`):

- **טבלה חדשה \`training_unit_hours\`** — קיימת במקור אך חסרה באפליקציה. \`hours REAL → NUMERIC\`, נשמרו ה-FK וה-UNIQUE של המקור.
- **\`training_sessions\`**: נוספו העמודות \`sub_framework\` ו-\`content\` (קיימות במקור, לא היו ביעד) כדי שלא יאבד מידע; \`start_time\`/\`end_time\` שוחררו מ-NOT NULL (במקור הן nullable).
- **\`course_colors\`**: נוספה \`created_at TIMESTAMPTZ\` (קיימת במקור, לא הייתה ביעד).

### מיפויים מיוחדים
- \`trainings.title\` (מקור) → \`trainings.name\` (יעד).
- \`certification_gap_values\` ו-\`influencing_factor_battalions\`: המפתח ה-surrogate \`id\` מהמקור **הושמט** (ביעד המפתח הראשי מורכב), הנתונים עצמם נשמרו במלואם.

### מה במקור שלא ניתן למפות ל-UI / נשאר ריק
- \`certifications.color_hex\` ו-\`trainings.color_hex\`: אין עמודת מקור — נשארות \`NULL\`. ה-UI (לוח שנה) נופל בחזרה לצבע מחושב, כך שאין פגיעה תפקודית.
- \`training_sessions.location\`, \`instructor_name\`, \`instructor_phone\`: אין עמודות מקור — נשארות \`NULL\`. המקור מספק במקומן \`sub_framework\`/\`content\` (נשמרו כעמודות חדשות, ה-UI הנוכחי עדיין לא קורא אותן).

### מחוץ לתחום (לא שונו ולא נמחקו)
- \`users\` (מערכת ההרשאות) ו-\`type_colors\` — אינן קיימות במקור ונשארו ללא שינוי.

---

## ב. ספירת שורות: לפני מול אחרי

| טבלה | לפני | אחרי | צפוי (מקור) | תקין |
|------|------|------|-------------|------|
${countRows}

${mismatches.length ? `**אי-התאמות:**\n${mismatches.map((m) => `- ${m}`).join("\n")}` : "*(אין אי-התאמות)*"}

---

## ג. המרות עם אובדן/שינוי מידע

עמודות דגל בוליאני (\`is_active\`, \`is_reserve\`, \`registration_open\`, \`is_read\`, \`has_prior_certification\`, \`meets_prerequisite\`, \`is_fulfilled\`) **נשמרו כ-SMALLINT 0/1** ולא הומרו ל-boolean — מכיוון שה-SQL של האפליקציה מסתמך על כך (למשל \`WHERE is_active = 1\`). זהו סטייה מכוונת מהבקשה המקורית כדי לא לשבור את האפליקציה.

עמודות תאריך/שעה טקסטואליות (\`created_at\`, \`updated_at\`, \`changed_at\`) הומרו ל-\`timestamptz\` בפרשנות UTC.

| טבלה | עמודה | ערך | הערה |
|------|-------|-----|------|
${lossyRows}

---

## ד. שלמות רפרנציאלית (FK)

${orphans.length ? orphans.map((o) => `- ✘ ${o}`).join("\n") : "✔ כל בדיקות ה-FK עברו — אין רשומות יתומות."}

---

## ה. טבלאות שה-UI קורא מהן ושהמבנה שלהן השתנה

- **\`training_sessions\`** — נוספו \`sub_framework\`/\`content\`; שורות מיובאות מכילות \`location\`/\`instructor_*\` ריקים. רכיבי ה-UI של ההדרכות ממשיכים לעבוד (העמודות nullable).
- **\`course_colors\`** — נוספה \`created_at\`; ה-repo (\`course-colors.ts\`) קורא רק \`name\`/\`color_hex\`, אין השפעה.
- **\`certifications\`/\`trainings\`** — \`color_hex\` ריק בשורות המיובאות; לוח השנה משתמש בצבע ברירת מחדל מחושב.

---

## ו. גיבוי ושחזור (Rollback)

**גיבוי JSON (נייד, מומלץ לשחזור):** \`${rel(jsonDir)}\`
${pgDump ? `**גיבוי pg_dump:** \`${rel(pgDump)}\`` : "**pg_dump:** לא נוצר (הסתמכות על גיבוי ה-JSON)."}

### שחזור מגיבוי ה-JSON (הדרך המומלצת — ללא כלים חיצוניים)
\`\`\`bash
tsx scripts/restore-backup.ts "${rel(jsonDir)}" --confirm
\`\`\`

${pgDump ? `### שחזור מלא מ-pg_dump (חלופה)
\`\`\`bash
pg_restore --clean --if-exists --no-owner --no-privileges -d "$DIRECT_URL" "${rel(pgDump)}"
\`\`\`
` : ""}
---

*הופק אוטומטית על ידי \`scripts/migrate-from-sqlite.ts\`.*
`;

  fs.writeFileSync(reportFile, md);
  return reportFile;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  if (!fs.existsSync(SOURCE_DB)) {
    console.error(`Source SQLite not found: ${SOURCE_DB}`);
    process.exit(1);
  }

  // Step 0 — open source, checkpoint WAL, print target.
  const sqlite = new Database(SOURCE_DB); // read-write so we can checkpoint
  try {
    sqlite.pragma("wal_checkpoint(TRUNCATE)");
  } catch (e) {
    console.warn("  ⚠ WAL checkpoint warning:", (e as Error).message);
  }

  const url = process.env.DATABASE_URL || "";
  let targetHost = "(unknown)";
  let targetDb = "(unknown)";
  try {
    const u = new URL(url);
    targetHost = u.hostname;
    targetDb = u.pathname.replace(/^\//, "");
  } catch { /* ignore */ }

  console.log("=".repeat(70));
  console.log("SQLite → Supabase/Postgres data migration");
  console.log(`  TARGET DATABASE: ${targetHost} / ${targetDb}`);
  console.log(`  SOURCE:          ${path.relative(process.cwd(), SOURCE_DB)}`);
  console.log("=".repeat(70));

  if (!CONFIRMED) {
    console.log("\nDRY RUN — no --confirm flag supplied. Nothing was changed.");
    console.log("This run WOULD: back up → apply migrations → TRUNCATE & re-import 18 tables.");
    console.log("Re-run with --confirm to execute.");
    sqlite.close();
    await (await import("../lib/db/client")).pool.end();
    return;
  }

  // Step 1 — Backup (HALT on failure).
  console.log("\n[1/5] Backup…");
  let backupResult;
  try {
    backupResult = await backup();
  } catch (e) {
    console.error("  ✘ BACKUP FAILED — aborting before any destructive action.");
    console.error(e);
    sqlite.close();
    process.exit(1);
  }

  // Step 2 — Schema migrations.
  console.log("\n[2/5] Applying schema migrations (idempotent)…");
  await applyMigrations();

  // Step 3 — Import in one transaction.
  console.log("\n[3/5] Importing data (single transaction)…");
  const newCountsInserted = await importData(sqlite);
  sqlite.close();

  // Step 4 — Verify.
  console.log("\n[4/5] Verifying row counts and referential integrity…");
  const { counts, mismatches, orphans } = await verify();
  for (const [t, expected] of Object.entries(EXPECTED_COUNTS)) {
    const mark = counts[t] === expected ? "✔" : "✘";
    console.log(`    ${mark} ${t}: ${counts[t]} (expected ${expected})`);
  }
  if (orphans.length) {
    console.log("  ⚠ Orphaned FKs:");
    orphans.forEach((o) => console.log(`    - ${o}`));
  } else {
    console.log("  ✔ No orphaned FKs.");
  }
  void newCountsInserted;

  // Step 5 — Report.
  console.log("\n[5/5] Writing reconciliation report…");
  const reportFile = writeReport({
    targetHost,
    targetDb,
    jsonDir: backupResult.jsonDir,
    pgDump: backupResult.pgDump,
    oldCounts: backupResult.oldCounts,
    newCounts: counts,
    mismatches,
    orphans,
  });
  console.log(`  ✔ Report: ${path.relative(process.cwd(), reportFile)}`);

  await (await import("../lib/db/client")).pool.end();

  console.log("\n" + "=".repeat(70));
  if (mismatches.length === 0 && orphans.length === 0) {
    console.log("✔ MIGRATION COMPLETE — all counts match, no orphaned FKs.");
  } else {
    console.log("⚠ MIGRATION COMPLETED WITH WARNINGS — see the report.");
    if (mismatches.length) process.exitCode = 2;
  }
  console.log("=".repeat(70));
}

main().catch((err) => {
  console.error("\n✘ MIGRATION FAILED (transaction rolled back if mid-import):");
  console.error(err);
  process.exit(1);
});
