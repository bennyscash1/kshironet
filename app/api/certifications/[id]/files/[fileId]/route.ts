import { NextResponse } from "next/server";
import {
  deleteFile,
  getById as getCertificationFileById,
} from "@/lib/db/repositories/certification-files";
import { removeCertificationFiles } from "@/lib/storage/certification-files";
import { requireEditor } from "@/lib/auth/user";

/** Deletes an attachment: the Storage object first, then the metadata row. Both must
 * succeed — a partial failure is surfaced rather than silently swallowed. */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string; fileId: string }> }
) {
  const gate = await requireEditor();
  if (gate instanceof NextResponse) return gate;

  const { id, fileId } = await params;
  const file = await getCertificationFileById(Number(fileId));
  // The file must belong to the certification in the path — no cross-certification
  // deletes via a guessed id.
  if (!file || file.certification_id !== Number(id)) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  try {
    await removeCertificationFiles([file.storage_path]);
  } catch (err) {
    // Nothing was removed from Postgres yet, so the record stays consistent.
    console.error("[certification-files] storage delete failed", err);
    return NextResponse.json({ error: "storage delete failed" }, { status: 502 });
  }

  try {
    await deleteFile(file.id);
  } catch (err) {
    // The object is gone but its row survived — the row now points at nothing, so
    // say so explicitly instead of reporting success.
    console.error("[certification-files] metadata delete failed after storage delete", err);
    return NextResponse.json(
      { error: "file removed from storage but metadata delete failed" },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true });
}
