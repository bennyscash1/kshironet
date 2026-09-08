import { notFound, redirect } from "next/navigation";
import { getCertificationById, listPrerequisites } from "@/lib/db/repositories/certifications";
import { listBattalions } from "@/lib/db/repositories/battalions";
import { getCurrentUser } from "@/lib/auth/user";
import { canManageAnyRoster, getScopedBattalionId } from "@/lib/auth/permissions";
import { RosterForm } from "@/components/roster/roster-form";

export const dynamic = "force-dynamic";

export default async function NewRosterEntryPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ reserve?: string }>;
}) {
  const { id } = await params;
  const { reserve } = await searchParams;
  const me = await getCurrentUser();
  // The same predicate the POST handler runs. A battalion editor reaches this page now;
  // a viewer (global or battalion) still does not.
  if (!canManageAnyRoster(me)) redirect(`/certifications/${id}`);
  const cert = await getCertificationById(Number(id));
  if (!cert) notFound();
  const [allBattalions, prerequisites] = await Promise.all([
    listBattalions(),
    listPrerequisites(cert.id),
  ]);
  // A scoped editor gets exactly one option in the גדוד picker — their own. Offering the
  // others would let them submit a payload the API then refuses; this makes the form show
  // only what they may actually do. The API check stands regardless.
  const scopedBattalionId = getScopedBattalionId(me);
  const battalions =
    scopedBattalionId === null
      ? allBattalions
      : allBattalions.filter((b) => b.id === scopedBattalionId);

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">
        {reserve === "1" ? "הוספה לעתודה" : "הוספת חייל"} ל&quot;{cert.name}&quot;
      </h1>
      <RosterForm
        certificationId={cert.id}
        battalions={battalions}
        defaultBattalionId={scopedBattalionId ?? undefined}
        hasPrerequisite={prerequisites.length > 0}
        defaultIsReserve={reserve === "1"}
      />
    </div>
  );
}
