import { redirect } from "next/navigation";
import { listBattalions, getBattalionByCode } from "@/lib/db/repositories/battalions";
import { activeBrigadeId } from "@/lib/auth/active-brigade";
import { getCurrentRole } from "@/lib/auth/current-role";
import { getCurrentUser } from "@/lib/auth/user";
import { battalionCodeOf, canEdit, canEditBattalion, isBrigade } from "@/lib/auth/permissions";
import { getBattalionScope } from "@/lib/auth/scope";
import { RequestForm } from "@/components/requests/request-form";

export const dynamic = "force-dynamic";

export default async function NewRequestPage() {
  const me = await getCurrentUser();
  const scope = await getBattalionScope();
  // Scoped editors may submit for their own battalion; scoped viewers may not submit at
  // all. Global roles keep the original canEdit() gate.
  const allowed = scope ? canEditBattalion(me, scope.battalionId) : canEdit(me);
  if (!allowed) redirect("/requests");

  const role = await getCurrentRole();
  const allBattalions = await listBattalions();
  // A scoped editor gets exactly one option — their own battalion — so the battalion is
  // effectively not selectable (and the API forces it server-side regardless).
  const battalions = scope
    ? allBattalions.filter((b) => b.id === scope.battalionId)
    : isBrigade(role)
    ? allBattalions
    : allBattalions.filter((b) => b.code === battalionCodeOf(role));
  // Which battalion the form defaults to. Resolved within the active brigade; with no
  // brigade there is simply no default, never another brigade's battalion.
  const defaultBrigadeId = await activeBrigadeId();
  const defaultBattalion = scope
    ? scope.battalionId
    : isBrigade(role) || defaultBrigadeId === null
    ? undefined
    : (await getBattalionByCode(battalionCodeOf(role) ?? "", defaultBrigadeId))?.id;

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">דרישת הסמכה חדשה</h1>
      <RequestForm battalions={battalions.length ? battalions : allBattalions} defaultBattalionId={defaultBattalion} />
    </div>
  );
}
