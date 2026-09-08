import { query, queryOne } from "@/lib/db/client";
import type { Battalion } from "@/lib/types";

export async function listBattalions(): Promise<Battalion[]> {
  return query<Battalion>("SELECT * FROM battalions WHERE is_active = 1 ORDER BY code");
}

export async function getBattalionByCode(code: string): Promise<Battalion | undefined> {
  return queryOne<Battalion>("SELECT * FROM battalions WHERE code = $1", [code]);
}

export async function getBattalionById(id: number): Promise<Battalion | undefined> {
  return queryOne<Battalion>("SELECT * FROM battalions WHERE id = $1", [id]);
}
