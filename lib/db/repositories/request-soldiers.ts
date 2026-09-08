import { execute, query } from "@/lib/db/client";
import type { PoolClient } from "pg";
import type { BattalionRequestSoldier } from "@/lib/types";

export interface RequestSoldierInput {
  request_id: number;
  full_name: string;
  personal_number?: string | null;
  phone?: string | null;
  battalion_id: number;
}

export async function listByRequest(requestId: number): Promise<BattalionRequestSoldier[]> {
  return query<BattalionRequestSoldier>(
    "SELECT * FROM battalion_request_soldiers WHERE request_id = $1 ORDER BY created_at ASC, id ASC",
    [requestId]
  );
}

export async function createRequestSoldier(input: RequestSoldierInput): Promise<number> {
  const result = await execute(
    `INSERT INTO battalion_request_soldiers (request_id, full_name, personal_number, phone, battalion_id)
       VALUES ($1, $2, $3, $4, $5)
     RETURNING id`,
    [
      input.request_id,
      input.full_name,
      input.personal_number ?? null,
      input.phone ?? null,
      input.battalion_id,
    ]
  );
  return (result.rows[0] as { id: number }).id;
}

export async function deleteRequestSoldier(id: number): Promise<void> {
  await execute("DELETE FROM battalion_request_soldiers WHERE id = $1", [id]);
}

/** Removes all soldiers attached to a request. FK ON DELETE CASCADE already covers
 * this when the request itself is deleted; exposed as a helper for explicit cleanup
 * and reuse inside transactions. */
export async function deleteByRequest(requestId: number, client?: PoolClient): Promise<void> {
  await execute("DELETE FROM battalion_request_soldiers WHERE request_id = $1", [requestId], client);
}
