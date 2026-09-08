import Link from "next/link";
import { notFound } from "next/navigation";
import {
  getCertificationById,
  listPrerequisites,
  listQuotas,
  listTaxes,
} from "@/lib/db/repositories/certifications";
import { listReserveForCertification, listRosterForCertification } from "@/lib/db/repositories/roster";
import { listByCertification as listCertificationFiles } from "@/lib/db/repositories/certification-files";
import { withSignedUrls } from "@/lib/storage/certification-files";
import { getBattalionByCode, listBattalions } from "@/lib/db/repositories/battalions";
import { getCurrentRole } from "@/lib/auth/current-role";
import { getCurrentUser } from "@/lib/auth/user";
import {
  battalionCodeOf,
  canManageCertifications,
  canEdit,
  canManageAnyRoster,
  canManageCertificationStatus,
  canManageRosterEntry,
  isBrigade,
} from "@/lib/auth/permissions";
import { QuotaRegistrationPanel } from "@/components/certifications/quota-registration-panel";
import { Button } from "@/components/ui/button";
import { DateRange } from "@/components/ui/date-range";
import { RosterTable } from "@/components/roster/roster-table";
import { CopyRosterButton } from "@/components/roster/copy-roster-button";
import { CertificationStatusChanger } from "@/components/certifications/status-changer";
import { DeleteCertificationButton } from "@/components/certifications/delete-certification-button";
import { ConfirmCompletionPanel } from "@/components/certifications/confirm-completion-panel";
import { StatusHistoryTimeline } from "@/components/audit/status-history-timeline";
import { TaxList } from "@/components/certifications/tax-list";
import { CertificationFiles } from "@/components/certifications/certification-files";
import { getWeekNumber, getHebrewDayRangeLabel } from "@/lib/utils/dates";
import { isRegistrationLocked } from "@/lib/utils/registration-lock";
import { Pencil, Plus, Printer } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function CertificationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const cert = await getCertificationById(Number(id));
  if (!cert) notFound();

  const [prerequisites, quotas, taxes, roster, reserve, battalions, role, me, fileRows] =
    await Promise.all([
      listPrerequisites(cert.id),
      listQuotas(cert.id),
      listTaxes(cert.id),
      listRosterForCertification(cert.id),
      listReserveForCertification(cert.id),
      listBattalions(),
      getCurrentRole(),
      getCurrentUser(),
      listCertificationFiles(cert.id),
    ]);
  // Signed URLs are generated server-side per request and never persisted. A storage
  // hiccup must not take the page down, so fall back to listing files without links.
  const files = await withSignedUrls(fileRows).catch(() =>
    fileRows.map((f) => ({ ...f, signed_url: null }))
  );
  // One instant for the whole render, so the lock state and the countdown seed cannot be
  // taken a few milliseconds apart and disagree about an hour boundary.
  const renderedAt = new Date();
  // Certification-level actions (quotas, taxes, completion, delete) keep their existing
  // cookie-scoped gate — out of scope here.
  const canManage = canManageCertifications(role) && canEdit(me);
  // The STATUS control is gated on the authenticated session alone, so a brigade user
  // previewing a battalion keeps their own capability instead of silently losing the
  // button. Same predicate the PATCH route runs.
  const canChangeStatus = canManageCertificationStatus(me);
  const canEditData = canEdit(me);
  // Roster writes have their own permission now, so a battalion editor gets the add/edit/
  // delete affordances for their own soldiers. `canManage` above still governs everything
  // that belongs to the certification itself — quotas, taxes, status, completion — and is
  // untouched, which is what keeps certification management brigade-only.
  const canAddRoster = canManageAnyRoster(me);
  // Resolved here, on the server, from the one roster permission — the table only renders
  // what this says. null = every battalion (brigade HQ).
  const manageableBattalionIds = canEdit(me)
    ? null
    : battalions.filter((b) => canManageRosterEntry(me, b.id)).map((b) => b.id);
  const battalionMap = new Map(battalions.map((b) => [b.id, b]));

  // The caller's own battalion (from the view-scope cookie), used to show that
  // battalion its trainee-approval action. null for brigade or non-editors.
  const myBattalion = !isBrigade(role) ? await getBattalionByCode(battalionCodeOf(role) ?? "") : null;
  const myBattalionId = canEditData && myBattalion ? myBattalion.id : null;

  const today = new Date().toISOString().slice(0, 10);
  const pendingStatuses = ["registered", "pending_approval", "approved"];
  const showConfirmPanel =
    canManage &&
    (cert.end_date || cert.start_date) <= today &&
    cert.status !== "completed" &&
    cert.status !== "cancelled" &&
    roster.some((r) => pendingStatuses.includes(r.status));

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">{cert.name}</h1>
          <p className="text-muted-foreground text-sm">
            {cert.domain ?? "ללא תחום"} · {cert.location ?? "ללא מיקום"}
          </p>
          <p className="text-sm mt-1 flex items-center gap-2">
            <DateRange start={cert.start_date} end={cert.end_date} />
            <span className="text-xs text-muted-foreground">
              שבוע {getWeekNumber(cert.start_date)} · {getHebrewDayRangeLabel(cert.start_date, cert.end_date)}
            </span>
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" asChild>
            <Link href={`/certifications/${cert.id}/print`} target="_blank">
              <Printer className="size-4" />
              ייצוא רשימה
            </Link>
          </Button>
          {canManage && (
            <>
              <Button variant="outline" asChild>
                <Link href={`/certifications/${cert.id}/edit`}>
                  <Pencil className="size-4" />
                  עריכה
                </Link>
              </Button>
              <DeleteCertificationButton certificationId={cert.id} certificationName={cert.name} />
            </>
          )}
        </div>
      </div>

      <CertificationStatusChanger certification={cert} canManage={canChangeStatus} />

      {/* A טיוטה looks identical to an open certification on this page apart from one small
          badge, and 65 of the existing drafts already carry roster entries a brigade user
          added — so nothing on screen said the battalions still could not reach it. Display
          only: it reads the stored status and changes nothing. */}
      {cert.status === "draft" && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          <span className="font-bold">ההסמכה נמצאת בסטטוס „טיוטה“.</span>{" "}
          הגדודים אינם יכולים לשבץ אליה חיילים כל עוד היא בטיוטה.{" "}
          {canChangeStatus
            ? "לחיצה על „פתח להרשמה“ למעלה תפתח אותה לשיבוץ ותשלח התראה לגדודים."
            : "פתיחת ההסמכה להרשמה מתבצעת על ידי מנהל חטיבתי."}
        </div>
      )}

      {showConfirmPanel && (
        <ConfirmCompletionPanel
          certificationId={cert.id}
          roster={roster.filter((r) => pendingStatuses.includes(r.status))}
          battalionMap={battalionMap}
        />
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 text-sm">
        <div className="rounded-lg p-3 bg-blue-50 border border-blue-200">
          <div className="text-blue-700 font-medium">רשומים</div>
          <div className="text-xl font-bold text-blue-900">
            {cert.registered_count}
            {cert.slots_remaining !== null ? ` / ${cert.total_slots}` : ""}
          </div>
        </div>
        <div className="rounded-lg p-3 bg-violet-50 border border-violet-200">
          <div className="text-violet-700 font-medium">דרישות קדם</div>
          <div className="text-violet-900">
            {prerequisites.length > 0
              ? prerequisites.map((p) => p.description).join(", ")
              : "אין"}
          </div>
        </div>
        <div className="rounded-lg p-3 bg-teal-50 border border-teal-200">
          <div className="text-teal-700 font-medium">הקצאה לפי גדוד</div>
          <div className="text-teal-900">
            {quotas.length > 0
              ? quotas
                  .map((q) => `${battalionMap.get(q.battalion_id)?.name}: ${q.allocated_slots}`)
                  .join(" · ")
              : "אין הקצאה קבועה"}
          </div>
        </div>
        <div className="rounded-lg p-3 bg-amber-50 border border-amber-200">
          <div className="text-amber-700 font-medium mb-1">מיסים</div>
          <TaxList taxes={taxes} canManage={canManage} />
        </div>
      </div>

      {cert.notes && <p className="text-sm text-muted-foreground">{cert.notes}</p>}

      {/* The lock is a date + hour moment (migration 022). `locked` is decided here, on the
          server, against the same moment the write endpoints enforce — the client is given
          the answer rather than recomputing it. `serverNowMs` seeds the countdown so its
          first client render matches this one. */}
      <QuotaRegistrationPanel
        certificationId={cert.id}
        quotas={quotas}
        battalions={battalions}
        canManage={canManage}
        myBattalionId={myBattalionId}
        lock={cert}
        locked={isRegistrationLocked(cert, renderedAt)}
        serverNowMs={renderedAt.getTime()}
      />

      <div className="space-y-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <h2 className="text-lg font-semibold">רשימת חיילים</h2>
          <div className="flex items-center gap-2">
            {/* Copying is a read of what is already on screen, so it is not gated on
                `canEditData` — a viewer forwarding the list is the main use for it.
                `roster` only: the עתודה table below is a separate array and stays out. */}
            <CopyRosterButton
              certificationName={cert.name}
              entries={roster}
              battalions={battalions}
            />
            {canAddRoster && (
              <Button size="sm" asChild>
                <Link href={`/certifications/${cert.id}/roster/new`}>
                  <Plus className="size-4" />
                  הוסף חייל
                </Link>
              </Button>
            )}
          </div>
        </div>
        <RosterTable
          certificationId={cert.id}
          certificationName={cert.name}
          entries={roster}
          battalions={battalions}
          manageableBattalionIds={manageableBattalionIds}
        />
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-amber-700">עתודה</h2>
          {canAddRoster && (
            <Button size="sm" variant="outline" className="border-amber-300 text-amber-700" asChild>
              <Link href={`/certifications/${cert.id}/roster/new?reserve=1`}>
                <Plus className="size-4" />
                הוסף לעתודה
              </Link>
            </Button>
          )}
        </div>
        {reserve.length > 0 ? (
          <RosterTable
            certificationId={cert.id}
            certificationName={cert.name}
            entries={reserve}
            battalions={battalions}
            manageableBattalionIds={manageableBattalionIds}
          />
        ) : (
          <p className="text-sm text-muted-foreground">אין אנשי עתודה רשומים.</p>
        )}
      </div>

      {/* Attachments are managed inline here — the shared component owns the heading,
          the list, the upload control and the delete flow, so this page and the edit
          page behave identically. Editors upload without leaving the detail page;
          everyone else still sees the list, read-only. */}
      <CertificationFiles certificationId={cert.id} files={files} canManage={canEditData} />

      <div className="space-y-2">
        <h2 className="text-lg font-semibold">היסטוריה</h2>
        <StatusHistoryTimeline entityType="certification" entityId={cert.id} />
      </div>
    </div>
  );
}
