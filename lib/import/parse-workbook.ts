import * as XLSX from "xlsx";

/**
 * Parser for the force-structure source workbooks ("שבצק ברזל").
 *
 * Kept separate from the import script so it can be tested against the real files
 * without a database, and so the diff report and the writer read the same structures.
 *
 * The workbooks come in two shapes: a rifle company (99 posts, four departments, two
 * requirement columns) and the support company (139 posts, seven departments, THREE
 * requirement columns, which shifts every later column by one). Rather than branch on
 * the shape, every column is located BY ITS HEADER LABEL — that is what makes one code
 * path handle both, and what stops a future column insertion from silently shifting the
 * data by one.
 */

/** Sheets that are not departments. */
const NON_DEPARTMENT_SHEETS = ["מבט על", "רשימות", "פערי הסמכה"];

/** Marks the start of the 120% bank block inside a department sheet. */
const BANK_MARKER = "120%";

/** Marks the end of the establishment block. The row AFTER it holds the establishment
 * size as a NUMBER, which looks exactly like a serial — reading past this row is what
 * turns 99 posts into 103. */
const ESTABLISHMENT_FOOTER = "תקן";

/** Squad separator rows look like "  ◄  כיתה א' מסתערת". */
const SQUAD_MARKER = "◄";

const REQUIREMENT_LABEL = /^הסמכה מחייבת \d+$/;
const HELD_FLAG_LABEL = "מוסמך";
const HELD_YES = "כן";

export type CompanyKind = "rifle" | "support";

export interface ParsedHeldCertification {
  /** Exactly what the cell said, before alias resolution. */
  raw: string;
}

export interface ParsedSoldier {
  /** Null when the post is flagged manned but records nobody. */
  fullName: string | null;
  /** Null when the source has no personal number yet. The personal number is the join key
   * for held certifications and every soldier lookup, so a placeholder would silently
   * match the wrong person — it stays null and the row is flagged instead. */
  personalNumber: string | null;
  pendingName: boolean;
  pendingPn: boolean;
  certifications: ParsedHeldCertification[];
}

export interface ParsedRole {
  serial: string;
  department: string;
  squad: string | null;
  roleName: string;
  req1: string | null;
  req2: string | null;
  req3: string | null;
  deptSort: number;
  squadSort: number;
  rowSort: number;
  /** The soldier occupying the post, or null for an empty post. */
  assignment: ParsedSoldier | null;
  /** The source's "משובץ" flag: is this post actually manned? It overrides name presence
   * in both directions, and it is what each battalion's own summary counts. */
  isPosted: boolean;
  /** The workbook's own status colour. Informational only — status is recomputed from
   * the requirements, so a stale colour in the source cannot mislead the app. */
  statusColor: string | null;
}

export interface ParsedBankSoldier extends ParsedSoldier {
  /** A bank row is only a person if it has a name. */
  fullName: string;
  department: string;
  /** Free text from the source ("frozen for a year", "abroad", "to be discharged").
   * Never a date, which is why it lands in `note` rather than `unavailable_until`. */
  note: string | null;
}

export type ParseIssueKind =
  | "malformed_header"
  | "missing_squad"
  | "duplicate_serial"
  | "squad_mismatch"
  | "role_without_name"
  | "assignment_without_personal_number"
  | "posted_without_soldier"
  | "bank_row_without_personal_number";

export interface ParseIssue {
  kind: ParseIssueKind;
  sheet: string;
  row: number;
  serial?: string;
  message: string;
}

export interface ParsedCompany {
  /** Battalion code taken from the containing folder, e.g. "5030". */
  battalionCode: string;
  /** Company code taken from the file name, e.g. "א" or "מסייעת". */
  code: string;
  name: string;
  kind: CompanyKind;
  departments: string[];
  roles: ParsedRole[];
  bank: ParsedBankSoldier[];
  issues: ParseIssue[];
}

export interface ParsedReferenceRow {
  department: string;
  serial: string;
  roleName: string;
  req1: string | null;
  req2: string | null;
  req3: string | null;
  provenance: string | null;
}

type Row = unknown[];

/**
 * Normalizes a source cell to comparable text.
 *
 * The production data mixes the Hebrew gershayim/geresh punctuation (U+05F4 / U+05F3)
 * with ASCII quotes for the same abbreviation, so `סמ״פ` and `סמ"פ` would otherwise be
 * two different certifications. Whitespace is collapsed because many cells carry a
 * trailing space from manual entry.
 */
export function normalizeCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value)
    .normalize("NFC")
    .replace(/״/g, '"')
    .replace(/׳/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

/** A serial is a bare positive integer. Anything else — a label, a percentage, a
 * formula result — is not a post. */
function asSerial(value: unknown): string | null {
  const text = normalizeCell(value);
  return /^\d+$/.test(text) ? text : null;
}

interface HeaderMap {
  headerRow: number;
  serial: number;
  roleName: number;
  requirements: number[];
  firstName: number;
  lastName: number;
  personalNumber: number;
  /** [name column, "certified?" column] pairs. */
  certPairs: [number, number][];
  notes: number;
  assigned: number;
  squad: number;
  color: number;
}

/**
 * Locates every column by its header label.
 *
 * The two trailing columns (squad and status colour) are labelled in the support
 * workbooks and unlabelled in the rifle ones, so they are addressed by their position
 * relative to "משובץ", which is labelled in both.
 */
function findHeader(rows: Row[], sheet: string): HeaderMap | null {
  for (let i = 0; i < 12 && i < rows.length; i++) {
    const row = rows[i] ?? [];
    const labels = row.map(normalizeCell);
    const assigned = labels.indexOf("משובץ");
    if (assigned === -1) continue;

    const requirements = labels
      .map((label, index) => (REQUIREMENT_LABEL.test(label) ? index : -1))
      .filter((index) => index !== -1);

    // Requirements come exclusively from columns whose header matches "הסמכה מחייבת N".
    // A legacy sheet without them is refused rather than guessed at, so that a stray
    // column can never be imported as a requirement (spec §2.2).
    if (requirements.length === 0) return null;

    const certPairs = labels
      .map((label, index): [number, number] | null =>
        label === HELD_FLAG_LABEL && index > 0 ? [index - 1, index] : null
      )
      .filter((pair): pair is [number, number] => pair !== null);

    const roleName = labels.indexOf("תפקיד");
    const personalNumber = labels.indexOf("מ.א.");
    if (roleName === -1 || personalNumber === -1) return null;

    return {
      headerRow: i,
      serial: 0,
      roleName,
      requirements,
      firstName: labels.indexOf("שם פרטי"),
      lastName: labels.indexOf("שם משפחה"),
      personalNumber,
      certPairs,
      notes: labels.indexOf("הערות"),
      assigned,
      squad: assigned + 1,
      color: assigned + 2,
    };
  }
  void sheet;
  return null;
}

/**
 * Reads the occupant of a row.
 *
 * `posted` is the source's own manning flag. When a post is flagged manned but records no
 * identity at all, an occupant is still returned — flagged `pendingName` — because the
 * battalion counts that post as filled and dropping it would shrink the head-count below
 * what every one of their own reports shows.
 */
function readSoldier(row: Row, header: HeaderMap, posted: boolean): ParsedSoldier | null {
  const first = header.firstName === -1 ? "" : normalizeCell(row[header.firstName]);
  const last = header.lastName === -1 ? "" : normalizeCell(row[header.lastName]);
  const personalNumber = normalizeCell(row[header.personalNumber]);
  const fullName = [first, last].filter(Boolean).join(" ").trim();

  if (!personalNumber && !fullName && !posted) return null;

  const certifications: ParsedHeldCertification[] = [];
  for (const [nameCol, flagCol] of header.certPairs) {
    const raw = normalizeCell(row[nameCol]);
    // A name with no "כן" is a course the soldier is slated for, not one they hold.
    if (raw && normalizeCell(row[flagCol]) === HELD_YES) certifications.push({ raw });
  }

  return {
    fullName: fullName === "" ? null : fullName,
    personalNumber: personalNumber === "" ? null : personalNumber,
    pendingName: fullName === "",
    pendingPn: personalNumber === "",
    certifications,
  };
}

/** The workbook is authoritative for what a requirement says; blank cells become null so
 * they do not read as an empty-string requirement nothing can satisfy. */
function readRequirement(row: Row, index: number | undefined): string | null {
  if (index === undefined) return null;
  const text = normalizeCell(row[index]);
  return text === "" ? null : text;
}

/**
 * Parses one department sheet, appending to the company's accumulators.
 *
 * Walks the sheet as a small state machine: the establishment block, then the footer,
 * then the 120% bank. The blocks are separated by markers rather than by row counts,
 * because every sheet has a different number of posts.
 */
function parseDepartmentSheet(
  rows: Row[],
  sheet: string,
  deptIndex: number,
  out: { roles: ParsedRole[]; bank: ParsedBankSoldier[]; issues: ParseIssue[] }
): boolean {
  const header = findHeader(rows, sheet);
  if (!header) {
    out.issues.push({
      kind: "malformed_header",
      sheet,
      row: 0,
      message: `לא נמצאה שורת כותרת תקינה בגיליון "${sheet}" (נדרשות עמודות "משובץ" ו-"הסמכה מחייבת N")`,
    });
    return false;
  }

  let mode: "establishment" | "between" | "bank" = "establishment";
  let currentSquad: string | null = null;
  let squadIndex = -1;
  let rowSort = 0;
  const seenSerials = new Set<string>();

  for (let i = header.headerRow + 1; i < rows.length; i++) {
    const row = rows[i] ?? [];
    const firstCell = normalizeCell(row[0]);

    if (firstCell.startsWith(ESTABLISHMENT_FOOTER) && mode === "establishment") {
      mode = "between";
      continue;
    }
    if (firstCell.includes(BANK_MARKER)) {
      mode = "bank";
      continue;
    }

    if (mode === "establishment") {
      if (firstCell.includes(SQUAD_MARKER)) {
        currentSquad = firstCell.replace(SQUAD_MARKER, "").trim() || null;
        squadIndex += 1;
        continue;
      }

      const serial = asSerial(row[0]);
      if (!serial) continue;

      const roleName = normalizeCell(row[header.roleName]);
      if (!roleName) {
        out.issues.push({
          kind: "role_without_name",
          sheet,
          row: i,
          serial,
          message: `תקן ${serial} בגיליון "${sheet}" ללא שם תפקיד`,
        });
        continue;
      }

      if (seenSerials.has(serial)) {
        out.issues.push({
          kind: "duplicate_serial",
          sheet,
          row: i,
          serial,
          message: `מספר תקן כפול ${serial} בגיליון "${sheet}"`,
        });
        continue;
      }
      seenSerials.add(serial);

      if (!currentSquad) {
        out.issues.push({
          kind: "missing_squad",
          sheet,
          row: i,
          serial,
          message: `תקן ${serial} בגיליון "${sheet}" אינו משויך לחוליה — לא ניתן לחשב כיסוי רחפן`,
        });
      }

      // The per-row squad column agrees with the separator in the establishment block,
      // but holds unrelated values elsewhere in the sheet. The running separator is
      // authoritative; a disagreement is reported rather than silently preferred.
      const rowSquad = header.squad === -1 ? "" : normalizeCell(row[header.squad]);
      if (currentSquad && rowSquad && rowSquad !== currentSquad) {
        out.issues.push({
          kind: "squad_mismatch",
          sheet,
          row: i,
          serial,
          message: `תקן ${serial}: החוליה בשורה ("${rowSquad}") שונה מכותרת החוליה ("${currentSquad}")`,
        });
      }

      const isPosted = header.assigned === -1 || normalizeCell(row[header.assigned]) === HELD_YES;
      const assignment = readSoldier(row, header, isPosted);

      // A soldier with no personal number is still counted, but cannot be linked to the
      // certifications they hold, cannot be found by lookup, and is not assignable to a
      // course. Report it rather than letting it pass unnoticed.
      if (assignment?.pendingPn && !assignment.pendingName) {
        out.issues.push({
          kind: "assignment_without_personal_number",
          sheet,
          row: i,
          serial,
          message: `תקן ${serial}: "${assignment.fullName}" ללא מספר אישי — ייספר במצבה אך לא יהיה בר-שיבוץ`,
        });
      }
      // Flagged manned with nobody recorded at all.
      if (assignment?.pendingName) {
        out.issues.push({
          kind: "posted_without_soldier",
          sheet,
          row: i,
          serial,
          message: `תקן ${serial}: מסומן כמשובץ אך לא נרשם בו חייל — ייספר כמאויש, ללא זהות`,
        });
      }

      out.roles.push({
        serial,
        department: sheet,
        squad: currentSquad,
        roleName,
        req1: readRequirement(row, header.requirements[0]),
        req2: readRequirement(row, header.requirements[1]),
        req3: readRequirement(row, header.requirements[2]),
        deptSort: deptIndex,
        squadSort: Math.max(squadIndex, 0),
        rowSort: rowSort++,
        assignment,
        isPosted,
        statusColor: header.color === -1 ? null : normalizeCell(row[header.color]) || null,
      });
      continue;
    }

    if (mode === "bank") {
      // The bank block repeats the two header rows; skip them and the blank placeholder
      // rows that pad the block out to a fixed height.
      if (firstCell === "#" || row.map(normalizeCell).includes("משובץ")) continue;
      const soldier = readSoldier(row, header, false);
      // A bank row needs a name to be a person; the personal number may be pending, and
      // the bank count must include those or it drops below the battalion's own figure.
      if (!soldier || !soldier.fullName) continue;

      if (soldier.pendingPn) {
        out.issues.push({
          kind: "bank_row_without_personal_number",
          sheet,
          row: i,
          message: `בנק 120%: "${soldier.fullName}" ללא מספר אישי — ייספר בבנק אך לא יהיה בר-שיבוץ`,
        });
      }

      out.bank.push({
        ...soldier,
        fullName: soldier.fullName,
        department: sheet,
        note: header.notes === -1 ? null : normalizeCell(row[header.notes]) || null,
      });
    }
  }

  return true;
}

/** Company code and kind from a file name like "5030 - פלוגה א.xlsx". */
export function companyFromFileName(fileName: string): { code: string; name: string; kind: CompanyKind } {
  const base = fileName.replace(/\.xlsx$/i, "");
  const name = normalizeCell(base.split(" - ").slice(1).join(" - ")) || normalizeCell(base);
  const kind: CompanyKind = name.includes("מסייעת") ? "support" : "rifle";
  const code = name.replace(/^פלוגה\s*/, "").trim() || name;
  return { code, name, kind };
}

/** Parses one company workbook into roles, assignments, bank soldiers and issues. */
export function parseCompanyWorkbook(filePath: string, battalionCode: string): ParsedCompany {
  const fileName = filePath.split(/[\\/]/).pop() ?? filePath;
  const { code, name, kind } = companyFromFileName(fileName);
  const workbook = XLSX.readFile(filePath);

  const out = {
    roles: [] as ParsedRole[],
    bank: [] as ParsedBankSoldier[],
    issues: [] as ParseIssue[],
  };
  const departments: string[] = [];

  for (const sheet of workbook.SheetNames) {
    const label = normalizeCell(sheet);
    if (NON_DEPARTMENT_SHEETS.includes(label)) continue;
    // Stray empty sheets left behind in some workbooks.
    if (/^Sheet\d+$/i.test(label)) continue;

    const rows = XLSX.utils.sheet_to_json<Row>(workbook.Sheets[sheet], {
      header: 1,
      defval: "",
    });
    const parsed = parseDepartmentSheet(rows, label, departments.length, out);
    if (parsed) departments.push(label);
  }

  return { battalionCode, code, name, kind, departments, roles: out.roles, bank: out.bank, issues: out.issues };
}

/**
 * The certification and drone-model vocabulary from a workbook's "רשימות" sheet.
 *
 * This is what the source itself considers a valid certification name, and it is the
 * yardstick the importer measures held-certification cells against: a value outside it
 * is reported as unrecognised rather than quietly becoming a new certification with a
 * permanent gap attached.
 */
export function parseCertificationVocabulary(filePath: string): {
  certifications: string[];
  droneModels: string[];
} {
  const workbook = XLSX.readFile(filePath);
  const sheet = workbook.Sheets["רשימות"];
  if (!sheet) return { certifications: [], droneModels: [] };

  const rows = XLSX.utils.sheet_to_json<Row>(sheet, { header: 1, defval: "" });
  const certifications = new Set<string>();
  const droneModels = new Set<string>();

  for (const row of rows) {
    const cert = normalizeCell(row[0]);
    const drone = normalizeCell(row[1]);
    // The two columns carry their own headings ("הסמכות" / "רחפנים") and a trailing
    // generic "רחפן" token, none of which are model names.
    if (cert && cert !== "הסמכות") certifications.add(cert);
    if (drone && drone !== "רחפנים" && drone !== "רחפן") droneModels.add(drone);
  }

  return { certifications: [...certifications], droneModels: [...droneModels] };
}

/** Parses the establishment reference table ("טבלת הייחוס"). */
export function parseReferenceTable(filePath: string): ParsedReferenceRow[] {
  const workbook = XLSX.readFile(filePath);
  const rows = XLSX.utils.sheet_to_json<Row>(workbook.Sheets[workbook.SheetNames[0]], {
    header: 1,
    defval: "",
  });

  const out: ParsedReferenceRow[] = [];
  for (const row of rows.slice(1)) {
    const serial = asSerial(row[1]);
    if (!serial) continue;
    const roleName = normalizeCell(row[2]);
    if (!roleName) continue;
    out.push({
      department: normalizeCell(row[0]),
      serial,
      roleName,
      req1: normalizeCell(row[3]) || null,
      req2: normalizeCell(row[4]) || null,
      req3: null,
      provenance: normalizeCell(row[5]) || null,
    });
  }
  return out;
}
