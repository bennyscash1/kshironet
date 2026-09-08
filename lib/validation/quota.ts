import { z } from "zod";

/* The per-allocation lock schema that used to live here is gone: migration 021 moved the
 * registration deadline onto the certification itself, so it travels with
 * `certificationSchema.registration_lock_date` and there is no per-battalion payload to
 * validate. See lib/validation/certification.ts. */

/** Trainee-approval payload for a quota allocation. `battalion_id` identifies the
 * allocation being approved and is cross-checked against the authenticated caller's
 * scope server-side. */
export const traineeApprovalSchema = z.object({
  battalion_id: z.coerce.number().int(),
});

export type TraineeApprovalValues = z.infer<typeof traineeApprovalSchema>;
