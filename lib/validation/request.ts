import { z } from "zod";
import { REQUEST_STATUSES, URGENCY_LEVELS, type RequestStatus, type Urgency } from "@/lib/types";

/** A soldier attached to a request at creation time. Stored in `roster_entries` with a
 * NULL certification_id. Field names match the request form's payload exactly. */
export const requestSoldierSchema = z.object({
  battalion_id: z.coerce.number().int(),
  full_name: z.string().min(1, "שם מלא נדרש"),
  personal_number: z.string().min(1, "מספר אישי נדרש"),
  company_platoon: z.string().nullish(),
  phone: z.string().nullish(),
  commander_name: z.string().nullish(),
  commander_phone: z.string().nullish(),
  has_prior_certification: z.boolean().default(false),
  requires_lodging: z.boolean().default(false),
  is_reserve: z.boolean().default(false),
  notes: z.string().nullish(),
});

export type RequestSoldierValues = z.infer<typeof requestSoldierSchema>;

export const requestSchema = z.object({
  battalion_id: z.coerce.number().int(),
  requested_cert_type: z.string().min(1, "סוג ההסמכה נדרש"),
  quantity_needed: z.coerce.number().int().positive("כמות נדרשת חייבת להיות חיובית"),
  reason: z.string().nullish(),
  urgency: z.enum(URGENCY_LEVELS as [Urgency, ...Urgency[]]).default("normal"),
  desired_date: z.string().nullish(),
  notes: z.string().nullish(),
  /** Optional; may be empty. Every entry present must carry at least a full name and a
   * personal number (enforced by requestSoldierSchema). */
  soldiers: z.array(requestSoldierSchema).default([]),
});

export type RequestFormValues = z.infer<typeof requestSchema>;

export const requestStatusSchema = z.object({
  status: z.enum(REQUEST_STATUSES as [RequestStatus, ...RequestStatus[]]),
  note: z.string().nullish(),
});
