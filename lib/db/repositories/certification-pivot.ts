import { query } from "@/lib/db/client";
import {
  addToPivotTally,
  emptyPivotTally,
  pivotCountOutcomeOf,
  type PivotCountOutcome,
  type PivotCountTally,
} from "@/lib/reports/pivot-counting-rule";

/** One battalion's column in the pivot chart. Every figure here is derived from the
 * per-soldier rows below through {@link pivotCountOutcomeOf} — there is no separate
 * aggregation rule that could disagree with the detail table. */
export interface BattalionSoldierCount extends PivotCountTally {
  battalion_id: number;
  battalion_code: string;
  battalion_name: string;
  color_hex: string;
}

/** One soldier on one of the selected certifications, carrying their OWN roster status. */
export interface PivotSoldierRow {
  roster_entry_id: number;
  battalion_id: number;
  battalion_name: string;
  color_hex: string;
  certification_id: number;
  certification_name: string;
  full_name: string;
  personal_number: string;
  /** Raw `roster_entries.status`. Typed as a loose string because the column is plain
   * `text` with no CHECK before migration 026 — a legacy value must reach the UI as
   * "unknown", not be silently narrowed to a member of the union. */
  status: string;
  is_reserve: number;
  outcome: PivotCountOutcome;
}

/** What the פילוח הסמכות report returns: the bars and the rows behind them. */
export interface PivotReport {
  rows: BattalionSoldierCount[];
  soldiers: PivotSoldierRow[];
}

export interface PivotFilters {
  battalionIds: number[];
  certificationIds: number[];
  /** Inclusive lower bound on the certification's start date (yyyy-MM-dd). */
  fromDate: string;
  /** Inclusive upper bound on the certification's start date. null = open-ended. */
  toDate?: string | null;
}

/**
 * The פילוח הסמכות report: every soldier on the selected certifications, with their own
 * roster status, plus the per-battalion tallies derived from exactly those rows.
 *
 * WHICH ROWS COUNT is a per-soldier decision taken in exactly one place —
 * lib/reports/pivot-counting-rule.ts — and applied here to build the bars, so the chart,
 * the header and the detail table cannot disagree. The certification's own status is never
 * consulted: a cycle marked "בוצעה" says the cycle ran, not what any one soldier did.
 *
 * NOTE ON RESERVE: this report subjects a עתודה row to the same status test as any other,
 * so reserve appears in both the numerator and the denominator here. That is this report's
 * rule alone — capacity, quota and gaps math are untouched and still exclude reserve.
 *
 * ONE QUERY, driven off `battalions` so a selected battalion with no matching soldiers
 * still comes back as a bar of zero.
 *
 * THE CERTIFICATION FILTERS LIVE INSIDE THE DERIVED TABLE, not in the outer WHERE. That is
 * load-bearing: filtering after the LEFT JOIN turns it back into an inner join, and a
 * battalion whose only roster rows fall outside the date window then vanishes from the
 * chart instead of showing an honest zero.
 */
export async function runPivotReport(filters: PivotFilters): Promise<PivotReport> {
  const rows = await query<{
    battalion_id: number;
    battalion_code: string;
    battalion_name: string;
    color_hex: string;
    roster_entry_id: number | null;
    certification_id: number | null;
    certification_name: string | null;
    full_name: string | null;
    personal_number: string | null;
    status: string | null;
    is_reserve: number | null;
  }>(
    `SELECT b.id AS battalion_id,
            b.code AS battalion_code,
            b.name AS battalion_name,
            b.color_hex,
            sr.roster_entry_id,
            sr.certification_id,
            sr.certification_name,
            sr.full_name,
            sr.personal_number,
            sr.status,
            sr.is_reserve
       FROM battalions b
       LEFT JOIN (
         SELECT re.battalion_id,
                re.id AS roster_entry_id,
                re.full_name, re.personal_number, re.status, re.is_reserve,
                c.id AS certification_id, c.name AS certification_name, c.start_date
           FROM roster_entries re
           JOIN certifications c ON c.id = re.certification_id
          WHERE re.certification_id = ANY($2::int[])
            AND c.start_date::date >= $3::date
            AND ($4::date IS NULL OR c.start_date::date <= $4::date)
       ) sr ON sr.battalion_id = b.id
      WHERE b.id = ANY($1::int[])
      ORDER BY b.code, sr.start_date DESC, sr.certification_id, sr.is_reserve, sr.full_name`,
    [filters.battalionIds, filters.certificationIds, filters.fromDate, filters.toDate ?? null]
  );

  const tallies = new Map<number, BattalionSoldierCount>();
  const soldiers: PivotSoldierRow[] = [];

  for (const row of rows) {
    let tally = tallies.get(row.battalion_id);
    if (!tally) {
      tally = {
        battalion_id: row.battalion_id,
        battalion_code: row.battalion_code,
        battalion_name: row.battalion_name,
        color_hex: row.color_hex,
        ...emptyPivotTally(),
      };
      tallies.set(row.battalion_id, tally);
    }

    // The battalion-with-no-soldiers row: it exists to produce a zero bar, and carries no
    // soldier to bucket.
    if (row.roster_entry_id === null || row.certification_id === null) continue;

    const outcome = pivotCountOutcomeOf(row);
    addToPivotTally(tally, outcome, row.is_reserve === 1);
    soldiers.push({
      roster_entry_id: row.roster_entry_id,
      battalion_id: row.battalion_id,
      battalion_name: row.battalion_name,
      color_hex: row.color_hex,
      certification_id: row.certification_id,
      certification_name: row.certification_name ?? "",
      full_name: row.full_name ?? "",
      personal_number: row.personal_number ?? "",
      status: row.status ?? "",
      is_reserve: row.is_reserve ?? 0,
      outcome,
    });
  }

  return { rows: [...tallies.values()], soldiers };
}

export interface PivotCertificationOption {
  id: number;
  name: string;
  start_date: string;
}

/** A תחום (domain) and the certifications inside it, for the widget's pickers. */
export interface PivotDomainOption {
  domain: string;
  certifications: PivotCertificationOption[];
}

/** Label for certifications with no domain set, so they are still selectable. */
export const NO_DOMAIN_LABEL = "ללא תחום";

/** Distinct values of `certifications.domain` — the תחום column. */
export async function listDomains(): Promise<string[]> {
  const rows = await query<{ domain: string }>(
    `SELECT DISTINCT TRIM(domain) AS domain
       FROM certifications
      WHERE domain IS NOT NULL AND TRIM(domain) <> ''
      ORDER BY domain`
  );
  return rows.map((r) => r.domain);
}

/** Every domain with its certifications (id + name), grouped for the pickers.
 * Certifications without a domain are grouped under NO_DOMAIN_LABEL rather than
 * dropped, so nothing is unreachable from the UI. */
export async function listDomainsWithCertifications(): Promise<PivotDomainOption[]> {
  const rows = await query<{ domain: string | null; id: number; name: string; start_date: string }>(
    `SELECT NULLIF(TRIM(c.domain), '') AS domain, c.id, c.name, c.start_date
       FROM certifications c
      ORDER BY domain NULLS LAST, c.start_date DESC, c.name`
  );

  const byDomain = new Map<string, PivotCertificationOption[]>();
  for (const row of rows) {
    const key = row.domain ?? NO_DOMAIN_LABEL;
    if (!byDomain.has(key)) byDomain.set(key, []);
    byDomain.get(key)!.push({ id: row.id, name: row.name, start_date: row.start_date });
  }
  return [...byDomain.entries()].map(([domain, certifications]) => ({ domain, certifications }));
}
