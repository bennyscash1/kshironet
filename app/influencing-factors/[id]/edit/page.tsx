import { notFound, redirect } from "next/navigation";
import {
  getInfluencingFactorById,
  getInfluencingFactorBattalionIds,
} from "@/lib/db/repositories/influencing-factors";
import { listBattalions } from "@/lib/db/repositories/battalions";
import { getCurrentUser } from "@/lib/auth/user";
import { canEdit } from "@/lib/auth/permissions";
import { InfluencingFactorForm } from "@/components/influencing-factors/influencing-factor-form";

export const dynamic = "force-dynamic";

export default async function EditInfluencingFactorPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!canEdit(await getCurrentUser())) redirect(`/influencing-factors/${id}`);

  const factor = await getInfluencingFactorById(Number(id));
  if (!factor) notFound();

  const [battalions, battalionIds] = await Promise.all([
    listBattalions(),
    getInfluencingFactorBattalionIds(factor.id),
  ]);

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">עריכת גורם משפיע</h1>
      <InfluencingFactorForm
        battalions={battalions}
        factorId={factor.id}
        defaultValues={{
          name: factor.name,
          start_date: factor.start_date,
          end_date: factor.end_date ?? "",
          notes: factor.notes ?? "",
        }}
        defaultBattalionIds={battalionIds}
      />
    </div>
  );
}
