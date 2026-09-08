import { z } from "zod";

export const KNOWN_TRAINING_DOMAINS = ["מרגמות", 'פק"לים', "רפואה", "נשק"];

export const trainingSessionSchema = z.object({
  battalion_id: z.coerce.number().int().positive("יש לבחור יחידה"),
  session_date: z.string().min(1, "תאריך נדרש"),
  start_time: z.string().min(1, "שעת התחלה נדרשת"),
  end_time: z.string().min(1, "שעת סיום נדרשת"),
  location: z.string().nullish(),
  instructor_name: z.string().nullish(),
  instructor_phone: z.string().nullish(),
  notes: z.string().nullish(),
});

export const trainingSchema = z.object({
  name: z.string().min(1, "שם ההדרכה נדרש"),
  domain: z.string().nullish(),
  start_date: z.string().min(1, "תאריך התחלה נדרש"),
  end_date: z.string().nullish(),
  contact_name: z.string().nullish(),
  contact_phone: z.string().nullish(),
  notes: z.string().nullish(),
  color_hex: z.string().regex(/^#[0-9a-fA-F]{6}$/, "צבע לא תקין").nullish(),
  sessions: z.array(trainingSessionSchema).default([]),
});

export type TrainingFormValues = z.infer<typeof trainingSchema>;
export type TrainingSessionFormValues = z.infer<typeof trainingSessionSchema>;
