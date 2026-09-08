import { z } from "zod";

export const influencingFactorSchema = z
  .object({
    name: z.string().min(1, "שם הגורם המשפיע נדרש"),
    start_date: z.string().min(1, "תאריך התחלה נדרש"),
    end_date: z.string().nullish(),
    notes: z.string().nullish(),
    battalion_ids: z.array(z.coerce.number().int().positive()).default([]),
  })
  .refine((d) => !d.end_date || d.end_date >= d.start_date, {
    message: "תאריך הסיום חייב להיות אחרי תאריך ההתחלה",
    path: ["end_date"],
  });

export type InfluencingFactorFormValues = z.infer<typeof influencingFactorSchema>;
