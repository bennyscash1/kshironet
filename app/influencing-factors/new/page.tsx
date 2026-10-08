import { redirect } from "next/navigation";
import { isUnscopedEntityBlockActive } from "@/lib/db/repositories/system-settings";
import { UnscopedEntityNotice } from "@/components/brigades/unscoped-entity-notice";
import { listBattalions } from "@/lib/db/repositories/battalions";
import { getCurrentUser } from "@/lib/auth/user";
import { canEdit } from "@/lib/auth/permissions";
import { InfluencingFactorForm } from "@/components/influencing-factors/influencing-factor-form";

export const dynamic = "force-dynamic";

export default async function NewInfluencingFactorPage() {
  if (!canEdit(await getCurrentUser())) redirect("/calendar");
  // Reachable by typing the URL even when the list page hides its button, so the
  // block is resolved here too: the notice replaces the form rather than letting it
  // submit into a 409.
  const createBlocked = await isUnscopedEntityBlockActive();
  const battalions = await listBattalions();

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">גורם משפיע חדש</h1>
      {createBlocked && <UnscopedEntityNotice entity="influencing_factors" />}
      {!createBlocked && (
        <InfluencingFactorForm battalions={battalions} />
      )}
    </div>
  );
}
