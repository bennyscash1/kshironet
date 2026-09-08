import { z } from "zod";

/** Storage/wire format for every date in this app: 'yyyy-MM-dd'. */
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

const isoDate = z.string().regex(ISO_DATE, "תאריך אינו תקין");

/**
 * Longest span the weekly export will produce.
 *
 * The button sends exactly seven days; the cap exists because the route takes the range
 * from the query string, and an unbounded `from`/`to` is a trivially cheap way for a
 * signed-in user to ask the server to render a several-hundred-page PDF. 31 days leaves
 * room for a deliberate month-long export without allowing that.
 */
export const MAX_EXPORT_SPAN_DAYS = 31;

/**
 * Query params for GET /api/battalions/[id]/weekly-export.
 *
 * The battalion id is NOT validated here — it comes from the path and, more importantly,
 * is an authorization input, so the route checks it against the authenticated user's scope
 * via lib/auth/permissions.ts rather than trusting any shape check.
 */
export const weeklyExportQuerySchema = z
  .object({
    from: isoDate,
    to: isoDate,
  })
  .refine((v) => v.to >= v.from, {
    // ISO dates compare lexicographically, so this needs no parsing.
    path: ["to"],
    message: "תאריך הסיום חייב להיות אחרי תאריך ההתחלה",
  })
  .refine(
    (v) => {
      const days =
        (Date.parse(`${v.to}T00:00:00Z`) - Date.parse(`${v.from}T00:00:00Z`)) / 86_400_000;
      return days <= MAX_EXPORT_SPAN_DAYS - 1;
    },
    { path: ["to"], message: `הטווח המרבי לייצוא הוא ${MAX_EXPORT_SPAN_DAYS} ימים` }
  );

export type WeeklyExportQuery = z.infer<typeof weeklyExportQuerySchema>;

/** Path param. Coerced because it arrives as a string. */
export const battalionIdParamSchema = z.coerce
  .number()
  .int()
  .positive("מזהה גדוד אינו תקין");
