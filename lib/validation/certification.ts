import { z } from "zod";
import { CERTIFICATION_STATUSES, type CertificationStatus } from "@/lib/types";

/** Base object schema. Kept as a plain ZodObject so `.partial()` still works for
 * PATCH. Cross-field validation (capacity required unless unlimited) lives in the
 * refined `certificationCreateSchema` / `certificationPatchSchema` below.
 *
 * Capacity model: `total_slots === null` means "unlimited" (אין מגבלה). The
 * `is_unlimited` flag is a UI-only convenience — it is NOT persisted; the server
 * normalizes capacity to NULL when it is set. An empty number input ("") is
 * coerced to `null` (not 0) so it can be treated as "missing".
 */
export const certificationSchema = z.object({
  template_id: z.coerce.number().int().nullish(),
  name: z.string().min(1, "שם ההסמכה נדרש"),
  domain: z.string().nullish(),
  start_date: z.string().min(1, "תאריך התחלה נדרש"),
  end_date: z.string().nullish(),
  location: z.string().nullish(),
  total_slots: z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? null : v),
    z.coerce.number().int().positive("מספר המקומות חייב להיות מספר חיובי").nullish()
  ),
  is_unlimited: z.boolean().default(false),
  gap_row_id: z.coerce.number().int().nullish(),
  registration_open: z.boolean().default(false),
  /** Last day trainees may be registered, 'yyyy-MM-dd'. ONE date for the whole
   * certification — every battalion's allocation closes on it (migration 021).
   *
   * An empty string is coerced to null rather than rejected, because that is what a cleared
   * `<input type="date">` sends and "no deadline" is a legitimate state. The format is
   * pinned because the value is compared as text, not parsed — a stray timestamp would
   * compare wrong instead of merely looking wrong. See lib/utils/registration-lock.ts. */
  registration_lock_date: z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? null : v),
    z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "מועד נעילת ההרשמה אינו תקין")
      .nullish()
  ),
  /** The closing HOUR on that date, 0–23 Israel wall-clock (migration 022). NULL = end of
   * the lock day, the pre-022 meaning.
   *
   * WHOLE HOURS ONLY, enforced here as well as by the column's CHECK: `.int()` turns away
   * 17.5, and a "17:30" from a stray `<input type="time">` coerces to NaN and is rejected
   * rather than truncated. Truncating would be the dangerous outcome — a deadline quietly
   * moved half an hour earlier than what was typed.
   *
   * An empty string is coerced to null, because that is what a cleared select sends and
   * "no hour" is a legitimate state. */
  registration_lock_hour: z.preprocess(
    (v) => (v === "" || v === null ? null : v),
    z.coerce
      .number()
      .int("שעת נעילת ההרשמה חייבת להיות שעה שלמה")
      .min(0, "שעת נעילת ההרשמה אינה תקינה")
      .max(23, "שעת נעילת ההרשמה אינה תקינה")
      .nullish()
  ),
  notes: z.string().nullish(),
  color_hex: z.string().regex(/^#[0-9a-fA-F]{6}$/, "צבע לא תקין").nullish(),
  prerequisites: z.array(z.string()).default([]),
  quotas: z
    .array(z.object({ battalion_id: z.number(), allocated_slots: z.number().int().min(0) }))
    .default([]),
  taxes: z
    .array(z.object({ role_name: z.string().min(1), is_fulfilled: z.boolean().default(false) }))
    .default([]),
});

/** An hour with no date is not a deadline — there is nothing for it to be an hour OF, and
 * the lock check would ignore it while the UI had nowhere to show it. Rejected rather than
 * silently dropped so a client bug surfaces as a 400 instead of a deadline that vanished.
 * The repository normalizes the same case as a second line of defence. */
function checkLockHourHasDate(
  data: { registration_lock_date?: string | null; registration_lock_hour?: number | null },
  ctx: z.RefinementCtx
) {
  if (data.registration_lock_date === null && typeof data.registration_lock_hour === "number") {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["registration_lock_hour"],
      message: "לא ניתן לקבוע שעת נעילה ללא מועד נעילה",
    });
  }
}

/** Requires a positive capacity unless "unlimited" is set. Used for create (POST)
 * and the form resolver (create + edit). */
export const certificationCreateSchema = certificationSchema.superRefine((data, ctx) => {
  if (!data.is_unlimited && data.total_slots == null) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["total_slots"],
      message: "יש להזין מספר מקומות או לסמן “אין מגבלה”",
    });
  }
  checkLockHourHasDate(data, ctx);
});

/** Partial variant for PATCH. Only enforces the capacity rule when the caller
 * explicitly sends `is_unlimited: false` together with a null capacity. */
export const certificationPatchSchema = certificationSchema.partial().superRefine((data, ctx) => {
  if (data.is_unlimited === false && data.total_slots === null) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["total_slots"],
      message: "יש להזין מספר מקומות או לסמן “אין מגבלה”",
    });
  }
  checkLockHourHasDate(data, ctx);
});

export type CertificationFormValues = z.infer<typeof certificationSchema>;

export const certificationStatusSchema = z.object({
  status: z.enum(CERTIFICATION_STATUSES as [CertificationStatus, ...CertificationStatus[]]),
  note: z.string().nullish(),
});
