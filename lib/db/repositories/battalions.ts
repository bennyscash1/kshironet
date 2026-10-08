import { execute, query, queryOne } from "@/lib/db/client";
import type { Battalion } from "@/lib/types";

/**
 * Battalions.
 *
 * `is_active` is `SMALLINT` 0/1, not a boolean — `Battalion.is_active` is typed `number`
 * and app/admin/permissions/page.tsx and components/admin/users-manager.tsx both compare
 * `=== 1`. The write functions below take a `boolean` at their edge and map it, so the
 * column convention stays where it is.
 *
 * There is no delete function. Deactivation is a soft state change: a battalion's roster
 * entries, requests, quotas and companies stay attributable.
 */

/** Active battalions only — the pickers. Note the asymmetry with the two getters below,
 * which deliberately resolve inactive battalions too (see `getBattalionById`). */
export async function listBattalions(): Promise<Battalion[]> {
  return query<Battalion>("SELECT * FROM battalions WHERE is_active = 1 ORDER BY code");
}

/**
 * Active battalions of one brigade — the pickers, scoped.
 *
 * Filtered in SQL rather than by narrowing an unscoped result in TypeScript. That matters
 * beyond tidiness: the SQL predicate is what stays correct once row level security lands,
 * whereas a TypeScript filter is a second, divergent implementation of the same rule that
 * RLS will not be able to replace.
 */
export async function listActiveBattalionsForBrigade(brigadeId: number): Promise<Battalion[]> {
  return query<Battalion>(
    "SELECT * FROM battalions WHERE brigade_id = $1 AND is_active = 1 ORDER BY code",
    [brigadeId]
  );
}

/**
 * Every battalion in a brigade, inactive included, active first.
 *
 * The admin screen needs the inactive ones because reactivating them is one of the things
 * it is for.
 */
export async function listAllBattalionsForBrigade(brigadeId: number): Promise<Battalion[]> {
  return query<Battalion>(
    "SELECT * FROM battalions WHERE brigade_id = $1 ORDER BY is_active DESC, code",
    [brigadeId]
  );
}

/**
 * Resolve by code WITHIN a brigade.
 *
 * `brigadeId` is required, not optional, and that is the whole point of the signature: an
 * optional parameter would compile at every existing call site and silently keep the
 * unscoped behaviour. Making it required turns the conversion into a compile error at each
 * one, so none can be missed.
 *
 * Since migration 026 a code is unique only within a brigade — `UNIQUE (brigade_id, code)`.
 * Before this change the lookup was `WHERE code = $1`, which with two brigades holding the
 * same code returned TWO rows and `queryOne` took an arbitrary one. Measured: two
 * battalions coded '5030' in two different brigades produced 2 rows, and the first was
 * returned.
 *
 * The predicate is applied in SQL rather than by filtering an unscoped result in
 * TypeScript. That matters beyond tidiness: the SQL predicate is what row level security
 * will enforce for free once it lands, whereas a TypeScript filter is a second,
 * divergent implementation of the same rule that RLS cannot replace. Same shape as
 * `listActiveBattalionsForBrigade` above.
 *
 * `brigadeId` must come from the server-side scope (`activeBrigadeId()`), never from a
 * cookie, a query parameter or a request body.
 *
 * There is deliberately NO unscoped variant. A caller that cannot resolve a brigade must
 * treat that as "not found" and fail closed, not reach past the scope.
 */
export async function getBattalionByCode(
  code: string,
  brigadeId: number
): Promise<Battalion | undefined> {
  return queryOne<Battalion>(
    "SELECT * FROM battalions WHERE brigade_id = $1 AND code = $2",
    [brigadeId, code]
  );
}

/**
 * Resolve by id, active or not.
 *
 * Deliberately unfiltered by `is_active`: `getBattalionScope()` depends on being able to
 * resolve a scoped user's own battalion even when it is deactivated, so that the user
 * fails closed rather than silently becoming a global one.
 */
export async function getBattalionById(id: number): Promise<Battalion | undefined> {
  return queryOne<Battalion>("SELECT * FROM battalions WHERE id = $1", [id]);
}

/**
 * Creates a battalion in a brigade.
 *
 * `brigade_id` comes from the caller, which has already authorized it — it is never taken
 * from a cookie. A duplicate `(brigade_id, code)` raises SQLSTATE 23505 against
 * `battalions_brigade_code_key`; the caller maps that to Hebrew.
 */
export async function createBattalion(input: {
  brigadeId: number;
  code: string;
  name: string;
  colorHex: string;
}): Promise<number> {
  const row = await queryOne<{ id: number }>(
    `INSERT INTO battalions (brigade_id, code, name, color_hex, is_active)
     VALUES ($1, $2, $3, $4, 1) RETURNING id`,
    [input.brigadeId, input.code.trim(), input.name.trim(), input.colorHex]
  );
  return row!.id;
}

/** Updates name and colour. `code` is immutable — see lib/validation/battalion.ts for the
 * six audit columns that would be orphaned. Returns false when no such battalion exists. */
export async function updateBattalion(
  id: number,
  input: { name: string; colorHex: string }
): Promise<boolean> {
  const result = await execute(
    "UPDATE battalions SET name = $2, color_hex = $3 WHERE id = $1",
    [id, input.name.trim(), input.colorHex]
  );
  return result.rowCount > 0;
}

/** Activates or deactivates. Returns false when no such battalion exists. */
export async function setBattalionActive(id: number, active: boolean): Promise<boolean> {
  const result = await execute("UPDATE battalions SET is_active = $2 WHERE id = $1", [
    id,
    active ? 1 : 0,
  ]);
  return result.rowCount > 0;
}

/**
 * How many non-rejected users are scoped to this battalion.
 *
 * Gates deactivation. `users_battalion_scope_valid` (012) requires `battalion_id NOT NULL`
 * for `editor_battalion` and `viewer_battalion`, and no scope helper in lib/auth/ consults
 * `battalions.is_active` at all — verified: zero references in scope.ts, require-scope.ts,
 * battalion-scope.ts, permissions.ts and proxy.ts. So deactivating a battalion that still
 * has users assigned would leave them with undiminished write access to a unit the rest of
 * the app treats as gone. Refusing is the only behaviour that creates no undefined state.
 *
 * Rejected users are excluded: their access is already revoked, so they cannot hold a
 * battalion open.
 */
export async function countUsersForBattalion(id: number): Promise<number> {
  const row = await queryOne<{ n: number }>(
    "SELECT count(*)::int AS n FROM users WHERE battalion_id = $1 AND status <> 'rejected'",
    [id]
  );
  return row?.n ?? 0;
}
