import { z } from "zod";

/** True only for a real calendar date. `Date.parse` is not enough — it rolls
 * "2026-02-31" over to March instead of failing, and such a value would then blow up
 * the `::date` cast in the SQL (a 500 instead of a clean 400). */
function isRealDate(value: string): boolean {
  const [year, month, day] = value.split("-").map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return (
    parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month - 1 &&
    parsed.getUTCDate() === day
  );
}

/** yyyy-MM-dd calendar date. `requiredMessage` covers missing/non-string input. */
function isoDate(requiredMessage: string) {
  return z
    .string(requiredMessage)
    .regex(/^\d{4}-\d{2}-\d{2}$/, "תאריך לא תקין")
    .refine(isRealDate, "תאריך לא תקין");
}

/** The pivot selection: which battalions, which certifications, which date window.
 * Field names match exactly what the widget UI sends. */
const pivotSelection = z.object({
  battalionIds: z
    .array(z.coerce.number().int().positive())
    .min(1, "יש לבחור לפחות גדוד אחד"),
  certificationIds: z
    .array(z.coerce.number().int().positive())
    .min(1, "יש לבחור לפחות הסמכה אחת"),
  fromDate: isoDate("תאריך התחלה נדרש"),
  // An empty input arrives as "" — treat it as "no upper bound".
  toDate: z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? null : v),
    isoDate("תאריך לא תקין").nullish()
  ),
});

function checkDateOrder(
  data: { fromDate: string; toDate?: string | null },
  ctx: z.RefinementCtx
) {
  if (data.toDate && data.toDate < data.fromDate) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["toDate"],
      message: "תאריך הסיום חייב להיות מתאריך ההתחלה או אחריו",
    });
  }
}

/** Request payload for running the certification-pivot report. */
export const pivotQuerySchema = pivotSelection.superRefine(checkDateOrder);

export type PivotQueryValues = z.infer<typeof pivotQuerySchema>;

/** The stored `config` of a saved widget — same shape as a report request. Also used to
 * validate rows coming BACK from the database, since jsonb is unconstrained and a
 * hand-edited row must not crash the report page. */
export const pivotWidgetConfigSchema = pivotSelection.superRefine(checkDateOrder);

/** Payload for saving a widget. */
export const pivotWidgetSaveSchema = z.object({
  name: z.string("שם הווידג׳ט נדרש").trim().min(1, "שם הווידג׳ט נדרש").max(120, "השם ארוך מדי"),
  config: pivotWidgetConfigSchema,
});

export type PivotWidgetSaveValues = z.infer<typeof pivotWidgetSaveSchema>;

/** Route param guard: the widget id is a uuid, and a non-uuid string would otherwise
 * reach Postgres and fail the uuid cast as a 500 instead of a clean 400. */
export const pivotWidgetIdSchema = z.string().uuid("מזהה ווידג׳ט לא תקין");

// --- Report OUTPUT ------------------------------------------------------------------
// The report response changed shape when per-soldier completion replaced the old
// unconditional COUNT(*), so the client validates what comes back rather than casting it.
// A stale cached bundle or a half-deployed API then degrades to a visible error instead of
// rendering `undefined` soldiers as blank rows next to a total that does not match them.

const countOutcome = z.enum(["counted", "excluded", "unrecognized"]);

const battalionTally = z.object({
  battalion_id: z.number().int(),
  battalion_code: z.string(),
  battalion_name: z.string(),
  color_hex: z.string(),
  counted_count: z.number().int().nonnegative(),
  excluded_count: z.number().int().nonnegative(),
  unrecognized_count: z.number().int().nonnegative(),
  reserve_count: z.number().int().nonnegative(),
  total_count: z.number().int().nonnegative(),
});

const pivotSoldier = z.object({
  roster_entry_id: z.number().int(),
  battalion_id: z.number().int(),
  battalion_name: z.string(),
  color_hex: z.string(),
  certification_id: z.number().int(),
  certification_name: z.string(),
  full_name: z.string(),
  personal_number: z.string(),
  // Loose on purpose: an unrecognized legacy value must survive the round trip so the UI
  // can label it "סטטוס לא ידוע" and count it as unrecognized. Narrowing it to the
  // RosterStatus union here would reject the whole report over one odd row.
  status: z.string(),
  is_reserve: z.number().int(),
  outcome: countOutcome,
});

/** What POST /api/reports/pivot returns. */
export const pivotReportSchema = z.object({
  rows: z.array(battalionTally),
  soldiers: z.array(pivotSoldier),
});

export type PivotReportValues = z.infer<typeof pivotReportSchema>;
