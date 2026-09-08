import { z } from "zod";

const optionalPositiveInt = () =>
  z.preprocess((v) => (v === "" ? undefined : v), z.coerce.number().int().positive().nullish());

export const templateSchema = z.object({
  name: z.string().min(1, "שם התבנית נדרש"),
  domain: z.string().nullish(),
  default_location: z.string().nullish(),
  default_slots: optionalPositiveInt(),
  gap_row_id: optionalPositiveInt(),
  default_notes: z.string().nullish(),
  checkin_details: z.string().nullish(),
  duration_text: z.string().nullish(),
  trainee_ratio: z.string().nullish(),
  ammo_required: z.string().nullish(),
  requirements_text: z.string().nullish(),
  equipment_text: z.string().nullish(),
  contacts_text: z.string().nullish(),
});

export type TemplateFormValues = z.infer<typeof templateSchema>;
