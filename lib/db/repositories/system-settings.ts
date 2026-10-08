import { queryOne } from "@/lib/db/client";

/**
 * Reader for the `system_settings` key/value table created in
 * migrations/postgres/017_system_settings.sql.
 *
 * 017's header comment already names this file ("Values are TEXT and parsed by
 * lib/db/repositories/system-settings.ts") but it was never written — nothing in the app
 * read the table until now. Values are TEXT by design; each accessor below parses and
 * defaults, so a missing or malformed row can never become an exception on a page render.
 */

export async function getSetting(key: string): Promise<string | undefined> {
  const row = await queryOne<{ value: string }>(
    "SELECT value FROM system_settings WHERE key = $1",
    [key]
  );
  return row?.value;
}

/**
 * The key that gates writing entities which have no `brigade_id`.
 *
 * Set to '1' only by migration 034, and only after the checklist in
 * 025_brigades.sql §"THE SINGLE-BRIGADE GUARD" has actually been verified. It is not a
 * convenience toggle.
 */
export const MULTI_BRIGADE_ISOLATION_READY = "multi_brigade_isolation_ready";

/**
 * Whether per-brigade data isolation is complete.
 *
 * Fails closed, mirroring the `COALESCE(..., '0')` in the database trigger: anything other
 * than an explicit '1' — a missing row, an empty string, a typo — reads as "not ready".
 */
export async function isMultiBrigadeIsolationReady(): Promise<boolean> {
  return (await getSetting(MULTI_BRIGADE_ISOLATION_READY)) === "1";
}

/**
 * Whether creating entities that have no `brigade_id` is currently refused.
 *
 * Mirrors the derived condition in `unscoped_entity_write_is_blocked()` (migration 027):
 * more than one ACTIVE brigade, and isolation not yet ready. Derived rather than stored so
 * it cannot drift away from what the database will actually do.
 *
 * This is only for deciding whether to disable a create affordance and show the notice.
 * The authoritative refusal is the trigger, which no code path can bypass — so a UI that
 * got this wrong would produce a clean Hebrew 409, not a corrupt row.
 */
export async function isUnscopedEntityBlockActive(): Promise<boolean> {
  const [ready, activeBrigades] = await Promise.all([
    isMultiBrigadeIsolationReady(),
    countActiveBrigades(),
  ]);
  return !ready && activeBrigades > 1;
}

export async function countActiveBrigades(): Promise<number> {
  const row = await queryOne<{ n: number }>(
    "SELECT count(*)::int AS n FROM brigades WHERE is_active = 1"
  );
  return row?.n ?? 0;
}
