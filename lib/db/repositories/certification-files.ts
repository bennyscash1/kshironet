import { execute, query, queryOne } from "@/lib/db/client";
import type { PoolClient } from "pg";
import type { CertificationFile } from "@/lib/types";

/** `size_bytes` is a BIGINT, which `pg` returns as a string — cast it so callers get
 * a real number (upload sizes are capped far below the int range). */
const COLUMNS = `id, certification_id, storage_path, original_name, mime_type,
                 size_bytes::int AS size_bytes, uploaded_by, created_at`;

export interface CertificationFileInput {
  certification_id: number;
  storage_path: string;
  original_name: string;
  mime_type: string;
  size_bytes: number;
  /** Supabase auth user id of the uploader (server-side identity). */
  uploaded_by?: string | null;
}

export async function listByCertification(certificationId: number): Promise<CertificationFile[]> {
  return query<CertificationFile>(
    `SELECT ${COLUMNS} FROM certification_files
      WHERE certification_id = $1
      ORDER BY created_at ASC, id ASC`,
    [certificationId]
  );
}

export async function getById(id: number): Promise<CertificationFile | undefined> {
  return queryOne<CertificationFile>(
    `SELECT ${COLUMNS} FROM certification_files WHERE id = $1`,
    [id]
  );
}

/** Inserts the metadata row for an already-uploaded object and returns it. */
export async function create(input: CertificationFileInput): Promise<CertificationFile> {
  const result = await execute(
    `INSERT INTO certification_files
        (certification_id, storage_path, original_name, mime_type, size_bytes, uploaded_by)
       VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING ${COLUMNS}`,
    [
      input.certification_id,
      input.storage_path,
      input.original_name,
      input.mime_type,
      input.size_bytes,
      input.uploaded_by ?? null,
    ]
  );
  return result.rows[0] as CertificationFile;
}

/** Removes the metadata row only. The caller is responsible for removing the
 * storage object (see the files API routes) — the pg layer never touches Storage. */
export async function deleteFile(id: number, client?: PoolClient): Promise<number> {
  const result = await execute("DELETE FROM certification_files WHERE id = $1", [id], client);
  return result.rowCount;
}
