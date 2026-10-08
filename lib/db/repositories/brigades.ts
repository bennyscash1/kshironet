import { execute, query, queryOne } from "@/lib/db/client";
import type { Brigade } from "@/lib/types";

/**
 * Brigades — the tenant root. Follows lib/db/repositories/battalions.ts: the shared
 * `query`/`queryOne`/`execute` helpers, `$1` params, `Promise<T | undefined>` for a single
 * row.
 *
 * There is deliberately NO delete function. Deactivation is a soft state change
 * (`is_active = 0`), because a brigade's data must remain attributable and there will be
 * data soon.
 *
 * Note this code uses the data-layer helpers exactly as they exist today. It does not
 * anticipate the tenant-context wrapper from the main Phase 2 plan — that plan rewires
 * every call site at once, and writing this file against a wrapper that does not exist yet
 * is how the two diffs collide.
 */

/** Every brigade, active first then by name. The admin screen must see inactive ones too,
 * because reactivating them is one of the things it is for. */
export async function listBrigades(): Promise<Brigade[]> {
  return query<Brigade>("SELECT * FROM brigades ORDER BY is_active DESC, name");
}

export async function getBrigadeById(id: number): Promise<Brigade | undefined> {
  return queryOne<Brigade>("SELECT * FROM brigades WHERE id = $1", [id]);
}

/**
 * Resolve by the opaque URL id.
 *
 * `public_id` is a UUID, so a malformed value would raise 22P02 (invalid input syntax)
 * rather than returning nothing. The cast is guarded so an arbitrary path segment yields
 * "not found" instead of a 500 — a URL is user input.
 */
export async function getBrigadeByPublicId(publicId: string): Promise<Brigade | undefined> {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(publicId)) {
    return undefined;
  }
  return queryOne<Brigade>("SELECT * FROM brigades WHERE public_id = $1", [publicId]);
}

/**
 * Creates a brigade. `name` is trimmed here so the stored value never carries incidental
 * whitespace — the UNIQUE constraint would otherwise treat 'x' and 'x ' as different
 * brigades.
 *
 * Three failures are possible and all three are the caller's to translate, by SQLSTATE:
 *   KS001 — a second brigade while multi_brigade_isolation_ready is off (trigger)
 *   23505 — the name is taken (brigades_name_key)
 *   23514 — the name is blank after trimming (brigades_name_not_blank)
 */
export async function createBrigade(input: {
  name: string;
  createdBy: string | null;
}): Promise<number> {
  const row = await queryOne<{ id: number }>(
    `INSERT INTO brigades (name, created_by) VALUES ($1, $2) RETURNING id`,
    [input.name.trim(), input.createdBy]
  );
  // RETURNING on a successful INSERT always yields a row; anything else threw above.
  return row!.id;
}

/** Renames a brigade. Returns false when no such brigade exists, so the route can answer
 * 404 rather than reporting a successful no-op. */
export async function renameBrigade(id: number, name: string): Promise<boolean> {
  const result = await execute("UPDATE brigades SET name = $2 WHERE id = $1", [
    id,
    name.trim(),
  ]);
  return result.rowCount > 0;
}

/** Activates or deactivates a brigade. Returns false when no such brigade exists. */
export async function setBrigadeActive(id: number, active: boolean): Promise<boolean> {
  const result = await execute("UPDATE brigades SET is_active = $2 WHERE id = $1", [
    id,
    active ? 1 : 0,
  ]);
  return result.rowCount > 0;
}
