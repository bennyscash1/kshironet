import { execute, query, queryOne, withTransaction } from "@/lib/db/client";
import {
  computeGapRow,
  computeRequired,
  keyText,
  type GapRowNumbers,
  type RequirementKeyLine,
  type UnitCounts,
} from "@/lib/gaps/compute";
import type {
  CertificationFamily,
  ComputedGapRow,
  GapKeyLine,
  UnitTypeRow,
} from "@/lib/gaps/types";

export type {
  CertificationFamily,
  ComputedGapRow,
  GapKeyLine,
  UnitTypeRow,
} from "@/lib/gaps/types";
export { unitCountsMap, unitNamesMap } from "@/lib/gaps/types";

export async function listCertificationFamilies(): Promise<CertificationFamily[]> {
  return query<CertificationFamily>(
    `SELECT id, name, ink, line, bg, sort_order FROM certification_families ORDER BY sort_order, id`
  );
}

export async function listUnitCounts(battalionId: number): Promise<UnitTypeRow[]> {
  return query<UnitTypeRow>(
    `SELECT t.code, t.name, COALESCE(c.unit_count, 0)::int AS unit_count,
            COALESCE(c.unit_count_source, 'none') AS unit_count_source
       FROM org_unit_types t
       LEFT JOIN v_org_unit_counts c
         ON c.unit_type = t.code AND c.battalion_id = $1
      ORDER BY t.sort_order, t.code`,
    [battalionId]
  );
}

export async function listGapKeys(battalionId: number): Promise<GapKeyLine[]> {
  return query<GapKeyLine>(
    `SELECT id, gap_row_id, source, qty, unit_type, sort_order
       FROM gap_requirement_keys
      WHERE battalion_id = $1
      ORDER BY gap_row_id, source, sort_order, id`,
    [battalionId]
  );
}

/** Numbers from `v_certification_gaps` — the view that applies the per-row clamp.
 * Family colouring is resolved here from the templates bank `domain` when `family_id`
 * was never filled in; the arithmetic columns are unchanged. */
export async function listComputedGaps(battalionId: number): Promise<ComputedGapRow[]> {
  return query<ComputedGapRow>(
    `SELECT v.gap_row_id, v.certification_name, v.canonical_cert_name,
            COALESCE(
              v.family_id,
              (
                SELECT f.id
                  FROM certification_templates t
                  JOIN certification_families f
                    ON TRIM(t.domain) = f.name
                    OR f.name LIKE TRIM(t.domain) || '%'
                    OR TRIM(t.domain) LIKE f.name || '%'
                 WHERE NULLIF(TRIM(t.domain), '') IS NOT NULL
                   AND (
                     t.gap_row_id = v.gap_row_id
                     OR t.name = v.certification_name
                     OR t.name = v.canonical_cert_name
                     OR v.certification_name LIKE t.name || '%'
                     OR t.name LIKE v.certification_name || '%'
                   )
                 ORDER BY
                   CASE WHEN t.gap_row_id = v.gap_row_id THEN 0
                        WHEN t.name = v.certification_name THEN 1
                        ELSE 2 END,
                   CASE WHEN TRIM(t.domain) = f.name THEN 0 ELSE 1 END,
                   LENGTH(t.name) DESC,
                   t.id
                 LIMIT 1
              ),
              (
                SELECT f.id
                  FROM certifications c
                  JOIN certification_families f
                    ON TRIM(c.domain) = f.name
                    OR f.name LIKE TRIM(c.domain) || '%'
                    OR TRIM(c.domain) LIKE f.name || '%'
                 WHERE NULLIF(TRIM(c.domain), '') IS NOT NULL
                   AND (
                     c.gap_row_id = v.gap_row_id
                     OR c.name = v.certification_name
                     OR v.certification_name LIKE c.name || '%'
                   )
                 ORDER BY CASE WHEN c.gap_row_id = v.gap_row_id THEN 0 ELSE 1 END, c.id DESC
                 LIMIT 1
              )
            ) AS family_id,
            COALESCE(
              (
                SELECT NULLIF(TRIM(t.domain), '')
                  FROM certification_templates t
                 WHERE t.gap_row_id = v.gap_row_id
                    OR t.name = v.certification_name
                    OR t.name = v.canonical_cert_name
                    OR v.certification_name LIKE t.name || '%'
                    OR t.name LIKE v.certification_name || '%'
                 ORDER BY
                   CASE WHEN t.gap_row_id = v.gap_row_id THEN 0
                        WHEN t.name = v.certification_name THEN 1
                        ELSE 2 END,
                   LENGTH(t.name) DESC,
                   t.id
                 LIMIT 1
              ),
              (
                SELECT NULLIF(TRIM(c.domain), '')
                  FROM certifications c
                 WHERE c.gap_row_id = v.gap_row_id
                    OR c.name = v.certification_name
                    OR v.certification_name LIKE c.name || '%'
                 ORDER BY CASE WHEN c.gap_row_id = v.gap_row_id THEN 0 ELSE 1 END, c.id DESC
                 LIMIT 1
              )
            ) AS template_domain,
            v.active_source, v.required_count, v.held_count, v.gap_count, v.surplus_count,
            v.gap_state, v.manual_gap_count, v.key_line_count
       FROM v_certification_gaps v
      WHERE v.battalion_id = $1
      ORDER BY v.sort_order, v.gap_row_id`,
    [battalionId]
  );
}

export interface GapNominationRow {
  id: number;
  gap_row_id: number;
  certification_id: number | null;
  role_assignment_id: number | null;
  free_text_name: string | null;
  note: string | null;
  full_name: string | null;
  personal_number: string | null;
  frame: string | null;
}

export async function listNominations(
  battalionId: number,
  gapRowId: number
): Promise<GapNominationRow[]> {
  return query<GapNominationRow>(
    `SELECT n.id, n.gap_row_id, n.certification_id, n.role_assignment_id, n.free_text_name, n.note,
            ra.full_name, ra.personal_number,
            CASE WHEN ra.id IS NULL THEN NULL
                 ELSE concat_ws(' · ', r.serial, r.role_name, r.squad) END AS frame
       FROM gap_nominations n
       LEFT JOIN role_assignments ra ON ra.id = n.role_assignment_id
       LEFT JOIN roles r ON r.id = ra.role_id
      WHERE n.battalion_id = $1 AND n.gap_row_id = $2
      ORDER BY n.id`,
    [battalionId, gapRowId]
  );
}

export async function setActiveSource(
  gapRowId: number,
  battalionId: number,
  source: "operational" | "establishment"
): Promise<void> {
  await execute(
    `INSERT INTO certification_gap_values (row_id, battalion_id, gap_count, sent_count, active_source)
     VALUES ($1, $2, 0, 0, $3)
     ON CONFLICT (row_id, battalion_id)
     DO UPDATE SET active_source = EXCLUDED.active_source`,
    [gapRowId, battalionId, source]
  );
}

export async function replaceOperationalKey(
  gapRowId: number,
  battalionId: number,
  lines: RequirementKeyLine[]
): Promise<void> {
  await withTransaction(async (client) => {
    await execute(
      `DELETE FROM gap_requirement_keys
        WHERE gap_row_id = $1 AND battalion_id = $2 AND source = 'operational'`,
      [gapRowId, battalionId],
      client
    );
    for (let i = 0; i < lines.length; i++) {
      await execute(
        `INSERT INTO gap_requirement_keys (gap_row_id, battalion_id, source, qty, unit_type, sort_order)
         VALUES ($1, $2, 'operational', $3, $4, $5)`,
        [gapRowId, battalionId, lines[i].qty, lines[i].unitType, i],
        client
      );
    }
  });
}

export async function addNomination(input: {
  gapRowId: number;
  battalionId: number;
  certificationId?: number | null;
  roleAssignmentId?: number | null;
  freeTextName?: string | null;
  note?: string | null;
  createdByRole?: string | null;
}): Promise<number> {
  const row = await queryOne<{ id: number }>(
    `INSERT INTO gap_nominations
       (gap_row_id, battalion_id, certification_id, role_assignment_id, free_text_name, note, created_by_role)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id`,
    [
      input.gapRowId,
      input.battalionId,
      input.certificationId ?? null,
      input.roleAssignmentId ?? null,
      input.freeTextName ?? null,
      input.note ?? null,
      input.createdByRole ?? null,
    ]
  );
  return row?.id ?? 0;
}

export async function deleteNomination(id: number, battalionId: number): Promise<void> {
  await execute(`DELETE FROM gap_nominations WHERE id = $1 AND battalion_id = $2`, [id, battalionId]);
}

export function liveNumbers(
  lines: RequirementKeyLine[],
  held: number,
  counts: UnitCounts
): GapRowNumbers {
  return computeGapRow(computeRequired(lines, counts), held);
}

export function describeKey(
  lines: RequirementKeyLine[],
  names: Record<string, string>,
  counts: UnitCounts
): string {
  return keyText(lines, names, counts);
}

export async function countClosedThisQuarter(_battalionId: number): Promise<number | null> {
  // History is unwired this phase (migration 018). Hide the card rather than show 0.
  void _battalionId;
  return null;
}
