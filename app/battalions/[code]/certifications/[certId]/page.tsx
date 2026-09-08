import Link from "next/link";
import { UNLIMITED_SEATS } from "@/lib/battalions/action-band";
import { notFound } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { getBattalionByCode } from "@/lib/db/repositories/battalions";
import { getCertificationById, listPrerequisites } from "@/lib/db/repositories/certifications";
import {
  getBattalionQuotaUsage,
  listRosterForBattalionCertification,
} from "@/lib/db/repositories/roster";
import { getCurrentUser } from "@/lib/auth/user";
import { canEditBattalion } from "@/lib/auth/permissions";
import { getBattalionScope } from "@/lib/auth/scope";
import { CertificationStatusBadge } from "@/components/certifications/status-badge";
import { DateRange } from "@/components/ui/date-range";
import { BattalionRosterPanel } from "@/components/battalions/battalion-roster-panel";
import { getWeekNumber, getHebrewDayRangeLabel } from "@/lib/utils/dates";
import { RegistrationLockCountdown } from "@/components/certifications/registration-lock-countdown";

export const dynamic = "force-dynamic";

/**
 * A certification as one battalion sees it: the brigade's dates and location, that
 * battalion's allocation, and that battalion's soldiers — nobody else's. This is the entry
 * point for a battalion-scoped role, who cannot open the הסמכות section at all, and it is
 * where an `editor_battalion` registers soldiers up to its allocation.
 */
export default async function BattalionCertificationPage({
  params,
}: {
  params: Promise<{ code: string; certId: string }>;
}) {
  const { code, certId } = await params;
  const battalion = await getBattalionByCode(code);
  if (!battalion) notFound();

  // The code in the URL is user-supplied: a scoped user may only ever open their own
  // battalion's view of a certification.
  const scope = await getBattalionScope();
  if (scope && scope.battalionId !== battalion.id) notFound();

  const certification = await getCertificationById(Number(certId));
  if (!certification) notFound();

  const [me, entries, quota, prerequisites] = await Promise.all([
    getCurrentUser(),
    listRosterForBattalionCertification(certification.id, battalion.id),
    getBattalionQuotaUsage(certification.id, battalion.id),
    listPrerequisites(certification.id),
  ]);
  // `editor_battalion` for their own battalion, or any global editor/admin.
  const canEdit = canEditBattalion(me, battalion.id);
  // One render instant, shared by the countdown seed and anything else time-dependent.
  const renderedAt = new Date();

  const openToAll = quota.mode === "open_to_all";
  // Three distinct states behind one nullable number: an unlimited pool, a real count, and
  // "this battalion was given no allocation". Collapsing the first and third into "—" is
  // what made an open cycle look like one the battalion had been left out of.
  const unlimited = quota.allocated === null && !quota.missing_quota;
  const poolLabel = unlimited ? UNLIMITED_SEATS : (quota.allocated ?? "—");
  const freeLabel = unlimited ? UNLIMITED_SEATS : (quota.remaining ?? "—");

  return (
    <div className="space-y-6">
      <Link
        href={`/battalions/${battalion.code}`}
        className="text-sm text-muted-foreground hover:underline inline-flex items-center gap-1"
      >
        <ArrowRight className="size-4" />
        {battalion.name}
      </Link>

      <div className="space-y-1">
        <div className="flex items-center gap-3 flex-wrap">
          <h1 className="text-2xl font-bold">{certification.name}</h1>
          <CertificationStatusBadge status={certification.status} />
        </div>
        <p className="text-muted-foreground text-sm">
          {certification.domain ?? "ללא תחום"} · {certification.location ?? "ללא מיקום"}
        </p>
        <p className="text-sm flex items-center gap-2 flex-wrap">
          <DateRange start={certification.start_date} end={certification.end_date} />
          <span className="text-xs text-muted-foreground">
            שבוע {getWeekNumber(certification.start_date)} ·{" "}
            {getHebrewDayRangeLabel(certification.start_date, certification.end_date)}
          </span>
        </p>
      </div>

      {/* Only this battalion's numbers in Mode B: the brigade-wide headcount would disclose
          the other units' participation by arithmetic. On an open-to-all cycle the pool IS
          brigade-wide, so the shared figures are the honest ones to show. */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
        <div className="rounded-lg p-3 bg-teal-50 border border-teal-200">
          {/* The pool has two different meanings, so it gets two different labels — calling
              a shared brigade pool "הוקצו לגדוד" would claim seats nobody reserved. */}
          <div className="text-teal-700 font-medium">
            {openToAll ? "מקומות בהסמכה (לכלל הגדודים)" : "הוקצו לגדוד"}
          </div>
          <div className="text-xl font-bold text-teal-900">{poolLabel}</div>
        </div>
        <div className="rounded-lg p-3 bg-blue-50 border border-blue-200">
          <div className="text-blue-700 font-medium">{openToAll ? "שובצו (כלל הגדודים)" : "שובצו"}</div>
          <div className="text-xl font-bold text-blue-900">
            {quota.used}
            {quota.allocated !== null ? ` / ${quota.allocated}` : ""}
          </div>
        </div>
        <div
          className={`rounded-lg p-3 border ${
            quota.remaining === null || quota.remaining > 0
              ? "bg-amber-50 border-amber-200"
              : "bg-card"
          }`}
        >
          <div className="font-medium text-muted-foreground">מקומות פנויים</div>
          {/* NULL is unlimited, not unknown. "—" is reserved for the Mode-B case where this
              battalion holds no allocation at all, which is a different fact. */}
          <div className="text-xl font-bold">{freeLabel}</div>
        </div>
        <div className="rounded-lg p-3 bg-amber-50 border border-amber-200">
          <div className="text-amber-700 font-medium">עתודה</div>
          <div className="text-xl font-bold text-amber-900">{quota.reserve}</div>
        </div>
      </div>

      {prerequisites.length > 0 && (
        <p className="text-sm">
          <span className="font-semibold">דרישות קדם: </span>
          {prerequisites.map((p) => p.description).join(", ")}
        </p>
      )}

      {/* The battalion-facing countdown. `quota` carries the certification's single lock
          (date + hour) — the same moment every battalion is held to — so this is the shared
          deadline seen from here, not a per-battalion one. The component renders its own
          closed state once the moment passes, so it is not gated on `!quota.locked`; the
          older date-only line was, and simply vanished at the deadline. */}
      <RegistrationLockCountdown lock={quota} serverNowMs={renderedAt.getTime()} />

      {/* Free-text notes routinely name other units ("גדוד 6228: 2 מקומות בעתודה"), so they
          are brigade-side information and stay out of a scoped user's copy of the page. */}
      {!scope && certification.notes && (
        <p className="text-sm text-muted-foreground">{certification.notes}</p>
      )}

      <BattalionRosterPanel
        battalionId={battalion.id}
        certificationId={certification.id}
        entries={entries}
        quota={quota}
        canEdit={canEdit}
      />
    </div>
  );
}
