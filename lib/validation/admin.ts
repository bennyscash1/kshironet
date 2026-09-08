import { z } from "zod";
import { BATTALION_SCOPED_ROLES, type UserRole } from "@/lib/types";

/** Roles a super-admin may grant. `super_admin` is only settable via set_role. */
const GRANTABLE_ON_APPROVE = [
  "viewer",
  "editor",
  "viewer_battalion",
  "editor_battalion",
] as const;

const ALL_ROLES = [
  "super_admin",
  "editor",
  "viewer",
  "viewer_battalion",
  "editor_battalion",
] as const;

/** Empty select value arrives as "" — treat it as "no battalion". */
const battalionId = z.preprocess(
  (v) => (v === "" || v === undefined ? null : v),
  z.coerce.number().int().positive().nullable()
);

function isScoped(role: string): boolean {
  return (BATTALION_SCOPED_ROLES as string[]).includes(role);
}

/** The two battalion-scoped roles are meaningless without a battalion, and a global
 * role must not carry one — mirrors the DB constraint so a bad payload is a clean 400
 * rather than a constraint violation. */
function checkBattalionForRole(
  data: { role: UserRole; battalion_id?: number | null },
  ctx: z.RefinementCtx
) {
  if (isScoped(data.role) && data.battalion_id == null) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["battalion_id"],
      message: "יש לבחור גדוד עבור תפקיד גדודי",
    });
  }
  if (!isScoped(data.role) && data.battalion_id != null) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["battalion_id"],
      message: "תפקיד גלובלי אינו משויך לגדוד",
    });
  }
}

/** Approve a pending user, granting any role except super_admin. */
export const approveUserSchema = z
  .object({
    action: z.literal("approve"),
    role: z.enum(GRANTABLE_ON_APPROVE, { message: "יש לבחור תפקיד תקין" }),
    battalion_id: battalionId.optional(),
  })
  .superRefine(checkBattalionForRole);

/** Change an existing user's role (and, for scoped roles, their battalion). */
export const updateRoleSchema = z
  .object({
    action: z.literal("set_role"),
    role: z.enum(ALL_ROLES, { message: "יש לבחור תפקיד תקין" }),
    battalion_id: battalionId.optional(),
  })
  .superRefine(checkBattalionForRole);

/** Discriminated PATCH body for /api/admin/users/[id]. */
export const userPatchSchema = z.discriminatedUnion("action", [
  approveUserSchema,
  updateRoleSchema,
]);

export type UserPatchInput = z.infer<typeof userPatchSchema>;
