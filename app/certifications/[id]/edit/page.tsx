import { notFound } from "next/navigation";
import {
  getCertificationById,
  listPrerequisites,
  listQuotas,
  listTaxes,
} from "@/lib/db/repositories/certifications";
import { listByCertification as listCertificationFiles } from "@/lib/db/repositories/certification-files";
import { withSignedUrls } from "@/lib/storage/certification-files";
import { listBattalions } from "@/lib/db/repositories/battalions";
import { listTemplates } from "@/lib/db/repositories/templates";
import { listGapRows } from "@/lib/db/repositories/certification-gaps";
import { listPaletteColors } from "@/lib/db/repositories/course-colors";
import { randomPaletteColor } from "@/lib/utils/palette";
import { getCurrentUser } from "@/lib/auth/user";
import { canEdit } from "@/lib/auth/permissions";
import { CertificationForm } from "@/components/certifications/certification-form";
import { CertificationFiles } from "@/components/certifications/certification-files";

export const dynamic = "force-dynamic";

export default async function EditCertificationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const cert = await getCertificationById(Number(id));
  if (!cert) notFound();

  const [battalions, templates, gapRows, palette, prerequisiteRows, quotas, taxRows, me, fileRows] =
    await Promise.all([
      listBattalions(),
      listTemplates(),
      listGapRows(),
      listPaletteColors(),
      listPrerequisites(cert.id),
      listQuotas(cert.id),
      listTaxes(cert.id),
      getCurrentUser(),
      listCertificationFiles(cert.id),
    ]);
  // Signed URLs are generated server-side per request and never persisted. A storage
  // hiccup must not take the page down, so fall back to listing files without links.
  const files = await withSignedUrls(fileRows).catch(() =>
    fileRows.map((f) => ({ ...f, signed_url: null }))
  );
  const prerequisites = prerequisiteRows.map((p) => p.description);
  const defaultQuotas: Record<number, number> = {};
  for (const q of quotas) defaultQuotas[q.battalion_id] = q.allocated_slots;
  const defaultTaxes = taxRows.map((t) => ({
    role_name: t.role_name,
    is_fulfilled: t.is_fulfilled === 1,
  }));

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">עריכת הסמכה</h1>
      <CertificationForm
        battalions={battalions}
        templates={templates}
        gapRows={gapRows}
        palette={palette}
        certificationId={cert.id}
        defaultQuotas={defaultQuotas}
        defaultTaxes={defaultTaxes}
        defaultValues={{
          name: cert.name,
          domain: cert.domain ?? "",
          start_date: cert.start_date,
          end_date: cert.end_date ?? "",
          location: cert.location ?? "",
          total_slots: cert.total_slots ?? undefined,
          is_unlimited: cert.total_slots === null,
          gap_row_id: cert.gap_row_id ?? undefined,
          registration_open: cert.registration_open === 1,
          notes: cert.notes ?? "",
          color_hex: cert.color_hex ?? randomPaletteColor(palette),
          prerequisites,
        }}
      />

      {/* Same shared component the detail page uses — one source of truth for the file
          list and the upload/delete flow. Shown only to users who may edit, matching
          the guard the API routes enforce server-side. `max-w-2xl` keeps it aligned
          with the form above it. */}
      {canEdit(me) && (
        <CertificationFiles
          certificationId={cert.id}
          files={files}
          canManage
          className="max-w-2xl"
        />
      )}
    </div>
  );
}
