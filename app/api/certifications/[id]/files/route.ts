import { NextResponse } from "next/server";
import { getCertificationById } from "@/lib/db/repositories/certifications";
import {
  create as createCertificationFile,
  listByCertification,
} from "@/lib/db/repositories/certification-files";
import {
  buildStoragePath,
  removeCertificationFiles,
  uploadCertificationFile,
  withSignedUrls,
} from "@/lib/storage/certification-files";
import { certificationFileUploadSchema } from "@/lib/validation/certification-file";
import { requireEditor } from "@/lib/auth/user";

/** Files attached to a certification, each with a freshly generated signed URL.
 * URLs are produced per request and never stored. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  // Same privilege as editing a certification (server-side identity — the
  // active_role cookie is never trusted for authorization).
  const gate = await requireEditor();
  if (gate instanceof NextResponse) return gate;

  const { id } = await params;
  const files = await listByCertification(Number(id));
  try {
    return NextResponse.json(await withSignedUrls(files));
  } catch (err) {
    console.error("[certification-files] failed to sign urls", err);
    return NextResponse.json({ error: "storage unavailable" }, { status: 502 });
  }
}

/** Uploads one file (multipart/form-data, field name `file`) and stores its
 * metadata. The field name is the contract with the UI — keep both in sync. */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const gate = await requireEditor();
  if (gate instanceof NextResponse) return gate;
  const user = gate;

  const { id } = await params;
  const certificationId = Number(id);
  const cert = await getCertificationById(certificationId);
  if (!cert) return NextResponse.json({ error: "not found" }, { status: 404 });

  const formData = await request.formData();
  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "missing file" }, { status: 400 });
  }

  // Type/size are validated here, server-side — the client pre-check is only UX.
  const parsed = certificationFileUploadSchema.safeParse({
    original_name: file.name,
    mime_type: file.type,
    size_bytes: file.size,
  });
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const storagePath = buildStoragePath(certificationId, parsed.data.original_name);
  try {
    await uploadCertificationFile(
      storagePath,
      Buffer.from(await file.arrayBuffer()),
      parsed.data.mime_type
    );
  } catch (err) {
    console.error("[certification-files] upload failed", err);
    return NextResponse.json({ error: "upload failed" }, { status: 502 });
  }

  let created;
  try {
    created = await createCertificationFile({
      certification_id: certificationId,
      storage_path: storagePath,
      original_name: parsed.data.original_name,
      mime_type: parsed.data.mime_type,
      size_bytes: parsed.data.size_bytes,
      uploaded_by: user.id,
    });
  } catch (err) {
    // The object is already in the bucket but has no metadata row — roll it back
    // so the bucket never accumulates unreferenced objects.
    console.error("[certification-files] metadata insert failed, removing object", err);
    await removeCertificationFiles([storagePath]).catch((cleanupErr) =>
      console.error("[certification-files] rollback of storage object failed", cleanupErr)
    );
    return NextResponse.json({ error: "upload failed" }, { status: 500 });
  }

  const [withUrl] = await withSignedUrls([created]).catch(() => [
    { ...created, signed_url: null },
  ]);
  return NextResponse.json(withUrl, { status: 201 });
}
