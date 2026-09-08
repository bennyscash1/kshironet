import { execute, query, queryOne } from "@/lib/db/client";
import type { PivotWidgetConfig, SavedPivotWidget } from "@/lib/types";

const COLUMNS = `id::text AS id, name, config, created_by, created_at, updated_at`;

export interface SavedPivotWidgetInput {
  name: string;
  config: PivotWidgetConfig;
  /** Supabase auth user id of the creator (server-side identity). */
  created_by?: string | null;
}

/** Every saved widget. Deliberately NOT scoped by `created_by` — saved widgets are
 * global and visible to all viewers. */
export async function listSavedWidgets(): Promise<SavedPivotWidget[]> {
  return query<SavedPivotWidget>(
    `SELECT ${COLUMNS} FROM pivot_report_widgets ORDER BY created_at ASC, id ASC`
  );
}

export async function getSavedWidgetById(id: string): Promise<SavedPivotWidget | undefined> {
  return queryOne<SavedPivotWidget>(
    `SELECT ${COLUMNS} FROM pivot_report_widgets WHERE id = $1::uuid`,
    [id]
  );
}

export async function createSavedWidget(
  input: SavedPivotWidgetInput
): Promise<SavedPivotWidget> {
  const result = await execute(
    `INSERT INTO pivot_report_widgets (name, config, created_by)
       VALUES ($1, $2::jsonb, $3)
     RETURNING ${COLUMNS}`,
    [input.name, JSON.stringify(input.config), input.created_by ?? null]
  );
  return result.rows[0] as SavedPivotWidget;
}

/** Replaces a saved widget's name and config. Returns the updated row, or undefined
 * when no widget has that id. */
export async function updateSavedWidget(
  id: string,
  input: { name: string; config: PivotWidgetConfig }
): Promise<SavedPivotWidget | undefined> {
  const result = await execute(
    `UPDATE pivot_report_widgets
        SET name = $2, config = $3::jsonb, updated_at = NOW()
      WHERE id = $1::uuid
     RETURNING ${COLUMNS}`,
    [id, input.name, JSON.stringify(input.config)]
  );
  return result.rows[0] as SavedPivotWidget | undefined;
}

/** Returns the number of rows removed (0 = no such widget). */
export async function deleteSavedWidget(id: string): Promise<number> {
  const result = await execute("DELETE FROM pivot_report_widgets WHERE id = $1::uuid", [id]);
  return result.rowCount;
}
