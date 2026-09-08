import { redirect } from "next/navigation";
import { listBattalions } from "@/lib/db/repositories/battalions";
import { getCurrentUser } from "@/lib/auth/user";
import { canEdit } from "@/lib/auth/permissions";
import { InfluencingFactorForm } from "@/components/influencing-factors/influencing-factor-form";

export const dynamic = "force-dynamic";

export default async function NewInfluencingFactorPage() {
  if (!canEdit(await getCurrentUser())) redirect("/calendar");
  const battalions = await listBattalions();

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">גורם משפיע חדש</h1>
      <InfluencingFactorForm battalions={battalions} />
    </div>
  );
}
