import { execute, query, queryOne } from "@/lib/db/client";
import { createTemplate } from "@/lib/db/repositories/templates";

export interface GapRow {
  id: number;
  certification_name: string;
  sort_order: number;
  values: Record<number, number>;
  sentValues: Record<number, number>;
  pendingValues: Record<number, number>;
  total: number;
}

/**
 * `battalionId` confines every per-battalion number to that battalion — the returned rows
 * then carry no other unit's counts at all, which matters because these rows are
 * serialized straight to the client and into the Excel/PDF exports. Omitted (global
 * roles) → every battalion, i.e. the original behaviour.
 */
export async function listGapRows(battalionId?: number): Promise<GapRow[]> {
  const scoped = battalionId !== undefined;
  const scopeParams = scoped ? [battalionId] : [];

  const rows = await query<{ id: number; certification_name: string; sort_order: number }>(
    `SELECT id, certification_name, sort_order FROM certification_gap_rows ORDER BY sort_order, id`
  );

  const values = await query<{ row_id: number; battalion_id: number; gap_count: number; sent_count: number }>(
    `SELECT row_id, battalion_id, gap_count, sent_count FROM certification_gap_values${
      scoped ? " WHERE battalion_id = $1" : ""
    }`,
    scopeParams
  );

  // People currently registered/approved for a not-yet-completed certification for this
  // profession — "עתידים לצאת" (expected to go out soon, but not sent yet).
  const pending = await query<{ row_id: number; battalion_id: number; pending_count: number }>(
    `SELECT c.gap_row_id as row_id, re.battalion_id, COUNT(*)::int as pending_count
       FROM roster_entries re
       JOIN certifications c ON c.id = re.certification_id
       WHERE re.is_reserve = 0
         AND re.status IN ('registered', 'pending_approval', 'approved')
         AND c.gap_row_id IS NOT NULL
         AND c.status NOT IN ('completed', 'cancelled')${
           scoped ? " AND re.battalion_id = $1" : ""
         }
       GROUP BY c.gap_row_id, re.battalion_id`,
    scopeParams
  );

  const valuesByRow = new Map<number, Record<number, number>>();
  const sentByRow = new Map<number, Record<number, number>>();
  const pendingByRow = new Map<number, Record<number, number>>();
  for (const v of values) {
    if (!valuesByRow.has(v.row_id)) valuesByRow.set(v.row_id, {});
    valuesByRow.get(v.row_id)![v.battalion_id] = v.gap_count;
    if (!sentByRow.has(v.row_id)) sentByRow.set(v.row_id, {});
    sentByRow.get(v.row_id)![v.battalion_id] = v.sent_count;
  }
  for (const p of pending) {
    if (!pendingByRow.has(p.row_id)) pendingByRow.set(p.row_id, {});
    pendingByRow.get(p.row_id)![p.battalion_id] = p.pending_count;
  }

  return rows.map((r) => {
    const rowValues = valuesByRow.get(r.id) ?? {};
    const rowSent = sentByRow.get(r.id) ?? {};
    const rowPending = pendingByRow.get(r.id) ?? {};
    const total = Object.values(rowValues).reduce((a, b) => a + b, 0);
    return { ...r, values: rowValues, sentValues: rowSent, pendingValues: rowPending, total };
  });
}

/** Adds a gap row and, if no bank template already exists under that exact name, creates an
 * empty one linked via gap_row_id — so every battalion requirement always has somewhere to
 * land in "בנק הסמכות", even before its procedure details are filled in. */
export async function addGapRow(certificationName: string): Promise<number> {
  const maxOrder = (await queryOne<{ m: number | null }>(
    `SELECT MAX(sort_order) as m FROM certification_gap_rows`
  ))?.m ?? 0;
  const info = await execute(
    `INSERT INTO certification_gap_rows (certification_name, sort_order) VALUES ($1, $2) RETURNING id`,
    [certificationName, maxOrder + 1]
  );
  const rowId = (info.rows[0] as { id: number }).id;

  const existingTemplate = await queryOne<{ id: number }>(
    `SELECT id FROM certification_templates WHERE name = $1`,
    [certificationName]
  );
  if (!existingTemplate) {
    await createTemplate({ name: certificationName, gap_row_id: rowId });
  } else {
    await execute(
      `UPDATE certification_templates SET gap_row_id = $1 WHERE id = $2 AND gap_row_id IS NULL`,
      [rowId, existingTemplate.id]
    );
  }

  return rowId;
}

export async function deleteGapRow(rowId: number) {
  await execute(`DELETE FROM certification_gap_rows WHERE id = $1`, [rowId]);
}

export async function upsertGapValue(rowId: number, battalionId: number, gapCount: number) {
  await execute(
    `INSERT INTO certification_gap_values (row_id, battalion_id, gap_count) VALUES ($1, $2, $3)
     ON CONFLICT(row_id, battalion_id) DO UPDATE SET gap_count = excluded.gap_count`
  , [rowId, battalionId, gapCount]);
}

export async function upsertGapSentCount(rowId: number, battalionId: number, sentCount: number) {
  await execute(
    `INSERT INTO certification_gap_values (row_id, battalion_id, gap_count, sent_count) VALUES ($1, $2, 0, $3)
     ON CONFLICT(row_id, battalion_id) DO UPDATE SET sent_count = excluded.sent_count`
  , [rowId, battalionId, sentCount]);
}

export interface GapRowSnapshotEntry {
  battalion_id: number;
  gap_count: number;
  sent_total: number;
}

/** For a given profession (gap row), how much each battalion still needs and how many it has
 * already sent through successfully — used to inform the allocation split when opening a new
 * certification for that profession. */
export async function getGapRowSnapshot(rowId: number): Promise<GapRowSnapshotEntry[]> {
  return query<GapRowSnapshotEntry>(
    `SELECT b.id as battalion_id,
              COALESCE(v.gap_count, 0) as gap_count,
              COALESCE(v.sent_count, 0) + (
                SELECT COUNT(*)::int FROM roster_entries re
                 JOIN certifications c ON c.id = re.certification_id
                WHERE c.gap_row_id = $1 AND re.battalion_id = b.id AND re.status = 'passed'
              ) as sent_total
       FROM battalions b
       LEFT JOIN certification_gap_values v ON v.row_id = $2 AND v.battalion_id = b.id
       ORDER BY b.id`
    , [rowId, rowId]
  );
}

/**
 * Battalion codes that make up the "פערי הסמכות ביחס לשיבוץ" view. This used to live as a
 * literal in app/requests/page.tsx, where it selected the matrix's columns; it now selects
 * the rows of the aggregate below so the battalion universe stays exactly what it was.
 */
export const GAP_BATTALION_CODES = ["5030", "8207", "9308", "6228", "gdsm", "hq"] as const;

/** One (battalion × request type) cell with a non-zero quantity. Flat on purpose: both
 * tab groupings on /requests are derived from this single result set. */
export interface GapAggregateRow {
  battalion_id: number;
  battalion_name: string;
  battalion_code: string;
  battalion_color: string;
  request_type_id: number;
  request_type_name: string;
  quantity: number;
}

/**
 * The gap matrix as a flat, zero-free list — ONE query, no per-battalion or per-type
 * follow-up. Everything /requests needs to group by battalion AND by request type comes
 * back here; the two shapes are folded out of this array in memory (lib/gaps/groupings).
 *
 * `battalionId` confines the result to that battalion, so a battalion-scoped role's page
 * payload and exports carry no other unit's numbers at all — not merely hidden ones.
 * Omitted (global roles) → every battalion, i.e. the original behaviour.
 *
 * NULL gap_count is coalesced to 0 and then excluded by the `> 0` filter, which is what
 * drops the all-zero rows the old matrix rendered as empty space.
 */
export async function listGapAggregate(battalionId?: number): Promise<GapAggregateRow[]> {
  return query<GapAggregateRow>(
    `SELECT b.id            AS battalion_id,
            b.name          AS battalion_name,
            b.code          AS battalion_code,
            b.color_hex     AS battalion_color,
            r.id            AS request_type_id,
            r.certification_name AS request_type_name,
            COALESCE(v.gap_count, 0)::int AS quantity
       FROM certification_gap_values v
       JOIN certification_gap_rows r ON r.id = v.row_id
       JOIN battalions b ON b.id = v.battalion_id
      WHERE b.is_active = 1
        AND b.code = ANY($1::text[])
        AND COALESCE(v.gap_count, 0) > 0
        AND ($2::int IS NULL OR b.id = $2::int)
      ORDER BY r.sort_order, r.id, b.code`,
    [[...GAP_BATTALION_CODES], battalionId ?? null]
  );
}
