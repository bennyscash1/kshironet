import { query } from "@/lib/db/client";
import type { CertificationStatus, RosterStatus } from "@/lib/types";

// Every function here takes an optional `battalionId`. It is supplied only for the two
// battalion-scoped roles (see getBattalionScope); when it is undefined the query is the
// original unfiltered one, so global roles keep their system-wide reports untouched.

/**
 * A certification "belongs" to a battalion when it has one of its soldiers on the roster,
 * or an allocation for it, or it is open to everyone — the same rule `listCertifications`
 * applies for its `battalionCode` filter, so the reports agree with the calendar.
 *
 * `$1` must be the battalion id.
 */
const CERT_BELONGS_TO_BATTALION = `(
  EXISTS (SELECT 1 FROM roster_entries re WHERE re.certification_id = c.id AND re.battalion_id = $1)
  OR EXISTS (SELECT 1 FROM certification_battalion_quotas q WHERE q.certification_id = c.id AND q.battalion_id = $1)
  OR c.registration_open = 1
)`;

/** `WHERE`/`AND` fragment plus params, empty when unscoped. */
function certScope(battalionId?: number): { clause: string; params: number[] } {
  return battalionId === undefined
    ? { clause: "", params: [] }
    : { clause: ` AND ${CERT_BELONGS_TO_BATTALION}`, params: [battalionId] };
}

export async function certificationsByMonth(battalionId?: number) {
  const { clause, params } = certScope(battalionId);
  return query(
    `SELECT TO_CHAR(c.start_date::date, 'YYYY-MM') as month, COUNT(*)::int as count
       FROM certifications c WHERE c.status != 'cancelled'${clause}
      GROUP BY month ORDER BY month`,
    params
  );
}

/**
 * Columns for the scoped variants. The full row (`c.*`) carries free text that can name
 * other units — `notes` ("גדוד 6228: 2 מקומות בעתודה"), `created_by_role`
 * (`battalion:9308`), `origin_request_id` — and the report renders none of it. Global
 * roles keep receiving `c.*` so their reports and Excel exports are byte-for-byte
 * unchanged.
 */
const REPORT_CERT_COLUMNS = "c.id, c.name, c.location, c.start_date, c.end_date, c.status";

export async function openForRegistration(battalionId?: number) {
  const { clause, params } = certScope(battalionId);
  const columns = battalionId === undefined ? "c.*" : REPORT_CERT_COLUMNS;
  return query(
    `SELECT ${columns} FROM certifications c WHERE c.status = 'open'${clause} ORDER BY c.start_date`,
    params
  );
}

export async function completedCertifications(battalionId?: number) {
  const { clause, params } = certScope(battalionId);
  const columns = battalionId === undefined ? "c.*" : REPORT_CERT_COLUMNS;
  return query(
    `SELECT ${columns} FROM certifications c WHERE c.status = 'completed'${clause} ORDER BY c.start_date DESC`,
    params
  );
}

export async function openRequestsByBattalion(battalionId?: number) {
  const scoped = battalionId !== undefined;
  return query(
    `SELECT b.name as battalion_name, b.color_hex, COUNT(*)::int as count
       FROM battalion_requests r
       JOIN battalions b ON b.id = r.battalion_id
       WHERE r.status NOT IN ('closed', 'rejected')${scoped ? " AND b.id = $1" : ""}
       GROUP BY b.id ORDER BY b.name`,
    scoped ? [battalionId] : []
  );
}

export async function gapsByBattalion(battalionId?: number) {
  const scoped = battalionId !== undefined;
  return query(
    `SELECT b.name as battalion_name, b.color_hex,
              SUM(r.quantity_needed)::int as total_requested,
              (SELECT COUNT(*)::int FROM roster_entries re
               WHERE re.battalion_id = b.id AND re.certification_id IS NOT NULL
                 AND re.status IN ('approved','participated','passed')) as fulfilled
       FROM battalion_requests r
       JOIN battalions b ON b.id = r.battalion_id
       WHERE r.status != 'closed'${scoped ? " AND b.id = $1" : ""}
       GROUP BY b.id ORDER BY b.name`,
    scoped ? [battalionId] : []
  );
}

/** One soldier on one certification — the unit of the "מי יוצא לאיזו הסמכה" report. */
export interface BattalionRosterReportRow {
  battalion_id: number;
  battalion_name: string;
  battalion_color: string;
  certification_id: number;
  certification_name: string;
  location: string | null;
  start_date: string;
  end_date: string | null;
  certification_status: CertificationStatus;
  full_name: string;
  personal_number: string;
  company_platoon: string | null;
  phone: string | null;
  status: RosterStatus;
  is_reserve: number;
}

export interface BattalionRosterReportFilters {
  /** Forced to the caller's own battalion for the two scoped roles; a free, optional
   * filter for the global roles (undefined = every battalion). */
  battalionId?: number;
  from?: string;
  to?: string;
}

/**
 * Which soldiers are going out to which certification. Rows are the join of a roster
 * entry, its certification and its battalion; request-stage soldiers (no certification
 * yet) and cancelled certifications are excluded.
 */
export async function battalionRosterReport(
  filters: BattalionRosterReportFilters = {}
): Promise<BattalionRosterReportRow[]> {
  const conditions = [
    "re.certification_id IS NOT NULL",
    "c.status != 'cancelled'",
  ];
  const params: (string | number)[] = [];

  if (filters.battalionId !== undefined) {
    conditions.push(`re.battalion_id = $${params.length + 1}`);
    params.push(filters.battalionId);
  }
  if (filters.from) {
    conditions.push(
      `(c.end_date >= $${params.length + 1} OR (c.end_date IS NULL AND c.start_date >= $${
        params.length + 2
      }))`
    );
    params.push(filters.from, filters.from);
  }
  if (filters.to) {
    conditions.push(`c.start_date <= $${params.length + 1}`);
    params.push(filters.to);
  }

  return query<BattalionRosterReportRow>(
    `SELECT b.id as battalion_id, b.name as battalion_name, b.color_hex as battalion_color,
            c.id as certification_id, c.name as certification_name, c.location,
            c.start_date, c.end_date, c.status as certification_status,
            re.full_name, re.personal_number, re.company_platoon, re.phone,
            re.status, re.is_reserve
       FROM roster_entries re
       JOIN certifications c ON c.id = re.certification_id
       JOIN battalions b ON b.id = re.battalion_id
      WHERE ${conditions.join(" AND ")}
      ORDER BY c.start_date DESC, c.id DESC, b.name, re.is_reserve, re.full_name`,
    params
  );
}

export async function rosterCounts(battalionId?: number) {
  // Scoped: only the certifications that are theirs, and only their own soldiers counted
  // in `registered_count` — the headline number must not include other battalions.
  const { clause, params } = certScope(battalionId);
  const joinScope = battalionId === undefined ? "" : " AND re.battalion_id = $1";
  return query(
    `SELECT c.id, c.name, c.location, c.start_date, COUNT(re.id)::int as registered_count
       FROM certifications c
       LEFT JOIN roster_entries re ON re.certification_id = c.id${joinScope}
       WHERE c.status != 'cancelled'${clause}
       GROUP BY c.id ORDER BY c.start_date DESC`,
    params
  );
}
