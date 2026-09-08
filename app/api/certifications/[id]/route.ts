import { NextResponse } from "next/server";
import {
  deleteCertification,
  getCertificationById,
  listPrerequisites,
  listQuotas,
  listTaxes,
  replacePrerequisites,
  replaceQuotas,
  replaceTaxes,
  updateCertification,
} from "@/lib/db/repositories/certifications";
import { listByCertification as listCertificationFiles } from "@/lib/db/repositories/certification-files";
import { removeCertificationFiles } from "@/lib/storage/certification-files";
import { certificationPatchSchema } from "@/lib/validation/certification";
import { getCurrentRole } from "@/lib/auth/current-role";
import { requireEditor } from "@/lib/auth/user";
import { canManageCertifications } from "@/lib/auth/permissions";

/**
 * Two gates, and they are not redundant — they check different things.
 *
 * `requireEditor()` is the AUTHORIZATION gate: it resolves the signed-in user server-side
 * and runs them through `canEdit()` in lib/auth/permissions.ts. This is the one that
 * matters. `canManageCertifications(role)` reads the `active_role` COOKIE, which is a
 * view-scope selector the client can set to anything it likes — on its own it authorizes
 * nothing, and it was previously the only check here, so anyone could PATCH a
 * certification (the registration lock included) by sending `active_role=brigade`.
 *
 * The cookie check is kept because it is still meaningful as scope: a user browsing as a
 * battalion should not be writing brigade-level fields even if they are entitled to. It is
 * the second gate, never the first. `canEdit()` also returns false for `editor_battalion`,
 * which is what holds them to the lock rather than letting them move it.
 */
async function requireCertificationManager(): Promise<NextResponse | null> {
  const gate = await requireEditor();
  if (gate instanceof NextResponse) return gate;
  const role = await getCurrentRole();
  if (!canManageCertifications(role)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  return null;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const cert = await getCertificationById(Number(id));
  if (!cert) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({
    ...cert,
    prerequisites: await listPrerequisites(cert.id),
    quotas: await listQuotas(cert.id),
    taxes: await listTaxes(cert.id),
  });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const denied = await requireCertificationManager();
  if (denied) return denied;
  const { id } = await params;
  const body = await request.json();
  const parsed = certificationPatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const { prerequisites, quotas, taxes, is_unlimited, ...certInput } = parsed.data;
  // Normalize capacity only when is_unlimited was actually sent (partial update).
  if (is_unlimited !== undefined) {
    certInput.total_slots = is_unlimited ? null : certInput.total_slots ?? null;
  }
  await updateCertification(Number(id), certInput);
  if (prerequisites) await replacePrerequisites(Number(id), prerequisites);
  if (quotas) await replaceQuotas(Number(id), quotas);
  if (taxes) await replaceTaxes(Number(id), taxes);
  return NextResponse.json({ ok: true });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const denied = await requireCertificationManager();
  if (denied) return denied;
  const { id } = await params;
  // certification_files rows go away via ON DELETE CASCADE, so collect the storage
  // paths first and drop the objects too — otherwise the bucket keeps orphans.
  const files = await listCertificationFiles(Number(id));
  await deleteCertification(Number(id));
  if (files.length > 0) {
    await removeCertificationFiles(files.map((f) => f.storage_path)).catch((err) =>
      // The certification is already gone; a storage hiccup must not fail the delete.
      console.error("[certifications] failed to remove attachment objects", err)
    );
  }
  return NextResponse.json({ ok: true });
}
