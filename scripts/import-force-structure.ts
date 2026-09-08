import { config } from "dotenv";

config({ path: ".env.local" });

import { readdirSync, statSync, existsSync } from "node:fs";
import { join } from "node:path";
import {
  parseCompanyWorkbook,
  parseReferenceTable,
  parseCertificationVocabulary,
  normalizeCell,
  type ParsedCompany,
  type ParsedReferenceRow,
  type ParseIssue,
} from "../lib/import/parse-workbook";
import {
  loadCanonicalizer,
  canonicalizeRequirement,
  type Canonicalizer,
} from "../lib/import/canonical";

/**
 * Imports the force structure ("שניים לפנים") from the production workbooks.
 *
 *   npm run import:force-structure -- --dry-run
 *   npm run import:force-structure -- --battalion 5030
 *   npm run import:force-structure -- --force
 *
 * Two rules shape the whole script:
 *
 * 1. A post's requirements are static reference data (spec §0.3.1). `roles` and
 *    `role_assignments` are therefore written in SEPARATE TRANSACTIONS — if the importer
 *    wrote both at once it would itself be the counter-example to the invariant every
 *    other write path is held to.
 *
 * 2. Nothing is normalized silently. Every alias applied and every unrecognised
 *    certification name is printed, so that the next typo in the source is found rather
 *    than absorbed into a new, permanently unfillable certification.
 */

const DEFAULT_DATA_DIR =
  "C:/Bennys/IDF/GeneralSrc/Data/שבצק ברזל/שבצק ברזל - DATA";

const REFERENCE_FILE_MARKER = "תקן תפקידים והסמכות";

interface Options {
  dryRun: boolean;
  force: boolean;
  battalion: string | null;
  dataDir: string;
  json: boolean;
}

function parseArgs(argv: string[]): Options {
  const opts: Options = {
    dryRun: argv.includes("--dry-run"),
    force: argv.includes("--force"),
    battalion: null,
    dataDir: DEFAULT_DATA_DIR,
    json: argv.includes("--json"),
  };
  const battalionAt = argv.indexOf("--battalion");
  if (battalionAt !== -1 && argv[battalionAt + 1]) opts.battalion = argv[battalionAt + 1];
  const dirAt = argv.indexOf("--data-dir");
  if (dirAt !== -1 && argv[dirAt + 1]) opts.dataDir = argv[dirAt + 1];
  return opts;
}

interface ReferenceDiff {
  kind: "mismatch" | "missing" | "extra";
  battalionCode: string;
  companyName: string;
  serial: string;
  field?: string;
  reference?: string | null;
  sheet?: string | null;
  message: string;
}

interface UnknownName {
  raw: string;
  count: number;
  where: string;
}

/** Finds the battalion folders and their company workbooks. */
function discover(dataDir: string, only: string | null) {
  if (!existsSync(dataDir)) {
    throw new Error(`תיקיית הנתונים לא נמצאה: ${dataDir}`);
  }

  const referenceFile = readdirSync(dataDir).find(
    (f) => f.includes(REFERENCE_FILE_MARKER) && f.endsWith(".xlsx")
  );
  if (!referenceFile) {
    throw new Error(`לא נמצא קובץ טבלת הייחוס בתיקייה ${dataDir}`);
  }

  const battalions = readdirSync(dataDir)
    .filter((entry) => statSync(join(dataDir, entry)).isDirectory())
    .filter((entry) => (only ? entry === only : true))
    .map((code) => ({
      code,
      files: readdirSync(join(dataDir, code))
        .filter((f) => f.endsWith(".xlsx") && !f.startsWith("~$"))
        .map((f) => join(dataDir, code, f)),
    }))
    .filter((b) => b.files.length > 0);

  return { referenceFile: join(dataDir, referenceFile), battalions };
}

/**
 * Diffs a rifle company's posts against the establishment reference table.
 *
 * Only rifle companies are diffed: the reference table describes a light-infantry
 * company and has no counterpart for the support company, whose 139 posts across seven
 * departments are imported structurally and reported as un-diffed.
 */
function isDiffable(company: ParsedCompany, referenceSize: number): boolean {
  return company.kind === "rifle" && company.roles.length === referenceSize;
}

function diffAgainstReference(
  company: ParsedCompany,
  reference: Map<string, ParsedReferenceRow>,
  canonicalizer: Canonicalizer
): ReferenceDiff[] {
  const diffs: ReferenceDiff[] = [];
  // Serial numbers are only comparable when the two establishments have the same shape.
  // One rifle company in the real data carries an extra platoon (128 posts, five
  // departments), so from that platoon onward its serial N and the reference's serial N
  // describe different posts entirely — diffing them field by field would produce dozens
  // of "mismatches" that are really one structural difference. It is reported as
  // un-diffed instead, which is the honest description.
  if (!isDiffable(company, reference.size)) return diffs;

  const seen = new Set<string>();

  for (const role of company.roles) {
    seen.add(role.serial);
    const ref = reference.get(role.serial);
    if (!ref) {
      diffs.push({
        kind: "extra",
        battalionCode: company.battalionCode,
        companyName: company.name,
        serial: role.serial,
        message: `תקן ${role.serial} ("${role.roleName}") אינו קיים בטבלת הייחוס`,
      });
      continue;
    }

    // Requirements are compared AFTER alias resolution, so that a pure spelling
    // difference is reported once in the alias section rather than 20 times here as a
    // divergence. What remains in this list is a genuine disagreement about what the
    // post requires — which is the thing a human actually has to decide.
    const fields: [string, string | null, string | null][] = [
      ["role_name", ref.roleName, role.roleName],
      ["req1", canonicalizeRequirement(ref.req1, canonicalizer), canonicalizeRequirement(role.req1, canonicalizer)],
      ["req2", canonicalizeRequirement(ref.req2, canonicalizer), canonicalizeRequirement(role.req2, canonicalizer)],
    ];
    for (const [field, refValue, sheetValue] of fields) {
      if ((refValue ?? "") !== (sheetValue ?? "")) {
        diffs.push({
          kind: "mismatch",
          battalionCode: company.battalionCode,
          companyName: company.name,
          serial: role.serial,
          field,
          reference: refValue,
          sheet: sheetValue,
          message: `תקן ${role.serial} · ${field}`,
        });
      }
    }
  }

  for (const [serial, ref] of reference) {
    if (!seen.has(serial)) {
      diffs.push({
        kind: "missing",
        battalionCode: company.battalionCode,
        companyName: company.name,
        serial,
        message: `תקן ${serial} ("${ref.roleName}") קיים בטבלת הייחוס אך חסר בגיליון`,
      });
    }
  }

  return diffs;
}

function pad(value: string | number, width: number): string {
  return String(value).padEnd(width);
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const { referenceFile, battalions } = discover(opts.dataDir, opts.battalion);

  console.log(opts.dryRun ? "ייבוא מבנה כוח — הרצה יבשה (לא ייכתב דבר)" : "ייבוא מבנה כוח");
  console.log(`מקור: ${opts.dataDir}\n`);

  const referenceRows = parseReferenceTable(referenceFile);
  const reference = new Map(referenceRows.map((r) => [r.serial, r]));

  // A read, not a write: the dry run needs the alias table to report what the real
  // import would normalize. No transaction is opened here.
  const canonicalizer = await loadCanonicalizer();

  // Vocabulary the source itself declares. Used only to flag unrecognised values.
  const vocabulary = new Set<string>();
  const droneVocabulary = new Set<string>();

  const companies: ParsedCompany[] = [];
  const issues: ParseIssue[] = [];
  const diffs: ReferenceDiff[] = [];

  for (const battalion of battalions) {
    for (const file of battalion.files) {
      const company = parseCompanyWorkbook(file, battalion.code);
      companies.push(company);
      issues.push(...company.issues);
      diffs.push(...diffAgainstReference(company, reference, canonicalizer));

      const vocab = parseCertificationVocabulary(file);
      vocab.certifications.forEach((c) => vocabulary.add(c));
      vocab.droneModels.forEach((d) => droneVocabulary.add(d));
    }
  }

  // --- summary table -------------------------------------------------------
  console.log(`  ${pad("גדוד", 8)}${pad("פלוגה", 10)}${pad("סוג", 10)}${pad("תקנים", 8)}${pad("משובצים", 10)}${pad("בנק", 6)}הפרשים`);
  for (const c of companies) {
    const assigned = c.roles.filter((r) => r.assignment).length;
    const companyDiffs = diffs.filter(
      (d) => d.battalionCode === c.battalionCode && d.companyName === c.name
    ).length;
    const diffLabel = isDiffable(c, reference.size)
      ? String(companyDiffs)
      : c.kind === "support"
        ? "— אין טבלת ייחוס למסייעת"
        : `— מבנה חורג (${c.roles.length} תקנים מול ${reference.size} בייחוס)`;
    console.log(
      `  ${pad(c.battalionCode, 8)}${pad(c.name, 10)}${pad(c.kind === "rifle" ? "חי\"ר" : "מסייעת", 10)}` +
        `${pad(c.roles.length, 8)}${pad(assigned, 10)}${pad(c.bank.length, 6)}${diffLabel}`
    );
  }

  const totalRoles = companies.reduce((n, c) => n + c.roles.length, 0);
  const totalAssigned = companies.reduce((n, c) => n + c.roles.filter((r) => r.assignment).length, 0);
  const totalBank = companies.reduce((n, c) => n + c.bank.length, 0);
  console.log(`\n  סה"כ: ${totalRoles} תקנים · ${totalAssigned} משובצים · ${totalBank} בבנק\n`);

  // --- reference diffs -----------------------------------------------------
  if (diffs.length > 0) {
    console.log("── הפרשים מול טבלת הייחוס ──");
    const shown = diffs.slice(0, 40);
    for (const d of shown) {
      if (d.kind === "mismatch") {
        console.log(
          `  MISMATCH  ${d.battalionCode}/${d.companyName}  ${d.message}  ייחוס="${d.reference ?? ""}"  גיליון="${d.sheet ?? ""}"`
        );
      } else {
        console.log(`  ${d.kind.toUpperCase().padEnd(9)} ${d.battalionCode}/${d.companyName}  ${d.message}`);
      }
    }
    if (diffs.length > shown.length) {
      console.log(`  … ועוד ${diffs.length - shown.length} הפרשים (הרץ עם --json לרשימה המלאה)`);
    }
    console.log();
  }

  // --- unrecognised certification names ------------------------------------
  const unknown = new Map<string, UnknownName>();
  for (const c of companies) {
    const record = (raw: string, where: string) => {
      if (!raw) return;
      // Known to the source's own vocabulary, or covered by an alias that the import
      // will apply and that is listed in its own section below.
      if (vocabulary.has(raw) || droneVocabulary.has(raw) || canonicalizer.hasAlias(raw)) return;
      const existing = unknown.get(raw);
      if (existing) existing.count += 1;
      else unknown.set(raw, { raw, count: 1, where });
    };
    for (const role of c.roles) {
      for (const cert of role.assignment?.certifications ?? []) {
        record(cert.raw, `${c.battalionCode}/${c.name}/${role.department}`);
      }
      for (const req of [role.req1, role.req2, role.req3]) {
        if (req) {
          // Alternation is a syntax, not a name: check each side separately.
          for (const part of req.split(/\s*\/\s*/)) {
            record(normalizeCell(part), `${c.battalionCode}/${c.name}/${role.department} (דרישה)`);
          }
        }
      }
    }
    for (const soldier of c.bank) {
      for (const cert of soldier.certifications) record(cert.raw, `${c.battalionCode}/${c.name} (בנק)`);
    }
  }

  // Everything the import will rename, printed before it happens. Nothing is normalized
  // silently — that is how the next typo in the source gets found.
  const applied = canonicalizer.appliedAliases();
  if (applied.length > 0) {
    console.log("── שמות שיעברו נרמול (alias) ──");
    for (const a of applied) {
      console.log(`  "${a.raw}" → "${a.canonical}"  ×${a.count}  [${a.kind}]`);
    }
    console.log();
  }

  const quarantined = canonicalizer.quarantined();
  if (quarantined.length > 0) {
    console.log("── ערכים בהסגר (אינם הסמכות — לא ייכתבו) ──");
    for (const q of quarantined) console.log(`  "${q.raw}"  ×${q.count}`);
    console.log();
  }

  if (unknown.size > 0) {
    console.log("── שמות הסמכה שאינם ברשימת המקור ואין להם alias ──");
    for (const u of [...unknown.values()].sort((a, b) => b.count - a.count)) {
      console.log(`  "${u.raw}"  ×${u.count}  ${u.where}`);
    }
    console.log("  (יש להוסיף alias בטבלת certification_aliases, או לתקן במקור)\n");
  }

  // --- structural issues ---------------------------------------------------
  const blocking = issues.filter(
    (i) => i.kind === "missing_squad" || i.kind === "duplicate_serial" || i.kind === "malformed_header"
  );
  if (issues.length > 0) {
    console.log("── בעיות מבניות ──");
    for (const i of issues.slice(0, 30)) console.log(`  ${i.kind.padEnd(28)} ${i.message}`);
    if (issues.length > 30) console.log(`  … ועוד ${issues.length - 30}`);
    console.log();
  }

  if (opts.json) {
    console.log(JSON.stringify({ diffs, issues, unknown: [...unknown.values()] }, null, 2));
  }

  console.log(
    `סיכום: ${diffs.filter((d) => d.kind === "mismatch").length} MISMATCH · ` +
      `${diffs.filter((d) => d.kind === "missing").length} MISSING · ` +
      `${diffs.filter((d) => d.kind === "extra").length} EXTRA · ` +
      `${unknown.size} שמות לא מזוהים · ${issues.length} בעיות מבניות`
  );

  // --- gates ---------------------------------------------------------------
  //
  // A dry run stops here having opened no database connection at all.
  if (opts.dryRun) {
    console.log("\nהרצה יבשה — לא נכתב דבר.");
    return;
  }

  // These are never waived, not even by --force: without a squad the drone coverage in
  // §2.3 is silently wrong rather than absent, a duplicate serial breaks the identity of
  // a post, and a malformed header means we do not know what we parsed.
  if (blocking.length > 0) {
    console.error("\n❌ הייבוא נעצר: קיימות בעיות מבניות שאינן ניתנות לעקיפה גם עם --force.");
    for (const i of blocking.slice(0, 20)) console.error(`   ${i.message}`);
    process.exit(1);
  }

  if (diffs.length > 0 && !opts.force) {
    console.error("\n❌ הייבוא לא יבוצע — קיימים הפרשים מול טבלת הייחוס.");
    console.error("   תקן את המקור, או הרץ עם --force כדי לכתוב בכל זאת.");
    process.exit(1);
  }

  const { writeImport } = await import("../lib/import/write-force-structure");
  const result = await writeImport(companies, referenceRows, canonicalizer);
  console.log(
    `\n✅ נכתב: ${result.companies} פלוגות · ${result.roles} תקנים · ` +
      `${result.assignments} שיבוצים · ${result.bank} בבנק · ${result.certifications} הסמכות מוחזקות`
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
