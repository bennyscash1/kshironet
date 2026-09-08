import Link from "next/link";
import { listRequests } from "@/lib/db/repositories/requests";
import { listBattalions } from "@/lib/db/repositories/battalions";
import { listGapAggregate } from "@/lib/db/repositories/certification-gaps";
import {
  listCertificationFamilies,
  listComputedGaps,
} from "@/lib/db/repositories/gaps";
import { computeGapRow } from "@/lib/gaps/compute";
import { groupByBattalion, groupByRequestType } from "@/lib/gaps/groupings";
import { displayFamilyForGap } from "@/lib/gaps/families";
import { getCurrentRole } from "@/lib/auth/current-role";
import { getCurrentUser } from "@/lib/auth/user";
import {
  battalionCodeOf,
  canManageCertifications,
  canEdit,
  canEditBattalion,
  isBrigade,
} from "@/lib/auth/permissions";
import { getBattalionScope } from "@/lib/auth/scope";
import { RequestStatusBadge } from "@/components/certifications/status-badge";
import {
  GapGroupsTabs,
  GapTabProvider,
} from "@/components/requests/gap-groups-tabs";
import { EstablishmentGapsWidget } from "@/components/requests/establishment-gaps-widget";
import { RequestsExportActions, REQUESTS_PAGE_CONTENT_ID } from "@/components/requests/requests-export-actions";
import { DeleteRequestButton } from "@/components/requests/delete-request-button";
import { URGENCY_LABELS, type Urgency } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function RequestsPage() {
  const role = await getCurrentRole();
  const me = await getCurrentUser();
  // A battalion-scoped role may edit (create requests) only within its own battalion;
  // global roles keep the existing canEdit() behaviour untouched.
  const scope = await getBattalionScope();
  const canEditData = scope ? canEditBattalion(me, scope.battalionId) : canEdit(me);
  // The scope comes from the authenticated user's row, so it overrides the cookie-based
  // view selector rather than trusting it.
  const battalionCode = scope
    ? scope.code
    : isBrigade(role)
    ? undefined
    : battalionCodeOf(role) ?? undefined;
  const requests = await listRequests({ battalionCode });
  const allBattalions = await listBattalions();
  // The map is handed to a client component (the export actions), so under a scope it
  // must hold their battalion only — otherwise every unit's name ships with the page.
  const battalions = scope
    ? allBattalions.filter((b) => b.id === scope.battalionId)
    : allBattalions;
  const battalionMap = new Map(battalions.map((b) => [b.id, b]));
  // "פערי הסמכות ביחס לשיבוץ": ONE query for both tab groupings — no per-battalion or
  // per-type follow-up. A scoped role's aggregate is filtered to their own battalion in
  // SQL, from their authenticated row rather than the `active_role` cookie, so the other
  // units are absent from the payload and from the Excel/PDF exports, not merely hidden.
  const gapAggregate = await listGapAggregate(scope?.battalionId);
  const gapsByBattalion = groupByBattalion(gapAggregate);
  const gapsByRequestType = groupByRequestType(gapAggregate);
  const [computedRows, families] = scope
    ? await Promise.all([listComputedGaps(scope.battalionId), listCertificationFamilies()])
    : [[], []];
  const establishmentRows = computedRows.map((r) => {
    const fam = displayFamilyForGap(r.family_id, r.template_domain, families);
    return {
      ...r,
      familyId: fam?.id ?? null,
      family_id: fam?.id ?? null,
      ...computeGapRow(r.required_count, r.held_count),
    };
  });

  return (
    <GapTabProvider>
    <div className="space-y-6">
      <RequestsExportActions
        byBattalion={gapsByBattalion}
        byRequestType={gapsByRequestType}
        requests={requests}
        battalionMap={battalionMap}
      />

      <div id={REQUESTS_PAGE_CONTENT_ID} className="space-y-6 bg-background">
        {/* `data-pdf-atomic` sits on the leaves, not on this wrapper: the PDF exporter
            collects every marked node under the container, so a marked ancestor would
            capture its marked children a second time. The tab strip is deliberately
            outside every marked block, which is what keeps it out of the PDF. */}
        <div className="space-y-2">
          <div data-pdf-atomic className="flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo228.png" alt="חטיבה 228" className="h-10 w-auto" />
            <h1 className="text-2xl font-bold">פערי הסמכות ביחס לשיבוץ</h1>
          </div>
          {/* Grouped views of the same gap figures, replacing the mostly-zero matrix.
              Read-only: gap counts are brigade-owned, and a scoped role never edits them
              (the write endpoint refuses them anyway — their one write is a request). */}
          <GapGroupsTabs
            byBattalion={gapsByBattalion}
            byRequestType={gapsByRequestType}
          />
          {scope && (
            <div data-pdf-atomic>
              <EstablishmentGapsWidget rows={establishmentRows} families={families} />
            </div>
          )}
        </div>

        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold">דרישות גדודים</h2>
          {canEditData && (
            <Button asChild className="no-print">
              <Link href="/requests/new">
                <Plus className="size-4" />
                דרישה חדשה
              </Link>
            </Button>
          )}
        </div>
        <div className="space-y-2">
          {requests.map((r) => (
            <div
              key={r.id}
              data-pdf-atomic
              className="relative rounded-lg border-e-4 bg-card shadow-sm hover:shadow-md transition-shadow"
              style={{ borderInlineEndColor: battalionMap.get(r.battalion_id)?.color_hex }}
            >
              <Link href={`/requests/${r.id}`} className="block p-3 pe-12">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <span className="font-medium">
                    <span
                      className="font-bold"
                      style={{ color: battalionMap.get(r.battalion_id)?.color_hex }}
                    >
                      {battalionMap.get(r.battalion_id)?.name}
                    </span>
                    {" · "}
                    {r.requested_cert_type} ({r.quantity_needed})
                  </span>
                  <RequestStatusBadge status={r.status} />
                </div>
                <p className="text-sm text-muted-foreground mt-1">
                  דחיפות: {URGENCY_LABELS[r.urgency as Urgency]} · נפתחה{" "}
                  {new Date(r.created_at).toLocaleDateString("he-IL")}
                </p>
              </Link>
              {/* Deleting a request is a brigade action. A scoped editor's one write is
                  SUBMITTING a request for their own battalion — and `role` here comes from
                  the view-selector cookie, so it cannot be part of that decision. */}
              {!scope && canManageCertifications(role) && canEditData && (
                <div className="absolute top-1.5 left-1.5 no-print">
                  <DeleteRequestButton
                    requestId={r.id}
                    requestName={`${battalionMap.get(r.battalion_id)?.name ?? ""} · ${r.requested_cert_type}`}
                  />
                </div>
              )}
            </div>
          ))}
          {requests.length === 0 && (
            <p data-pdf-atomic className="text-muted-foreground text-sm">
              אין דרישות עדיין.
            </p>
          )}
        </div>
      </div>
    </div>
    </GapTabProvider>
  );
}
