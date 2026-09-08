import { notFound, redirect } from "next/navigation";
import { getCertificationById, listPrerequisites } from "@/lib/db/repositories/certifications";
import { getRosterEntry } from "@/lib/db/repositories/roster";
import { listBattalions } from "@/lib/db/repositories/battalions";
import { getCurrentUser } from "@/lib/auth/user";
import { canManageRosterEntry, getScopedBattalionId } from "@/lib/auth/permissions";
import { RosterForm } from "@/components/roster/roster-form";
import { RosterStatusChanger } from "@/components/roster/roster-status-changer";

export const dynamic = "force-dynamic";

export default async function EditRosterEntryPage({
  params,
}: {
  params: Promise<{ id: string; entryId: string }>;
}) {
  const { id, entryId } = await params;
  const me = await getCurrentUser();
  const [cert, entry] = await Promise.all([
    getCertificationById(Number(id)),
    getRosterEntry(Number(entryId)),
  ]);
  if (!cert || !entry) notFound();
  // Ownership decides the page, not just the buttons: a battalion editor opening another
  // battalion's entry is bounced here, and the API refuses the same request independently.
  // `canManage` is the SAME predicate — a battalion editor gets the identical set of status
  // transitions brigade HQ gets, which the old cookie-based `canApproveRoster` denied them.
  const canManage = canManageRosterEntry(me, entry.battalion_id);
  if (!canManage) redirect(`/certifications/${id}`);
  const [allBattalions, prerequisites] = await Promise.all([
    listBattalions(),
    listPrerequisites(cert.id),
  ]);
  const scopedBattalionId = getScopedBattalionId(me);
  const battalions =
    scopedBattalionId === null
      ? allBattalions
      : allBattalions.filter((b) => b.id === scopedBattalionId);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">עריכת {entry.full_name} - {cert.name}</h1>
      <RosterStatusChanger entry={entry} canManage={canManage} />
      <RosterForm
        certificationId={cert.id}
        battalions={battalions}
        entry={entry}
        hasPrerequisite={prerequisites.length > 0}
      />
    </div>
  );
}
