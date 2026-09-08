import { getStorageClient } from "@/lib/storage/client";
import { ALLOWED_FILE_MIME_TYPES, MAX_FILE_SIZE_BYTES } from "@/lib/validation/certification-file";

/** Private bucket holding certification attachments. Never public — access is only
 * ever granted through short-lived signed URLs generated server-side. */
export const CERTIFICATION_FILES_BUCKET = "certification-files";

/** Lifetime of a generated signed URL. Long enough to click through and download,
 * short enough that a leaked link expires quickly. */
export const SIGNED_URL_TTL_SECONDS = 60 * 10;

let bucketReady = false;

/** Creates the private bucket on first use, then short-circuits for the rest of the
 * process lifetime. Safe to call on every request. */
export async function ensureBucket(): Promise<void> {
  if (bucketReady) return;
  const storage = getStorageClient();

  const { data, error } = await storage.storage.getBucket(CERTIFICATION_FILES_BUCKET);
  if (data && !error) {
    bucketReady = true;
    return;
  }

  const { error: createError } = await storage.storage.createBucket(CERTIFICATION_FILES_BUCKET, {
    public: false,
    fileSizeLimit: MAX_FILE_SIZE_BYTES,
    allowedMimeTypes: [...ALLOWED_FILE_MIME_TYPES],
  });
  // A parallel request may have created it first — that is not a failure.
  if (createError && !/exists/i.test(createError.message)) {
    throw new Error(`Failed to create storage bucket: ${createError.message}`);
  }
  bucketReady = true;
}

/** Storage keys stay ASCII-safe and short. The name shown to users lives in
 * Postgres (`original_name`), so mangling here is harmless. */
function slugifyFileName(name: string): string {
  const dot = name.lastIndexOf(".");
  const rawExt = dot > 0 ? name.slice(dot + 1) : "";
  const rawBase = dot > 0 ? name.slice(0, dot) : name;
  const ext = rawExt.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 10);
  const base =
    rawBase
      .replace(/[^a-zA-Z0-9._-]+/g, "-")
      .replace(/^[-.]+|[-.]+$/g, "")
      .slice(0, 60) || "file";
  return ext ? `${base}.${ext}` : base;
}

/** Path convention: certifications/{certification_id}/{uuid}-{original_filename} */
export function buildStoragePath(certificationId: number, originalName: string): string {
  return `certifications/${certificationId}/${crypto.randomUUID()}-${slugifyFileName(originalName)}`;
}

/** Uploads the bytes at `storagePath`. Never overwrites (paths carry a UUID). */
export async function uploadCertificationFile(
  storagePath: string,
  bytes: Buffer,
  mimeType: string
): Promise<void> {
  await ensureBucket();
  const { error } = await getStorageClient()
    .storage.from(CERTIFICATION_FILES_BUCKET)
    .upload(storagePath, bytes, { contentType: mimeType, upsert: false });
  if (error) throw new Error(`Storage upload failed: ${error.message}`);
}

/** Removes objects from the bucket. Missing objects are not an error. */
export async function removeCertificationFiles(storagePaths: string[]): Promise<void> {
  if (storagePaths.length === 0) return;
  const { error } = await getStorageClient()
    .storage.from(CERTIFICATION_FILES_BUCKET)
    .remove(storagePaths);
  if (error) throw new Error(`Storage delete failed: ${error.message}`);
}

/** Short-lived signed URL for viewing/downloading a single object. */
export async function createSignedUrl(storagePath: string): Promise<string> {
  await ensureBucket();
  const { data, error } = await getStorageClient()
    .storage.from(CERTIFICATION_FILES_BUCKET)
    .createSignedUrl(storagePath, SIGNED_URL_TTL_SECONDS);
  if (error || !data?.signedUrl) {
    throw new Error(`Failed to sign ${storagePath}: ${error?.message ?? "no url returned"}`);
  }
  return data.signedUrl;
}

/** Attaches a freshly generated signed URL to each metadata row. URLs are generated
 * per request and never persisted. Rows whose object could not be signed get null. */
export async function withSignedUrls<T extends { storage_path: string }>(
  rows: T[]
): Promise<(T & { signed_url: string | null })[]> {
  if (rows.length === 0) return [];
  await ensureBucket();

  const { data, error } = await getStorageClient()
    .storage.from(CERTIFICATION_FILES_BUCKET)
    .createSignedUrls(
      rows.map((r) => r.storage_path),
      SIGNED_URL_TTL_SECONDS
    );
  if (error) throw new Error(`Failed to sign storage urls: ${error.message}`);

  // Match by path rather than by index — do not rely on response ordering.
  const urlByPath = new Map((data ?? []).map((d) => [d.path ?? "", d.signedUrl ?? null]));
  return rows.map((row) => ({ ...row, signed_url: urlByPath.get(row.storage_path) ?? null }));
}
