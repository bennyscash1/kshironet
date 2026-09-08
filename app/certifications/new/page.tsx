import { redirect } from "next/navigation";
import { listBattalions } from "@/lib/db/repositories/battalions";
import { listTemplates } from "@/lib/db/repositories/templates";
import { listGapRows } from "@/lib/db/repositories/certification-gaps";
import { listPaletteColors } from "@/lib/db/repositories/course-colors";
import { randomPaletteColor } from "@/lib/utils/palette";
import { getCurrentUser } from "@/lib/auth/user";
import { canEdit } from "@/lib/auth/permissions";
import { CertificationForm } from "@/components/certifications/certification-form";

export const dynamic = "force-dynamic";

export default async function NewCertificationPage() {
  if (!canEdit(await getCurrentUser())) redirect("/certifications");
  const [battalions, templates, gapRows, palette] = await Promise.all([
    listBattalions(),
    listTemplates(),
    listGapRows(),
    listPaletteColors(),
  ]);

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">הסמכה חדשה</h1>
      {/* No upload control in the create flow — files attach to a saved certification. */}
      <p className="text-sm text-muted-foreground">ניתן לצרף קבצים לאחר שמירת ההסמכה.</p>
      <CertificationForm
        battalions={battalions}
        templates={templates}
        gapRows={gapRows}
        palette={palette}
        defaultValues={{ color_hex: randomPaletteColor(palette) }}
      />
    </div>
  );
}
