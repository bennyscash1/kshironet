import { redirect } from "next/navigation";
import { listBattalions } from "@/lib/db/repositories/battalions";
import { listPaletteColors } from "@/lib/db/repositories/course-colors";
import { randomPaletteColor } from "@/lib/utils/palette";
import { getCurrentUser } from "@/lib/auth/user";
import { canEdit } from "@/lib/auth/permissions";
import { TrainingForm } from "@/components/trainings/training-form";

export const dynamic = "force-dynamic";

export default async function NewTrainingPage() {
  if (!canEdit(await getCurrentUser())) redirect("/trainings");
  const [battalions, palette] = await Promise.all([listBattalions(), listPaletteColors()]);

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">הדרכה חדשה</h1>
      <TrainingForm
        battalions={battalions}
        palette={palette}
        defaultValues={{ color_hex: randomPaletteColor(palette) }}
      />
    </div>
  );
}
