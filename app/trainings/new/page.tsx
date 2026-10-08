import { redirect } from "next/navigation";
import { isUnscopedEntityBlockActive } from "@/lib/db/repositories/system-settings";
import { UnscopedEntityNotice } from "@/components/brigades/unscoped-entity-notice";
import { listBattalions } from "@/lib/db/repositories/battalions";
import { listPaletteColors } from "@/lib/db/repositories/course-colors";
import { randomPaletteColor } from "@/lib/utils/palette";
import { getCurrentUser } from "@/lib/auth/user";
import { canEdit } from "@/lib/auth/permissions";
import { TrainingForm } from "@/components/trainings/training-form";

export const dynamic = "force-dynamic";

export default async function NewTrainingPage() {
  if (!canEdit(await getCurrentUser())) redirect("/trainings");
  // Reachable by typing the URL even when the list page hides its button, so the
  // block is resolved here too: the notice replaces the form rather than letting it
  // submit into a 409.
  const createBlocked = await isUnscopedEntityBlockActive();
  const [battalions, palette] = await Promise.all([listBattalions(), listPaletteColors()]);

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">הדרכה חדשה</h1>
      {createBlocked && <UnscopedEntityNotice entity="trainings" />}
      {!createBlocked && (
        <TrainingForm
          battalions={battalions}
          palette={palette}
          defaultValues={{ color_hex: randomPaletteColor(palette) }}
        />
      )}
    </div>
  );
}
