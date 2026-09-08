import { z } from "zod";

/**
 * Zod schemas for the force-structure write paths (spec §2.5).
 *
 * THE CENTRAL INVARIANT (§0.3.1): a post's requirements are static reference data. No
 * endpoint may accept requirement fields and assignment fields in one payload, so the
 * schemas below share NO common base object — no `.extend()`, no `.merge()`. A shared base
 * is exactly how the two payloads would eventually re-converge, and once they do, a single
 * careless spread makes an assignment able to rewrite what its post requires.
 */

/**
 * Fields that belong to the establishment and must never arrive on an assignment payload.
 *
 * `z.strictObject` already rejects unknown keys, so this list is belt-and-braces — but it
 * gives the refusal a specific, testable message instead of a generic "unrecognized key",
 * and it states the intent to the next reader.
 */
export const REFERENCE_ONLY_FIELDS = [
  "req1",
  "req2",
  "req3",
  "role_name",
  "serial",
  "department",
  "squad",
] as const;

function rejectReferenceFields(value: object, ctx: z.RefinementCtx): void {
  for (const field of REFERENCE_ONLY_FIELDS) {
    if (field in value) {
      ctx.addIssue({
        code: "custom",
        path: [field],
        message: `השדה "${field}" הוא נתון ייחוס של התקן ואינו ניתן לעריכה מנתיב שיבוץ`,
      });
    }
  }
}

/** POST /api/force-structure/assignments — writes `role_assignments`, never `roles`. */
export const assignmentCreateSchema = z
  .strictObject({
    role_id: z.coerce.number().int().positive(),
    full_name: z.string().min(1, "שם מלא נדרש"),
    // Required, and deliberately so: the API cannot create a pending-identity soldier.
    // Only the importer can, from a source that genuinely lacks the number.
    personal_number: z.string().min(1, "מספר אישי נדרש"),
    rank: z.string().nullish(),
    phone: z.string().nullish(),
  })
  .superRefine(rejectReferenceFields);

export type AssignmentCreateInput = z.infer<typeof assignmentCreateSchema>;

/** POST /api/force-structure/assignments/[id]/move — moves a soldier between posts, or to
 * the bank. Carries no soldier fields at all: it moves an existing record. */
export const assignmentMoveSchema = z
  .strictObject({
    target: z.discriminatedUnion("kind", [
      z.strictObject({ kind: z.literal("role"), role_id: z.coerce.number().int().positive() }),
      z.strictObject({ kind: z.literal("bank") }),
    ]),
  })
  .superRefine(rejectReferenceFields);

/** POST /api/force-structure/bank — writes `bank_soldiers`, never `roles`. */
export const bankSoldierSchema = z
  .strictObject({
    company_id: z.coerce.number().int().positive(),
    department: z.string().nullish(),
    full_name: z.string().min(1, "שם מלא נדרש"),
    personal_number: z.string().min(1, "מספר אישי נדרש"),
    rank: z.string().nullish(),
    note: z.string().nullish(),
  })
  .superRefine(rejectReferenceFields);

/** POST /api/force-structure/soldier-certifications — writes `soldier_certifications`
 * only. Never `certifications`, never `roster_entries` (§0.3.2). */
export const soldierCertificationSchema = z
  .strictObject({
    personal_number: z.string().min(1, "מספר אישי נדרש"),
    certification_name: z.string().min(1, "שם הסמכה נדרש"),
  })
  .superRefine(rejectReferenceFields);

/**
 * POST /api/force-structure/admin/roles — the SEEDING path.
 *
 * This is the only schema that carries requirement fields, and it lives behind a
 * super-admin gate rather than the battalion-editor gate. It shares no structure with the
 * schemas above by design.
 */
export const roleSeedSchema = z.strictObject({
  company_id: z.coerce.number().int().positive(),
  department: z.string().min(1),
  squad: z.string().nullish(),
  serial: z.string().min(1),
  role_name: z.string().min(1),
  req1: z.string().nullish(),
  req2: z.string().nullish(),
  req3: z.string().nullish(),
});

export type RoleSeedInput = z.infer<typeof roleSeedSchema>;
