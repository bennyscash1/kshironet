import { z } from "zod";
import { ROSTER_STATUSES, type RosterStatus } from "@/lib/types";

export const rosterEntrySchema = z.object({
  battalion_id: z.coerce.number().int(),
  full_name: z.string().min(1, "שם מלא נדרש"),
  personal_number: z.string().min(1, "מספר אישי נדרש"),
  company_platoon: z.string().nullish(),
  phone: z.string().nullish(),
  commander_name: z.string().nullish(),
  commander_phone: z.string().nullish(),
  has_prior_certification: z.boolean().default(false),
  prior_certification_details: z.string().nullish(),
  requires_lodging: z.boolean().default(false),
  meets_prerequisite: z.boolean().nullish(),
  notes: z.string().nullish(),
  is_reserve: z.boolean().default(false),
});

export type RosterFormValues = z.infer<typeof rosterEntrySchema>;

/**
 * Payload for the battalion-scoped roster endpoints under `/api/battalions/…`.
 * `battalion_id` is deliberately absent: the target battalion comes from the route and is
 * checked against the caller's own row, so a client cannot register a soldier under
 * another unit by editing the body.
 */
export const battalionRosterEntrySchema = rosterEntrySchema.omit({ battalion_id: true });

export type BattalionRosterFormValues = z.infer<typeof battalionRosterEntrySchema>;

export const rosterStatusSchema = z.object({
  status: z.enum(ROSTER_STATUSES as [RosterStatus, ...RosterStatus[]]),
  note: z.string().nullish(),
  outcome_reason: z.string().nullish(),
});
