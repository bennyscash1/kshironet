import { execute, query, queryOne, withTransaction } from "@/lib/db/client";
import type { PoolClient } from "pg";
import type { InfluencingFactor } from "@/lib/types";

export interface InfluencingFactorInput {
  name: string;
  start_date: string;
  end_date?: string | null;
  notes?: string | null;
}

export interface InfluencingFactorBattalionRef {
  code: string;
  name: string;
  color_hex: string;
}

export async function listInfluencingFactors(): Promise<InfluencingFactor[]> {
  return query<InfluencingFactor>("SELECT * FROM influencing_factors ORDER BY start_date ASC");
}

export async function getInfluencingFactorById(id: number): Promise<InfluencingFactor | undefined> {
  return queryOne<InfluencingFactor>("SELECT * FROM influencing_factors WHERE id = $1", [id]);
}

/** Affected battalions (for calendar labels/filtering), mirroring getTrainingBattalions. */
export async function getInfluencingFactorBattalions(
  factorId: number
): Promise<InfluencingFactorBattalionRef[]> {
  return query<InfluencingFactorBattalionRef>(
    `SELECT b.code, b.name, b.color_hex FROM battalions b
       WHERE b.id IN (SELECT battalion_id FROM influencing_factor_battalions WHERE influencing_factor_id = $1)
       ORDER BY b.code`,
    [factorId]
  );
}

export async function getInfluencingFactorBattalionIds(factorId: number): Promise<number[]> {
  const rows = await query<{ battalion_id: number }>(
    "SELECT battalion_id FROM influencing_factor_battalions WHERE influencing_factor_id = $1",
    [factorId]
  );
  return rows.map((r) => r.battalion_id);
}

export async function createInfluencingFactor(
  input: InfluencingFactorInput,
  battalionIds: number[] = []
): Promise<number> {
  return withTransaction(async (client) => {
    const result = await execute(
      `INSERT INTO influencing_factors (name, start_date, end_date, notes)
         VALUES ($1, $2, $3, $4)
         RETURNING id`,
      [input.name, input.start_date, input.end_date || null, input.notes ?? null],
      client
    );
    const id = (result.rows[0] as { id: number }).id;
    await replaceBattalions(id, battalionIds, client);
    return id;
  });
}

export async function updateInfluencingFactor(
  id: number,
  input: Partial<InfluencingFactorInput>,
  battalionIds?: number[]
) {
  const existing = await getInfluencingFactorById(id);
  if (!existing) throw new Error("Influencing factor not found");

  await execute(
    `UPDATE influencing_factors SET
       name = $1, start_date = $2, end_date = $3, notes = $4, updated_at = NOW()
     WHERE id = $5`,
    [
      input.name ?? existing.name,
      input.start_date ?? existing.start_date,
      input.end_date !== undefined ? input.end_date || null : existing.end_date,
      input.notes !== undefined ? input.notes : existing.notes,
      id,
    ]
  );

  if (battalionIds) await replaceBattalions(id, battalionIds);
}

export async function deleteInfluencingFactor(id: number) {
  await execute("DELETE FROM influencing_factors WHERE id = $1", [id]);
}

async function replaceBattalions(factorId: number, battalionIds: number[], client?: PoolClient) {
  const run = async (c: PoolClient) => {
    await execute(
      "DELETE FROM influencing_factor_battalions WHERE influencing_factor_id = $1",
      [factorId],
      c
    );
    for (const bid of battalionIds) {
      await execute(
        `INSERT INTO influencing_factor_battalions (influencing_factor_id, battalion_id)
           VALUES ($1, $2) ON CONFLICT DO NOTHING`,
        [factorId, bid],
        c
      );
    }
  };
  return client ? run(client) : withTransaction(run);
}
