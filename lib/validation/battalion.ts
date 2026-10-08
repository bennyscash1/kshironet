import { z } from "zod";

/**
 * Battalion create/update payloads.
 *
 * Follows the conventions in lib/validation/: positional Hebrew message strings for
 * built-in checks, `{ message: "..." }` on `z.literal`, a discriminated union on an
 * `action` field for a multi-purpose PATCH, and `.strict()` so an unknown field is a
 * rejected payload rather than a silently ignored one.
 */

/**
 * Battalion code. Constrained to characters that are safe in a URL path segment, because
 * /battalions/[code] is a route.
 *
 * Existing codes are '5030', '6228', '8207', '9308', 'gdsm', 'hq' — digits and lowercase
 * latin — so this is deliberately permissive about case and allows '-' and '_'.
 */
const battalionCode = z
  .string()
  .trim()
  .min(1, "יש להזין קוד גדוד")
  .max(20, "קוד הגדוד ארוך מדי")
  .regex(/^[A-Za-z0-9_-]+$/, "קוד הגדוד יכול להכיל אותיות באנגלית, ספרות, מקף וקו תחתון");

/**
 * Shown when a battalion code is already held by an ACTIVE battalion anywhere in the army.
 *
 * Enforced by the partial unique index `battalions_active_code_unique` (migration 029),
 * which encodes the domain rule that an active IDF battalion number is unique army-wide.
 *
 * DELIBERATELY SAYS NOTHING ABOUT WHERE THE NUMBER IS IN USE. It does not name the holding
 * brigade, does not say "in another brigade", and does not confirm that any row exists
 * anywhere — a caller who cannot see a brigade must not be able to learn its contents by
 * probing codes against this form. "Unavailable" is the whole of what they learn.
 *
 * Lives here with the other battalion field messages so the tone matches and there is one
 * place to change the wording.
 */
export const BATTALION_CODE_UNAVAILABLE = "מספר גדוד זה אינו זמין. יש לבחור מספר אחר.";

const battalionName = z
  .string()
  .trim()
  .min(1, "יש להזין שם גדוד")
  .max(100, "שם הגדוד ארוך מדי");

/** Verbatim from lib/validation/certification.ts and training.ts. */
const colorHex = z.string().regex(/^#[0-9a-fA-F]{6}$/, "צבע לא תקין");

/**
 * The brigade a battalion belongs to.
 *
 * Explicit on create and validated server-side against the `brigades` table. There is no
 * tenant context in this slice, so the target brigade has to be a real parameter — but it
 * is resolved and authorized on the server and must never come from the `active_role`
 * cookie or any other client-settable value.
 */
const brigadeId = z.coerce
  .number("יש לבחור חטיבה")
  .int("יש לבחור חטיבה")
  .positive("יש לבחור חטיבה");

/** POST /api/admin/battalions */
export const battalionCreateSchema = z
  .object({
    brigade_id: brigadeId,
    code: battalionCode,
    name: battalionName,
    color_hex: colorHex,
  })
  .strict();

/**
 * PATCH /api/admin/battalions/[id] — name and colour.
 *
 * `code` is deliberately absent, and this is a hard rule rather than a simplification.
 *
 * SIX unconstrained TEXT columns store the string `battalion:CODE` as an audit actor, none
 * of them with a foreign key to `battalions`, so nothing in the database or the
 * application would flag a rename that orphaned them:
 *
 *   certifications.created_by_role                  migrations/postgres/001_init.sql:52
 *   notifications.target_role                       migrations/postgres/001_init.sql:119
 *   status_history.changed_by_role                  migrations/postgres/001_init.sql:133
 *   gap_nominations.created_by_role                 migrations/postgres/015_...:155
 *   roster_admin_confirmations.confirmed_by_role    migrations/postgres/016_...:16
 *   force_structure_edit_snapshots.created_by_role  migrations/postgres/020_...:25
 *
 * Written by `auditRoleOf()` (lib/auth/permissions.ts) and `requireBattalionEditor()`
 * (lib/auth/scope.ts). Do not check one of these columns, find it empty, and conclude a
 * rename is safe — a code is referenced by all six, and they fill up over time.
 *
 * Worse, the format is ALREADY inconsistent: lib/db/repositories/requests.ts:73 writes
 * `battalion:${input.battalion_id}` — the numeric id, not the code — and :208 writes the
 * code with an id fallback. So these columns mix 'battalion:6228' with 'battalion:3' and
 * cannot be reliably parsed or repaired after the fact. Changing a code makes an
 * already-ambiguous trail worse.
 *
 * A battalion whose code is genuinely wrong is deactivated and re-created.
 */
export const battalionUpdateSchema = z
  .object({
    action: z.literal("update"),
    name: battalionName,
    color_hex: colorHex,
  })
  .strict();

/** PATCH /api/admin/battalions/[id] — activate or deactivate. Never a delete. */
export const battalionSetActiveSchema = z
  .object({
    action: z.literal("set_active"),
    is_active: z.boolean({ message: "יש לציין האם הגדוד פעיל" }),
  })
  .strict();

export const battalionPatchSchema = z.discriminatedUnion("action", [
  battalionUpdateSchema,
  battalionSetActiveSchema,
]);

export type BattalionCreateInput = z.infer<typeof battalionCreateSchema>;
export type BattalionPatchInput = z.infer<typeof battalionPatchSchema>;
