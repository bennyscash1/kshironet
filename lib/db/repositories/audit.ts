import { execute, query } from "@/lib/db/client";
import type { EntityType, StatusHistoryEntry } from "@/lib/types";
import type { PoolClient } from "pg";

export async function recordStatusChange(
  entityType: EntityType,
  entityId: number,
  oldStatus: string | null,
  newStatus: string,
  changedByRole: string,
  note?: string | null,
  client?: PoolClient
) {
  await execute(
    `INSERT INTO status_history (entity_type, entity_id, old_status, new_status, changed_by_role, note)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [entityType, entityId, oldStatus, newStatus, changedByRole, note ?? null],
    client
  );
}

export async function listStatusHistory(
  entityType: EntityType,
  entityId: number
): Promise<StatusHistoryEntry[]> {
  return query<StatusHistoryEntry>(
    `SELECT * FROM status_history WHERE entity_type = $1 AND entity_id = $2 ORDER BY changed_at DESC`,
    [entityType, entityId]
  );
}
