import { z } from "zod";

/** A designated soldier attached to a battalion request. Field names match the UI
 * payload exactly (full_name / personal_number / phone / battalion_id). */
export const requestSoldierSchema = z.object({
  full_name: z.string().min(1, "שם מלא נדרש"),
  personal_number: z.string().nullish(),
  phone: z.string().nullish(),
  battalion_id: z.coerce.number().int("יש לבחור גדוד"),
});

export type RequestSoldierFormValues = z.infer<typeof requestSoldierSchema>;
