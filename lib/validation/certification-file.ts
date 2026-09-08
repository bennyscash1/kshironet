import { z } from "zod";

/** Attachment types the system accepts — images and PDF only, for now. Used by the
 * server-side gate AND mirrored by the client pre-check (`ALLOWED_FILE_ACCEPT`). */
export const ALLOWED_FILE_MIME_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "application/pdf",
] as const;

export type AllowedFileMimeType = (typeof ALLOWED_FILE_MIME_TYPES)[number];

/** Value for the file input's `accept` attribute (client-side hint only — the
 * server re-validates every upload and never trusts the browser). */
export const ALLOWED_FILE_ACCEPT = ALLOWED_FILE_MIME_TYPES.join(",");

/** Single upload size ceiling, enforced server-side.
 * Kept at 4MB because uploads go through a Route Handler, and the platform the app
 * is deployed on (Vercel serverless) rejects request bodies over ~4.5MB before they
 * reach our code. Raise this only together with the deployment's body-size limit. */
export const MAX_FILE_SIZE_BYTES = 4 * 1024 * 1024;

/** Hebrew label for the limit above, for UI copy and error messages. */
export const MAX_FILE_SIZE_LABEL = "4 מ״ב";

const TYPE_ERROR = "סוג הקובץ אינו נתמך — ניתן לצרף תמונות (PNG, JPG, WEBP) או PDF";
const SIZE_ERROR = `הקובץ גדול מדי — עד ${MAX_FILE_SIZE_LABEL} לקובץ`;

export const FILE_TYPE_ERROR = TYPE_ERROR;
export const FILE_SIZE_ERROR = SIZE_ERROR;

/** Server-side gate on the metadata extracted from the multipart `file` part.
 * Field names match the columns/UI payload exactly. */
export const certificationFileUploadSchema = z.object({
  original_name: z.string().min(1, "שם הקובץ נדרש"),
  mime_type: z.enum(ALLOWED_FILE_MIME_TYPES, TYPE_ERROR),
  size_bytes: z
    .number()
    .int()
    .positive("הקובץ ריק")
    .max(MAX_FILE_SIZE_BYTES, SIZE_ERROR),
});

/** Shape of a persisted attachment row (mirrors `certification_files`). */
export const certificationFileSchema = z.object({
  id: z.number().int(),
  certification_id: z.number().int(),
  storage_path: z.string(),
  original_name: z.string(),
  mime_type: z.string(),
  size_bytes: z.number().int(),
  uploaded_by: z.string().nullable(),
  created_at: z.string(),
});

/** API response shape: the row plus a freshly generated signed URL. The URL is
 * short-lived and never persisted — it is regenerated on every request. */
export const certificationFileWithUrlSchema = certificationFileSchema.extend({
  signed_url: z.string().nullable(),
});

export type CertificationFileUploadValues = z.infer<typeof certificationFileUploadSchema>;

/** Client-side pre-check mirroring the server rules. Returns a Hebrew error
 * message, or null when the file is acceptable. */
export function checkFileClientSide(file: File): string | null {
  if (!(ALLOWED_FILE_MIME_TYPES as readonly string[]).includes(file.type)) return TYPE_ERROR;
  if (file.size <= 0) return "הקובץ ריק";
  if (file.size > MAX_FILE_SIZE_BYTES) return SIZE_ERROR;
  return null;
}
