import { jsPDF } from "jspdf";
import { HEEBO_REGULAR_BASE64 } from "@/lib/pdf/fonts/heebo-regular";
import { HEEBO_BOLD_BASE64 } from "@/lib/pdf/fonts/heebo-bold";
import { CERTIFICATION_STATUS_LABELS } from "@/lib/types";
import { APP_NAME, APP_SLOGAN } from "@/lib/config/app";
import type { BattalionAllocation } from "@/lib/battalions/types";

/**
 * The battalion's weekly certification update, as a PDF the KAD can forward on.
 *
 * TWO THINGS MAKE HEBREW WORK HERE, and both are easy to get wrong:
 *
 * 1. AN EMBEDDED FONT. The 14 PDF standard fonts have no Hebrew glyphs at all — without
 *    embedding, every Hebrew character renders as a blank box. Heebo is embedded from
 *    lib/pdf/fonts (the same family the UI uses, so the export matches the screen).
 *
 * 2. VISUAL REORDERING. A PDF viewer does not run the bidi algorithm; it draws glyphs in
 *    the order the content stream lists them. Logical-order Hebrew would come out
 *    backwards. `doc.setR2L(true)` makes jsPDF run bidi and emit visual order, which also
 *    keeps embedded numbers and Latin runs (dates, "3/5", locations) the right way round —
 *    the reason for using its bidi engine rather than a naive string reverse, which
 *    mangles exactly those mixed runs.
 *
 * Hebrew needs no contextual shaping (unlike Arabic), so bidi plus an embedded font is the
 * whole requirement.
 */

const FONT_FILE_REGULAR = "Heebo-Regular.ttf";
const FONT_FILE_BOLD = "Heebo-Bold.ttf";
const FONT = "Heebo";

/** A4 landscape in mm — six columns of Hebrew need the width. */
const PAGE = { w: 297, h: 210 } as const;
const MARGIN = 12;
const LINE = 5.2;

/** Column widths, right to left as they are read. Sum must equal the printable width. */
const COLUMNS = [
  { key: "name", label: "שם ההסמכה", w: 74 },
  { key: "location", label: "מיקום/גורם מוסמך", w: 52 },
  { key: "start", label: "תאריך התחלה", w: 30 },
  { key: "end", label: "תאריך סיום", w: 30 },
  { key: "status", label: "סטטוס", w: 34 },
  { key: "fill", label: "הוקצו/שובצו", w: 53 },
] as const;

export interface WeeklyExportRow {
  name: string;
  location: string | null;
  start_date: string;
  end_date: string | null;
  status: BattalionAllocation["status"];
  allocated_slots: number | null;
  /**
   * The row's allocation mode when it is still an OPEN opportunity today, else null.
   *
   * It arrives from `listAllocationOpportunities` — the same set the dashboard band and
   * the calendar highlight read — rather than being re-derived here. The old local rule
   * (`has_quota && registered === 0`) answered a different question: it tinted an ended
   * cycle forever, never tinted a half-filled allocation the band was listing as open, and
   * could not see an open-to-all pool at all.
   */
  opportunity: "battalion_quota" | "open_to_all" | null;
  registered: number;
  has_quota: boolean;
}

export interface WeeklyExportInput {
  battalionCode: string;
  battalionName: string;
  /** Week bounds as 'yyyy-MM-dd', already resolved in Asia/Jerusalem by the caller. */
  from: string;
  to: string;
  rows: WeeklyExportRow[];
  /** 'dd.MM.yyyy HH:mm' stamp of when the export ran, in Asia/Jerusalem. */
  generatedAt: string;
}

/** 'yyyy-MM-dd' → 'dd.MM.yyyy'. Empty dash when there is no date. */
function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}.${m}.${y}`;
}

/**
 * The allocated/filled cell — the one column that carries the point of this report.
 *
 * A quota with nobody on it is spelled out rather than shown as "0/5", because "0/5" is
 * easy to skim past and this is precisely the line the KAD is being asked to act on. It
 * matches the amber state in the weekly view (AWAITING_NAMES.label there).
 */
function fillCell(row: WeeklyExportRow): string {
  if (row.opportunity === "open_to_all") {
    return `${row.registered} משובצים · הקצאה חטיבית פתוחה`;
  }
  if (!row.has_quota) return `${row.registered} משובצים · ללא הקצאה`;
  if (row.registered === 0) return `הוקצו ${row.allocated_slots ?? 0} — טרם שובצו שמות`;
  return `${row.registered}/${row.allocated_slots ?? 0} שובצו`;
}

/** The Hebrew block. Used to decide bidi per string — see `drawRight`. */
const HEBREW = /[֐-׿]/;

/**
 * Draws one right-aligned string, choosing bidi PER STRING.
 *
 * This is not a stylistic choice, it is a bug fix, and it was found by extracting the text
 * back out of a generated PDF rather than by assuming: with R2L on, jsPDF's bidi engine
 * reverses a run that contains no strong RTL character, so a cell holding only
 * "24.08.2026" was being painted "6202.80.42". A date inside a Hebrew sentence was always
 * fine — the engine handles embedded numbers correctly — so the fix is narrow: keep bidi
 * for anything carrying Hebrew, and draw digit-only cells left-to-right.
 *
 * Right alignment is unaffected by the R2L flag, so the column layout is identical either
 * way.
 */
function drawRight(doc: jsPDF, text: string, x: number, y: number): void {
  doc.setR2L(HEBREW.test(text));
  doc.text(text, x, y, { align: "right" });
}

function registerHebrewFont(doc: jsPDF): void {
  doc.addFileToVFS(FONT_FILE_REGULAR, HEEBO_REGULAR_BASE64);
  doc.addFont(FONT_FILE_REGULAR, FONT, "normal");
  doc.addFileToVFS(FONT_FILE_BOLD, HEEBO_BOLD_BASE64);
  doc.addFont(FONT_FILE_BOLD, FONT, "bold");
}

/**
 * Wraps one cell to the column width and returns its lines.
 *
 * `splitTextToSize` measures with the current font, so the font must already be set. It is
 * called per cell rather than trusting truncation because a course name routinely runs
 * past 74mm and a silently clipped name is worse than a two-line row.
 */
function wrap(doc: jsPDF, text: string, widthMm: number): string[] {
  return doc.splitTextToSize(text, widthMm - 4) as string[];
}

export function buildWeeklyCertificationsPdf(input: WeeklyExportInput): Uint8Array {
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  registerHebrewFont(doc);
  // Default to RTL for the document; `drawRight` flips it per string where a digit-only
  // cell would otherwise be reversed.
  doc.setR2L(true);

  // RTL: x is measured from the right edge, and every string is drawn with align "right".
  const right = PAGE.w - MARGIN;
  const printable = PAGE.w - MARGIN * 2;
  let y = MARGIN + 6;

  doc.setFont(FONT, "bold");
  doc.setFontSize(16);
  drawRight(doc, `${input.battalionName} (${input.battalionCode}) — עדכון הסמכות שבועי`, right, y);

  y += 6.5;
  doc.setFont(FONT, "normal");
  doc.setFontSize(10.5);
  doc.setTextColor(90);
  drawRight(doc, `לשבוע ${fmtDate(input.from)} — ${fmtDate(input.to)}`, right, y);

  y += 5;
  doc.setFontSize(8.5);
  doc.setTextColor(130);
  // Timezone is stated explicitly: the reader may be in another one, and a week boundary
  // that is off by a day changes which certifications are in the report.
  drawRight(doc, `${APP_NAME} · ${APP_SLOGAN} · הופק ${input.generatedAt} (שעון ישראל)`, right, y);
  doc.setTextColor(0);

  y += 6;

  if (input.rows.length === 0) {
    doc.setFont(FONT, "normal");
    doc.setFontSize(11);
    drawRight(doc, "אין הסמכות לגדוד בשבוע זה.", right, y + 6);
    return new Uint8Array(doc.output("arraybuffer"));
  }

  /** Draws the column headings and returns the y below them. Repeated on every page. */
  function header(atY: number): number {
    doc.setFillColor(243, 244, 246);
    doc.rect(MARGIN, atY, printable, 8, "F");
    doc.setFont(FONT, "bold");
    doc.setFontSize(9.5);
    let x = right;
    for (const col of COLUMNS) {
      drawRight(doc, col.label, x - 2, atY + 5.5);
      x -= col.w;
    }
    doc.setDrawColor(203, 213, 225);
    doc.line(MARGIN, atY + 8, right, atY + 8);
    return atY + 8;
  }

  y = header(y);

  doc.setFont(FONT, "normal");
  doc.setFontSize(9);

  for (const row of input.rows) {
    const cells: Record<string, string> = {
      name: row.name,
      location: row.location || "—",
      start: fmtDate(row.start_date),
      end: fmtDate(row.end_date),
      status: CERTIFICATION_STATUS_LABELS[row.status] ?? row.status,
      fill: fillCell(row),
    };
    const wrapped = COLUMNS.map((c) => wrap(doc, cells[c.key], c.w));
    const rowHeight = Math.max(...wrapped.map((l) => l.length)) * LINE + 3;

    // Page break BEFORE drawing, so a row is never split across two pages.
    if (y + rowHeight > PAGE.h - MARGIN) {
      doc.addPage();
      y = header(MARGIN + 4);
      doc.setFont(FONT, "normal");
      doc.setFontSize(9);
    }

    // Exactly the rows the band lists and the calendar paints, in exactly the two colours
    // it paints them: amber for the battalion's own allocation, sky for the brigade-wide
    // pool. Expired cycles carry no `opportunity` and so print untinted, matching the
    // screen. amber-100 (#fef3c7) / sky-100 (#e0f2fe).
    if (row.opportunity === "battalion_quota") {
      doc.setFillColor(254, 243, 199);
      doc.rect(MARGIN, y, printable, rowHeight, "F");
    } else if (row.opportunity === "open_to_all") {
      doc.setFillColor(224, 242, 254);
      doc.rect(MARGIN, y, printable, rowHeight, "F");
    }

    let x = right;
    wrapped.forEach((lines, i) => {
      lines.forEach((line, li) => {
        drawRight(doc, line, x - 2, y + 4.6 + li * LINE);
      });
      x -= COLUMNS[i].w;
    });

    y += rowHeight;
    doc.setDrawColor(226, 232, 240);
    doc.line(MARGIN, y, right, y);
  }

  // Page numbers, added last so the total is known.
  const pages = doc.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p);
    doc.setFont(FONT, "normal");
    doc.setFontSize(8);
    doc.setTextColor(130);
    doc.text(`עמוד ${p} מתוך ${pages}`, PAGE.w / 2, PAGE.h - 6, { align: "center" });
  }

  return new Uint8Array(doc.output("arraybuffer"));
}
