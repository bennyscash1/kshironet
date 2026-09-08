import { notFound } from "next/navigation";
import { getRequest } from "@/lib/db/repositories/requests";
import { listByRequest } from "@/lib/db/repositories/request-soldiers";
import { getBattalionById } from "@/lib/db/repositories/battalions";
import { listCertifications } from "@/lib/db/repositories/certifications";
import { getCurrentRole } from "@/lib/auth/current-role";
import { getCurrentUser } from "@/lib/auth/user";
import { canApproveRequests, canEdit } from "@/lib/auth/permissions";
import { getBattalionScope } from "@/lib/auth/scope";
import { RequestStatusBadge } from "@/components/certifications/status-badge";
import { RequestActionsPanel } from "@/components/requests/request-actions-panel";
import { RequestSoldiersSection } from "@/components/requests/request-soldiers-section";
import { StatusHistoryTimeline } from "@/components/audit/status-history-timeline";
import { URGENCY_LABELS, type Urgency } from "@/lib/types";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function RequestDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const request = await getRequest(Number(id));
  if (!request) notFound();

  // Another battalion's request is not theirs to open — the id in the URL is
  // user-supplied, so filtering the list page is not a boundary.
  const scope = await getBattalionScope();
  if (scope && scope.battalionId !== request.battalion_id) notFound();

  const battalion = await getBattalionById(request.battalion_id);
  const role = await getCurrentRole();
  const me = await getCurrentUser();
  const openCerts = await listCertifications({ status: "open" });
  const soldiers = await listByRequest(request.id);

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold">
          {request.requested_cert_type} · {request.quantity_needed} חיילים
        </h1>
        <p className="text-muted-foreground text-sm" style={{ color: battalion?.color_hex }}>
          {battalion?.name}
        </p>
      </div>

      <div className="flex items-center gap-2">
        <span className="text-sm text-muted-foreground">סטטוס:</span>
        <RequestStatusBadge status={request.status} />
        <span className="text-sm text-muted-foreground">· דחיפות: {URGENCY_LABELS[request.urgency as Urgency]}</span>
      </div>

      {request.reason && (
        <div>
          <h2 className="text-sm font-semibold text-muted-foreground">סיבה / פער מבצעי</h2>
          <p className="text-sm">{request.reason}</p>
        </div>
      )}
      {request.desired_date && (
        <p className="text-sm">תאריך רצוי: {request.desired_date}</p>
      )}
      {request.notes && <p className="text-sm text-muted-foreground">{request.notes}</p>}

      {request.linked_certification_id && (
        <p className="text-sm">
          משויכת להסמכה:{" "}
          <Link className="underline" href={`/certifications/${request.linked_certification_id}`}>
            צפייה בהסמכה
          </Link>
        </p>
      )}

      {canApproveRequests(role) && canEdit(me) && (
        <RequestActionsPanel request={request} openCertifications={openCerts} />
      )}

      <RequestSoldiersSection
        requestId={request.id}
        soldiers={soldiers}
        battalionId={request.battalion_id}
        canEdit={canEdit(me)}
      />

      <div className="space-y-2">
        <h2 className="text-lg font-semibold">היסטוריה</h2>
        <StatusHistoryTimeline entityType="battalion_request" entityId={request.id} />
      </div>
    </div>
  );
}
