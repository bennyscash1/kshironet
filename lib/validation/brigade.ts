import { z } from "zod";

/**
 * Brigade create/update payloads.
 *
 * Follows the conventions in lib/validation/: positional Hebrew message strings for
 * built-in checks, `{ message: "..." }` on `z.enum`/`z.literal`, and a discriminated union
 * on an `action` field for a multi-purpose PATCH — exactly the shape
 * lib/validation/admin.ts uses for /api/admin/users/[id].
 *
 * Every object is `.strict()`: an unknown field is a rejected payload, not a silently
 * ignored one. A client sending `{ name, is_active }` to the rename action is confused
 * about something, and answering 400 says so.
 */

/**
 * `.trim()` runs before `.min(1)`, so a whitespace-only name fails the "required" check
 * rather than being stored as blank. The database has a matching
 * `CHECK (length(btrim(name)) > 0)` backstop, but this is what produces a clean Hebrew 400
 * instead of a constraint violation — the same belt-and-braces rationale
 * lib/validation/admin.ts gives for mirroring the role/battalion CHECK.
 */
const brigadeName = z
  .string()
  .trim()
  .min(1, "יש להזין שם חטיבה")
  .max(100, "שם החטיבה ארוך מדי");

/** POST /api/admin/brigades */
export const brigadeCreateSchema = z
  .object({
    name: brigadeName,
  })
  .strict();

/** PATCH /api/admin/brigades/[id] — rename. */
export const brigadeRenameSchema = z
  .object({
    action: z.literal("rename"),
    name: brigadeName,
  })
  .strict();

/** PATCH /api/admin/brigades/[id] — activate or deactivate. Never a delete. */
export const brigadeSetActiveSchema = z
  .object({
    action: z.literal("set_active"),
    is_active: z.boolean({ message: "יש לציין האם החטיבה פעילה" }),
  })
  .strict();

export const brigadePatchSchema = z.discriminatedUnion("action", [
  brigadeRenameSchema,
  brigadeSetActiveSchema,
]);

export type BrigadeCreateInput = z.infer<typeof brigadeCreateSchema>;
export type BrigadePatchInput = z.infer<typeof brigadePatchSchema>;

/**
 * POST /api/admin/active-brigade — switch, or clear.
 *
 * Discriminated on `action` so "clear" is an explicit intent rather than an absent field.
 * A missing `brigade_public_id` would otherwise be indistinguishable from a client bug,
 * and clearing the selection is deliberate: it puts a super admin into the "no brigade
 * selected" state on purpose.
 */
export const activeBrigadeSelectSchema = z
  .object({
    action: z.literal("select"),
    brigade_public_id: z.string().uuid("מזהה חטיבה אינו תקין"),
  })
  .strict();

export const activeBrigadeClearSchema = z
  .object({ action: z.literal("clear") })
  .strict();

export const activeBrigadeSwitchSchema = z.discriminatedUnion("action", [
  activeBrigadeSelectSchema,
  activeBrigadeClearSchema,
]);

export type ActiveBrigadeSwitchInput = z.infer<typeof activeBrigadeSwitchSchema>;
